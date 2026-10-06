//! Port of packages/pickier/src/lexer.ts: one lexical pass over JS/TS source
//! that tells code from comment, string, template and regex content.
//!
//! - `lexSource` returns the same regions and outermost templates as the
//!   TypeScript `lexSource`, with offsets into the text it was given.
//! - `maskSource` (`maskComments`, `maskNonCode`) blanks the chosen regions.
//! - `lineStartsInTemplate` says which lines begin inside a template body.
//!
//! Every function takes either UTF-8 bytes (`[]const u8`, offsets are byte
//! offsets) or UTF-16 code units (`[]const u16`, offsets are JavaScript
//! indices). The lexing decisions are the same either way.
//!
//! Masking keeps what the TypeScript mask keeps: each blanked UTF-16 unit
//! becomes one space and line breaks stay. On UTF-16 input the mask is the
//! same length as the text, as in TypeScript. On UTF-8 input a blanked
//! character becomes as many spaces as it has UTF-16 units - one for most,
//! two outside the BMP - so the UTF-16 column of everything after it is
//! unchanged (use text.utf16Index on the masked line), while its byte offsets
//! shift wherever non-ASCII text was blanked.

const std = @import("std");

pub const RegionKind = enum { comment, string, template, regex };

pub const Region = struct {
    kind: RegionKind,
    /// Offset of the first content character, after any opening delimiter
    start: usize,
    /// Offset just past the last content character, before any closing delimiter
    end: usize,
};

pub const LexResult = struct {
    /// Non-code regions in source order; template regions are body text only
    regions: []Region,
    /// Outermost template literals as `[openingBacktick, closingBacktick]`;
    /// an unterminated one ends at the end of the text
    templates: [][2]usize,
};

pub const MaskOptions = struct {
    comments: bool = false,
    strings: bool = false,
    templates: bool = false,
    regex: bool = false,
};

/// Keywords after which a `/` opens a pattern rather than dividing.
const regex_after_word = [_][]const u8{ "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await", "throw" };

