//! The line lexing the TypeScript built-in checks share, ported from
//! packages/pickier/src/linter.ts: `isRegexStart`, `stripRegexLiterals`,
//! `stripComments` and `scanTemplateLiteralLines` (`templateLiteralLines`),
//! plus the `content.split(/\r?\n/)` line walk.
//!
//! The TypeScript code walks UTF-16 code units; this walks UTF-8 bytes. Every
//! decision here is made on an ASCII character, and the bytes of a multi-byte
//! character are never ASCII, so a byte walk takes the same decisions - with
//! two exceptions handled explicitly: `/\s/` on a non-ASCII character, and
//! the last significant character, which is "some non-ASCII code unit".

const std = @import("std");
const text = @import("text.zig");

const Allocator = std.mem.Allocator;

/// `content.split(/\r?\n/)`, one line at a time, without allocating.
pub const LineIterator = struct {
    content: []const u8,
    pos: usize = 0,
    done: bool = false,

    pub fn next(self: *LineIterator) ?[]const u8 {
        if (self.done) return null;
        if (std.mem.indexOfScalarPos(u8, self.content, self.pos, '\n')) |nl| {
            var end = nl;
            if (end > self.pos and self.content[end - 1] == '\r') end -= 1;
            const line = self.content[self.pos..end];
            self.pos = nl + 1;
            return line;
        }
        self.done = true;
        return self.content[self.pos..];
    }
};

pub fn lines(content: []const u8) LineIterator {
    return .{ .content = content };
}

/// A character as `isRegexStart` sees its `lastSignificant` argument: an
/// ASCII character, `sig_none` for `''`, or `sig_other` for a non-ASCII code
/// unit (which matches none of its tests).
pub const Sig = u16;
pub const sig_none: Sig = 0x100;
pub const sig_other: Sig = 0x101;

pub fn sigOf(c: u8) Sig {
    return if (c < 0x80) c else sig_other;
}

/// `/[A-Za-z0-9_$]/`
fn isIdentAscii(c: u8) bool {
    return std.ascii.isAlphanumeric(c) or c == '_' or c == '$';
}

/// `isRegexStart`: whether a `/` at `line[idx]` starts a regex literal.
pub fn isRegexStart(last: Sig, line: []const u8, idx: usize) bool {
    if (last == sig_none) return true;
    if (last >= 0x80) return false;
    const c: u8 = @intCast(last);
    if (std.mem.indexOfScalar(u8, "([{,:;!?&|=<>~^+*%-", c) != null) return true;
    if (std.ascii.isAlphabetic(c) or c == '_' or c == '$') {
        // /(?:^|[^A-Za-z0-9_$])(?:return|typeof|...|case)$/ on the trimmed prefix
        const prefix = text.trimEnd(line[0..idx]);
        const keywords = [_][]const u8{ "return", "typeof", "instanceof", "new", "delete", "void", "in", "of", "yield", "await", "throw", "case" };
        for (keywords) |kw| {
            if (std.mem.endsWith(u8, prefix, kw)) {
                const at = prefix.len - kw.len;
                if (at == 0 or !isIdentAscii(prefix[at - 1])) return true;
            }
        }
    }
    return false;
}

/// `/[gimsuvy]/`
fn isRegexFlag(c: u8) bool {
    return switch (c) {
        'g', 'i', 'm', 's', 'u', 'v', 'y' => true,
        else => false,
    };
}