fn Text(comptime T: type) type {
    comptime std.debug.assert(T == u8 or T == u16);
    return struct {
        /// The character at `i`: its code (a UTF-16 unit, or the decoded code
        /// point for UTF-8 - only compared against `0xA0` and ASCII) and its
        /// length in elements.
        fn charAt(text: []const T, i: usize) struct { code: u32, len: usize } {
            const c = text[i];
            if (T == u16 or c < 0x80) return .{ .code = c, .len = 1 };
            const len = std.unicode.utf8ByteSequenceLength(c) catch return .{ .code = 0xFFFD, .len = 1 };
            if (i + len > text.len) return .{ .code = 0xFFFD, .len = 1 };
            const cp = std.unicode.utf8Decode(text[i .. i + len]) catch return .{ .code = 0xFFFD, .len = 1 };
            return .{ .code = cp, .len = len };
        }

        /// `isWordCode`: ASCII letters, digits, `_`, `$`, or any code from U+00A0 up.
        fn isWordCode(code: u32) bool {
            return (code >= 'a' and code <= 'z') or (code >= 'A' and code <= 'Z') or (code >= '0' and code <= '9') or code == '_' or code == '$' or code >= 0xA0;
        }

        /// `isBreak(text[i])`; false past the end.
        fn isBreak(text: []const T, i: usize) bool {
            if (i >= text.len) return false;
            const c = text[i];
            if (c == '\n' or c == '\r') return true;
            if (T == u16) return c == 0x2028 or c == 0x2029;
            return c == 0xE2 and i + 2 < text.len and text[i + 1] == 0x80 and (text[i + 2] == 0xA8 or text[i + 2] == 0xA9);
        }

        fn at(text: []const T, i: usize) u32 {
            return if (i < text.len) text[i] else 0;
        }

        const lanes = if (T == u8) 32 else 16;
        const V = @Vector(lanes, T);
        const M = if (T == u8) u32 else u16;

        /// The first index at or after `from` holding one of `set`, or the length.
        fn findAny(text: []const T, from: usize, comptime set: []const T) usize {
            var i = from;
            while (i + lanes <= text.len) : (i += lanes) {
                const v: V = text[i..][0..lanes].*;
                var hit: M = 0;
                inline for (set) |c| hit |= @bitCast(v == @as(V, @splat(c)));
                if (hit != 0) return i + @ctz(hit);
            }
            while (i < text.len) : (i += 1) {
                inline for (set) |c| {
                    if (text[i] == c) return i;
                }
            }
            return text.len;
        }

        /// Past the ASCII word characters (`[A-Za-z0-9_$]`) from `from`, a
        /// vector at a time; the caller continues one character at a time
        /// from there.
        fn wordEnd(text: []const T, from: usize) usize {
            var i = from;
            while (i + lanes <= text.len) : (i += lanes) {
                const v: V = text[i..][0..lanes].*;
                const lower = v | @as(V, @splat(0x20));
                const alpha: M = @as(M, @bitCast(lower >= @as(V, @splat('a')))) & @as(M, @bitCast(lower <= @as(V, @splat('z'))));
                const digit: M = @as(M, @bitCast(v >= @as(V, @splat('0')))) & @as(M, @bitCast(v <= @as(V, @splat('9'))));
                const other: M = @as(M, @bitCast(v == @as(V, @splat('_')))) | @as(M, @bitCast(v == @as(V, @splat('$'))));
                const word = alpha | digit | other;
                if (word != ~@as(M, 0)) return i + @ctz(~word);
            }
            return i;
        }

        /// The next unit at or after `from` that the code loop must look at:
        /// `/`, a quote or a backtick, braces when inside `${}`, and (in
        /// UTF-8) any non-ASCII byte, which is decoded there.
        fn findCodeStop(text: []const T, from: usize, comptime braces: bool) usize {
            var i = from;
            while (i + lanes <= text.len) : (i += lanes) {
                const v: V = text[i..][0..lanes].*;
                var hit: M = @as(M, @bitCast(v == @as(V, @splat('/')))) |
                    @as(M, @bitCast(v == @as(V, @splat('\'')))) |
                    @as(M, @bitCast(v == @as(V, @splat('"')))) |
                    @as(M, @bitCast(v == @as(V, @splat('`'))));
                if (braces) hit |= @as(M, @bitCast(v == @as(V, @splat('{')))) | @as(M, @bitCast(v == @as(V, @splat('}'))));
                if (T == u8) hit |= @bitCast(v >= @as(V, @splat(0x80)));
                if (hit != 0) return i + @ctz(hit);
            }
            while (i < text.len) : (i += 1) {
                const c = text[i];
                if (c == '/' or c == '\'' or c == '"' or c == '`') return i;
                if (braces and (c == '{' or c == '}')) return i;
                if (T == u8 and c >= 0x80) return i;
            }
            return i;
        }

        /// The code loop's `last` after the run `text[from..to]`, which holds
        /// none of the units findCodeStop stops at: decided by the last token
        /// in it, or unchanged when it is all whitespace.
        fn lastTokenIsValue(text: []const T, from: usize, to: usize, last: bool) bool {
            var e = to;
            while (e > from and (text[e - 1] == ' ' or (text[e - 1] >= '\t' and text[e - 1] <= '\r'))) e -= 1;
            if (e == from) return last;
            const c = text[e - 1];
            if (c == ')' or c == ']') return true;
            if (isWordCode(c)) {
                var s = e - 1;
                while (s > from and isWordCode(text[s - 1])) s -= 1;
                return !isRegexKeyword(text[s..e]);
            }
            return false;
        }

        /// The units that may start a line break.
        const break_starts: []const T = if (T == u8) &.{ '\n', '\r', 0xE2 } else &.{ '\n', '\r', 0x2028, 0x2029 };

        /// The first line break at or after `from`, or the length.
        fn findBreak(text: []const T, from: usize) usize {
            var i = from;
            while (true) {
                i = findAny(text, i, break_starts);
                if (i >= text.len or isBreak(text, i)) return i;
                i += 1;
            }
        }

        /// Offset just past a regex literal opening at `start`, or null when
        /// no closing slash follows on its line.
        fn regexEnd(text: []const T, start: usize) ?usize {
            var index = start + 1;
            var in_class = false;
            while (index < text.len) {
                const ch = text[index];
                if (isBreak(text, index)) return null;
                if (ch == '\\') {
                    if (isBreak(text, index + 1)) return null;
                    index += 2;
                    continue;
                }
                if (in_class) {
                    if (ch == ']') in_class = false;
                } else if (ch == '[') {
                    in_class = true;
                } else if (ch == '/') {
                    index += 1;
                    while (index < text.len) {
                        const c = charAt(text, index);
                        if (!isWordCode(c.code)) break;
                        index += c.len;
                    }
                    return index;
                }
                index += 1;
            }
            return null;
        }

        fn lex(allocator: std.mem.Allocator, text: []const T) !LexResult {
            var regions: std.ArrayList(Region) = .empty;
            var templates: std.ArrayList([2]usize) = .empty;
            const length = text.len;

            // -1 is a template body; n >= 0 a `${}` expression at brace depth n
            var frames: std.ArrayList(i64) = .empty;
            var outer_template_start: usize = 0;
            var last_value = false;
            var index: usize = 0;

            // A hashbang is a comment that only exists on the first line
            if (length >= 2 and text[0] == '#' and text[1] == '!') {
                const end = findBreak(text, 2);
                try regions.append(allocator, .{ .kind = .comment, .start = 2, .end = end });
                index = end;
            }

            while (index < length) {
                if (frames.items.len > 0 and frames.items[frames.items.len - 1] == -1) {
                    // A template body, up to its closing backtick or a `${`
                    const start = index;
                    var closed = false;
                    while (index < length) {
                        index = findAny(text, index, &.{ '\\', '`', '$' });
                        if (index >= length) break;
                        const ch = text[index];
                        if (ch == '\\') {
                            index += 2;
                            continue;
                        }
                        if (ch == '`') {
                            try regions.append(allocator, .{ .kind = .template, .start = start, .end = index });
                            _ = frames.pop();
                            if (frames.items.len == 0) try templates.append(allocator, .{ outer_template_start, index });
                            index += 1;
                            last_value = true;
                            closed = true;
                            break;
                        }
                        if (ch == '$' and at(text, index + 1) == '{') {
                            try regions.append(allocator, .{ .kind = .template, .start = start, .end = index });
                            try frames.append(allocator, 0);
                            index += 2;
                            last_value = false;
                            closed = true;
                            break;
                        }
                        index += 1;
                    }
                    if (!closed) {
                        // Unterminated: the body runs to the end of the text
                        index = @min(index, length);
                        try regions.append(allocator, .{ .kind = .template, .start = start, .end = index });
                        frames.clearRetainingCapacity();
                        try templates.append(allocator, .{ outer_template_start, length });
                    }
                    continue;
                }

                // Up to the next character that can open a region (or, inside
                // `${}`, change its depth), only the last token matters: it
                // decides whether a `/` divides.
                {
                    const stop = if (frames.items.len > 0) findCodeStop(text, index, true) else findCodeStop(text, index, false);
                    if (stop > index) {
                        last_value = lastTokenIsValue(text, index, stop, last_value);
                        index = stop;
                        if (index >= length) break;
                    }
                }

                const ch = text[index];
                const next = at(text, index + 1);

                if (ch == '/' and next == '/') {
                    const end = findBreak(text, index + 2);
                    try regions.append(allocator, .{ .kind = .comment, .start = index + 2, .end = end });
                    index = end;
                    continue;
                }

                if (ch == '/' and next == '*') {
                    // `text.indexOf('*/', index + 2)`
                    var close: ?usize = null;
                    var p = index + 2;
                    while (p < length) : (p += 1) {
                        p = findAny(text, p, &.{'*'});
                        if (p + 1 < length and text[p + 1] == '/') {
                            close = p;
                            break;
                        }
                    }
                    const end = close orelse length;
                    try regions.append(allocator, .{ .kind = .comment, .start = index + 2, .end = end });
                    index = if (close) |c| c + 2 else length;
                    continue;
                }

                if (ch == '\'' or ch == '"') {
                    const start = index + 1;
                    var end = start;
                    while (end < length) {
                        end = findAny(text, end, &[_]T{ '\'', '"', '\\' } ++ break_starts);
                        if (end >= length) break;
                        const c = text[end];
                        if (c == '\\') {
                            // An escaped line break continues the string; \r\n is one break
                            end += if (at(text, end + 1) == '\r' and at(text, end + 2) == '\n') 3 else 2;
                            continue;
                        }
                        if (c == ch or isBreak(text, end)) break;
                        end += 1;
                    }
                    end = @min(end, length);
                    try regions.append(allocator, .{ .kind = .string, .start = start, .end = end });
                    index = if (end < length and text[end] == ch) end + 1 else end;
                    last_value = true;
                    continue;
                }

                if (ch == '`') {
                    if (frames.items.len == 0) outer_template_start = index;
                    try frames.append(allocator, -1);
                    index += 1;
                    continue;
                }

                if (ch == '/') {
                    const end = if (!last_value) regexEnd(text, index) else null;
                    if (end) |e| {
                        // The pattern's body, without its delimiters or flags
                        var close = e;
                        while (close > index and text[close - 1] != '/') close -= 1;
                        try regions.append(allocator, .{ .kind = .regex, .start = index + 1, .end = close - 1 });
                        index = e;
                        last_value = true;
                        continue;
                    }
                    index += 1;
                    last_value = false;
                    continue;
                }

                if (frames.items.len > 0) {
                    const top = &frames.items[frames.items.len - 1];
                    if (ch == '{') {
                        top.* += 1;
                        index += 1;
                        last_value = false;
                        continue;
                    }
                    if (ch == '}') {
                        if (top.* > 0) {
                            top.* -= 1;
                            last_value = false;
                        } else {
                            // Back into the template body that owns this expression
                            _ = frames.pop();
                        }
                        index += 1;
                        continue;
                    }
                }

                const c = charAt(text, index);
                if (isWordCode(c.code)) {
                    var end = wordEnd(text, index + c.len);
                    while (end < length) {
                        const w = charAt(text, end);
                        if (!isWordCode(w.code)) break;
                        end += w.len;
                    }
                    last_value = !isRegexKeyword(text[index..end]);
                    index = end;
                    continue;
                }

                if (ch == ')' or ch == ']') {
                    last_value = true;
                } else if (!(ch == ' ' or (ch >= '\t' and ch <= '\r'))) {
                    // `}` included: after a block a `/` starts a statement, so a pattern
                    last_value = false;
                }
                index += c.len;
            }

            return .{ .regions = regions.items, .templates = templates.items };
        }

        fn isRegexKeyword(word: []const T) bool {
            // Every keyword is 2 to 10 lowercase letters
            if (word.len < 2 or word.len > 10 or word[0] < 'a' or word[0] > 'y') return false;
            for (regex_after_word) |kw| {
                if (word.len != kw.len) continue;
                var same = true;
                for (kw, 0..) |k, i| {
                    if (word[i] != k) {
                        same = false;
                        break;
                    }
                }
                if (same) return true;
            }
            return false;
        }

        fn wanted(options: MaskOptions, kind: RegionKind) bool {
            return switch (kind) {
                .comment => options.comments,
                .string => options.strings,
                .template => options.templates,
                .regex => options.regex,
            };
        }

        fn mask(allocator: std.mem.Allocator, text: []const T, options: MaskOptions, lexed: LexResult) ![]const T {
            if (!options.comments and !options.strings and !options.templates and !options.regex) return text;
            var out: std.ArrayList(T) = .empty;
            var from: usize = 0;
            for (lexed.regions) |region| {
                if (!wanted(options, region.kind)) continue;
                const start = @max(region.start, from);
                const end = @min(region.end, text.len);
                if (start >= end) continue;
                if (out.capacity == 0) try out.ensureTotalCapacity(allocator, text.len);
                try out.appendSlice(allocator, text[from..start]);
                try blank(allocator, &out, text[start..end]);
                from = end;
            }
            if (from == 0) return text;
            try out.appendSlice(allocator, text[from..]);
            return out.items;
        }

        /// Every UTF-16 unit as a space, except line breaks.
        fn blank(allocator: std.mem.Allocator, out: *std.ArrayList(T), s: []const T) !void {
            var i: usize = 0;
            while (i < s.len) {
                const c = s[i];
                if (T == u16) {
                    try out.append(allocator, if (c == '\n' or c == '\r' or c == 0x2028 or c == 0x2029) c else ' ');
                    i += 1;
                    continue;
                }
                if (c < 0x80) {
                    try out.append(allocator, if (c == '\n' or c == '\r') c else ' ');
                    i += 1;
                    continue;
                }
                if (isBreak(s, i)) {
                    try out.appendSlice(allocator, s[i .. i + 3]);
                    i += 3;
                    continue;
                }
                const ch = charAt(s, i);
                try out.appendNTimes(allocator, ' ', if (ch.len == 4) 2 else 1);
                i += ch.len;
            }
        }

        fn lineStarts(allocator: std.mem.Allocator, text: []const T, lexed: LexResult) ![]bool {
            var starts: std.ArrayList(usize) = .empty;
            try starts.append(allocator, 0);
            var pos: usize = 0;
            while (std.mem.indexOfScalarPos(T, text, pos, '\n')) |nl| {
                try starts.append(allocator, nl + 1);
                pos = nl + 1;
            }
            return lineStartsAt(allocator, starts.items, lexed);
        }
    };
}

fn lineStartsAt(allocator: std.mem.Allocator, starts: []const usize, lexed: LexResult) ![]bool {
    const out = try allocator.alloc(bool, starts.len);
    @memset(out, false);
    var cursor: usize = 0;
    const regions = lexed.regions;
    // Advance to the next template body
    while (cursor < regions.len and regions[cursor].kind != .template) cursor += 1;
    if (cursor >= regions.len) return out;
    for (starts, 0..) |start, line| {
        while (cursor < regions.len and regions[cursor].end < start) {
            cursor += 1;
            while (cursor < regions.len and regions[cursor].kind != .template) cursor += 1;
        }
        if (cursor >= regions.len) break;
        const body = regions[cursor];
        // Inclusive at the end: a line whose first character is the
        // closing backtick (or a `${`) still begins inside the body
        out[line] = body.start <= start and start <= body.end and start > 0;
    }
    return out;
}

/// `lineStartsInTemplate` for a caller that already knows where its lines
/// start: offset 0, then one past each `\n`, in the lexed text's units.
pub fn lineStartsInTemplateAt(allocator: std.mem.Allocator, line_starts: []const usize, lexed: LexResult) ![]bool {
    return lineStartsAt(allocator, line_starts, lexed);
}

fn Elem(comptime S: type) type {
    return std.meta.Elem(S);
}