/// `stripRegexLiterals`: the line without its regex literals. Returns `line`
/// itself when there is no `/`, otherwise a slice of `buf`.
pub fn stripRegexLiterals(allocator: Allocator, line: []const u8, buf: *std.ArrayList(u8)) ![]const u8 {
    if (std.mem.indexOfScalar(u8, line, '/') == null) return line;
    buf.clearRetainingCapacity();
    var i: usize = 0;
    while (i < line.len) {
        if (line[i] == '/') {
            // A comment is left for stripComments
            if (i + 1 < line.len and (line[i + 1] == '/' or line[i + 1] == '*')) {
                try buf.appendSlice(allocator, line[i..]);
                return buf.items;
            }
            const before = text.trimEnd(line[0..i]);
            const last: Sig = if (before.len == 0) sig_none else sigOf(before[before.len - 1]);
            if (isRegexStart(last, line, i)) {
                i += 1;
                var in_class = false;
                while (i < line.len) {
                    const c = line[i];
                    if (c == '\\') {
                        i += 2;
                        continue;
                    }
                    if (c == '[') {
                        in_class = true;
                    } else if (c == ']') {
                        in_class = false;
                    } else if (c == '/' and !in_class) {
                        i += 1;
                        while (i < line.len and isRegexFlag(line[i])) i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        }
        try buf.append(allocator, line[i]);
        i += 1;
    }
    return buf.items;
}

/// `stripComments`: the line without `//` and `/* */` comments, keeping
/// string contents. Returns `line` itself when there is no `/`, otherwise a
/// slice of `buf`.
pub fn stripComments(allocator: Allocator, line: []const u8, buf: *std.ArrayList(u8)) ![]const u8 {
    if (std.mem.indexOfScalar(u8, line, '/') == null) return line;
    buf.clearRetainingCapacity();
    var i: usize = 0;
    // 0 outside a string, else its quote character
    var in_string: u8 = 0;
    var escaped = false;
    while (i < line.len) {
        const ch = line[i];
        if (escaped) {
            try buf.append(allocator, ch);
            escaped = false;
            i += 1;
            continue;
        }
        if (ch == '\\' and in_string != 0) {
            escaped = true;
            try buf.append(allocator, ch);
            i += 1;
            continue;
        }
        if (in_string == 0) {
            if (ch == '"' or ch == '\'' or ch == '`') {
                in_string = ch;
                try buf.append(allocator, ch);
                i += 1;
                continue;
            }
            const next: u8 = if (i + 1 < line.len) line[i + 1] else 0;
            if (ch == '/' and next == '/') break;
            if (ch == '/' and next == '*') {
                i += 2;
                while (i < line.len) {
                    if (line[i] == '*' and i + 1 < line.len and line[i + 1] == '/') {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                // A space keeps the words on either side apart
                try buf.append(allocator, ' ');
                continue;
            }
            try buf.append(allocator, ch);
            i += 1;
        } else {
            if (ch == in_string) in_string = 0;
            try buf.append(allocator, ch);
            i += 1;
        }
    }
    return buf.items;
}

/// Byte length of the character at `i`, as `text.utf16Len` decodes it.
pub fn charLen(s: []const u8, i: usize) usize {
    const b = s[i];
    if (b < 0x80) return 1;
    const len = std.unicode.utf8ByteSequenceLength(b) catch return 1;
    if (i + len > s.len) return 1;
    _ = std.unicode.utf8Decode(s[i .. i + len]) catch return 1;
    return len;
}

const State = enum { code, single, double, line_comment, block_comment, regex, regex_class };
const F_TEMPLATE: u8 = 1;
const F_INTERPOLATION: u8 = 2;

/// `scanTemplateLiteralLines`: the 1-based lines that fall inside a template
/// literal, ascending.
pub fn templateLiteralLines(allocator: Allocator, content: []const u8) ![]const u32 {
    var inside: std.ArrayList(u32) = .empty;
    if (std.mem.indexOfScalar(u8, content, '`') == null) return inside.items;

    var stack: std.ArrayList(u8) = .empty;
    var in_template = false;
    var state: State = .code;
    var line: u32 = 1;
    var last_added: u32 = 0;
    // Index of the last non-whitespace code character on this line
    var last_significant: ?usize = null;
    var line_start: usize = 0;
    const len = content.len;

    var i: usize = 0;
    while (i < len) : (i += 1) {
        const c = content[i];

        if (c == '\n') {
            if (state == .line_comment) state = .code;
            line += 1;
            line_start = i + 1;
            last_significant = null;
            continue;
        }

        if (state == .code and in_template and last_added != line) {
            try inside.append(allocator, line);
            last_added = line;
        }

        if (state != .code) {
            switch (state) {
                .single, .double => {
                    if (c == '\\') {
                        i += 1;
                    } else if ((state == .single and c == '\'') or (state == .double and c == '"')) {
                        state = .code;
                    }
                },
                .block_comment => {
                    if (c == '*' and i + 1 < len and content[i + 1] == '/') {
                        i += 1;
                        state = .code;
                    }
                },
                .regex => {
                    if (c == '\\') {
                        i += 1;
                    } else if (c == '[') {
                        state = .regex_class;
                    } else if (c == '/') {
                        state = .code;
                    }
                },
                .regex_class => {
                    if (c == '\\') {
                        i += 1;
                    } else if (c == ']') {
                        state = .regex;
                    }
                },
                .line_comment, .code => {},
            }
            continue;
        }

        // Code, which is also the inside of a template literal body
        if (in_template) {
            if (c == '\\') {
                i += 1;
                continue;
            }
            if (c == '`') {
                _ = stack.pop();
                in_template = stack.items.len > 0 and stack.items[stack.items.len - 1] == F_TEMPLATE;
                continue;
            }
            if (c == '$' and i + 1 < len and content[i + 1] == '{') {
                try stack.append(allocator, F_INTERPOLATION);
                in_template = false;
                i += 1;
                continue;
            }
            continue;
        }

        if (c == '`') {
            try stack.append(allocator, F_TEMPLATE);
            in_template = true;
            if (last_added != line) {
                try inside.append(allocator, line);
                last_added = line;
            }
            continue;
        }
        if (c == '\'') {
            state = .single;
            continue;
        }
        if (c == '"') {
            state = .double;
            continue;
        }
        if (c == '/') {
            const next: u8 = if (i + 1 < len) content[i + 1] else 0;
            if (next == '/') {
                state = .line_comment;
                i += 1;
                continue;
            }
            if (next == '*') {
                state = .block_comment;
                i += 1;
                continue;
            }
            const last: Sig = if (last_significant) |at| sigOf(content[at]) else sig_none;
            if (isRegexStart(last, content[line_start .. i + 1], i - line_start)) {
                state = .regex;
                continue;
            }
        }
        if (c == '}' and stack.items.len > 0 and stack.items[stack.items.len - 1] == F_INTERPOLATION) {
            _ = stack.pop();
            in_template = stack.items.len > 0 and stack.items[stack.items.len - 1] == F_TEMPLATE;
            continue;
        }

        // Not whitespace (as `/\s/` defines it)
        if (c < 0x80) {
            if (!text.isAsciiSpace(c)) last_significant = i;
        } else {
            const n = charLen(content, i);
            if (text.whitespaceLenAt(content, i) == 0) last_significant = i;
            i += n - 1;
        }
    }
    return inside.items;
}

test "template lines" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const got = try templateLiteralLines(a, "const a = `x\ny ${`z\nw`} q\n`\nconst b = 1\n");
    try std.testing.expectEqualSlices(u32, &.{ 1, 2, 3, 4 }, got);
    const none = try templateLiteralLines(a, "const re = /`/\nconst b = 1\n");
    try std.testing.expectEqual(@as(usize, 0), none.len);
}

test "strip regex literals and comments" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var b1: std.ArrayList(u8) = .empty;
    var b2: std.ArrayList(u8) = .empty;
    const r = try stripRegexLiterals(a, "x = /[/\"]+/g.test(\"a\") // \"c\"", &b1);
    try std.testing.expectEqualStrings("x = .test(\"a\") // \"c\"", r);
    const c = try stripComments(a, r, &b2);
    try std.testing.expectEqualStrings("x = .test(\"a\") ", c);
}