/// Lex `text` once, returning every comment, string, template-body and regex
/// region.
pub fn lexSource(allocator: std.mem.Allocator, text: anytype) !LexResult {
    return Text(Elem(@TypeOf(text))).lex(allocator, text);
}

/// `text` with the contents of the chosen region kinds blanked. Returns
/// `text` itself when nothing was blanked.
pub fn maskSource(allocator: std.mem.Allocator, text: anytype, options: MaskOptions, lexed: LexResult) ![]const Elem(@TypeOf(text)) {
    return Text(Elem(@TypeOf(text))).mask(allocator, text, options, lexed);
}

/// Every comment's contents blanked; everything else as written.
pub fn maskComments(allocator: std.mem.Allocator, text: anytype) ![]const Elem(@TypeOf(text)) {
    const lexed = try lexSource(allocator, text);
    return maskSource(allocator, text, .{ .comments = true }, lexed);
}

/// Only code left: comments, strings, template bodies and regex patterns blanked.
pub fn maskNonCode(allocator: std.mem.Allocator, text: anytype) ![]const Elem(@TypeOf(text)) {
    const lexed = try lexSource(allocator, text);
    return maskSource(allocator, text, .{ .comments = true, .strings = true, .templates = true, .regex = true }, lexed);
}

/// For each line (split at `\n`), whether it begins inside a template-literal
/// body. A line that begins inside a `${}` expression is code.
pub fn lineStartsInTemplate(allocator: std.mem.Allocator, text: anytype, lexed: LexResult) ![]bool {
    return Text(Elem(@TypeOf(text))).lineStarts(allocator, text, lexed);
}

test "regions and masks" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const src = "const a = 'x' // é note\nlet r = /[/]'/g; `t ${`in${1}`} é`\n";
    const lexed = try lexSource(a, @as([]const u8, src));
    try std.testing.expectEqual(@as(usize, 7), lexed.regions.len);
    const masked = try maskNonCode(a, @as([]const u8, src));
    try std.testing.expectEqualStrings("const a = ' ' //       \nlet r = /    /g; `  ${`  ${1}`}  `\n", masked);
    const u = std.unicode.utf8ToUtf16LeStringLiteral;
    const m16 = try maskComments(a, @as([]const u16, u("x // 😀\ny")));
    try std.testing.expectEqualSlices(u16, u("x //   \ny"), m16);
}

test "lineStartsInTemplate" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const src: []const u8 = "const t = `a\nb ${x\n} c\n`\nd";
    const lexed = try lexSource(a, src);
    const starts = try lineStartsInTemplate(a, src, lexed);
    try std.testing.expectEqualSlices(bool, &.{ false, true, false, true, false }, starts);
}
