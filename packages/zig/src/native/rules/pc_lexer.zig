//! `lineStartsInTemplate` from packages/pickier/src/lexer.ts (what
//! `computeLineStartsInTemplate` in rules/general/_template-tracking.ts
//! returns): for each line, whether it begins inside a template-literal body.
//!
//! The lexer runs on UTF-16 code units; this runs on UTF-8 bytes. Offsets are
//! bytes, which orders positions the same way. Where the lexer steps over one
//! code unit after a backslash, this steps one byte: the rest of a multi-byte
//! character is never a character any scanner here stops at. Word characters
//! are ASCII letters, digits, `_`, `$` and every code point from U+00A0 up
//! (invalid UTF-8 decodes to U+FFFD, also a word character); U+0080-U+009F
//! are neither word nor whitespace.

const std = @import("std");

const Region = struct { start: usize, end: usize };

/// `isBreak`: `\n`, `\r`, U+2028 or U+2029 at `i`.
fn isBreakAt(t: []const u8, i: usize) bool {
    if (i >= t.len) return false;
    const c = t[i];
    if (c == '\n' or c == '\r') return true;
    return c == 0xE2 and i + 2 < t.len and t[i + 1] == 0x80 and (t[i + 2] == 0xA8 or t[i + 2] == 0xA9);
}

/// Byte length of the character at `i` and whether it is a word character
/// (`isWordCode`).
fn wordCharAt(t: []const u8, i: usize) struct { word: bool, len: usize } {
    const c = t[i];
    if (c < 0x80) {
        const w = std.ascii.isAlphanumeric(c) or c == '_' or c == '$';
        return .{ .word = w, .len = 1 };
    }
    const len = std.unicode.utf8ByteSequenceLength(c) catch return .{ .word = true, .len = 1 };
    if (i + len > t.len) return .{ .word = true, .len = 1 };
    const cp = std.unicode.utf8Decode(t[i .. i + len]) catch return .{ .word = true, .len = 1 };
    return .{ .word = cp >= 0xA0, .len = len };
}

const ascii_word: [128]bool = blk: {
    var table: [128]bool = @splat(false);
    for (0..128) |c| table[c] = std.ascii.isAlphanumeric(c) or c == '_' or c == '$';
    break :blk table;
};

/// The first line break at or after `from`, or the end.
fn findBreak(t: []const u8, from: usize) usize {
    var i = from;
    while (std.mem.indexOfAnyPos(u8, t, i, "\n\r\xE2")) |k| {
        if (t[k] != 0xE2 or isBreakAt(t, k)) return k;
        i = k + 1;
    }
    return t.len;
}

/// `regexEnd`: the offset past a regex literal opening at `at`, or null.
fn regexEnd(t: []const u8, at: usize) ?usize {
    var index = at + 1;
    var in_class = false;
    while (index < t.len) {
        if (isBreakAt(t, index)) return null;
        const ch = t[index];
        if (ch == '\\') {
            if (isBreakAt(t, index + 1)) return null;
            index += 2;
            continue;
        }
        if (in_class) {
            if (ch == ']') in_class = false;
        } else if (ch == '[') {
            in_class = true;
        } else if (ch == '/') {
            index += 1;
            while (index < t.len) {
                const w = wordCharAt(t, index);
                if (!w.word) break;
                index += w.len;
            }
            return index;
        }
        index += 1;
    }
    return null;
}

const regex_after_word = [_][]const u8{ "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await", "throw" };

fn isRegexKeyword(word: []const u8) bool {
    // Every keyword is 2-10 lowercase letters
    if (word.len < 2 or word.len > 10 or word[0] < 'a' or word[0] > 'y') return false;
    for (regex_after_word) |k| {
        if (k[0] != word[0] or k.len != word.len) continue;
        if (std.mem.eql(u8, k, word)) return true;
    }
    return false;
}

const Lexer = struct {
    t: []const u8,
    index: usize = 0,
    /// -1 is a template body; >= 0 a `${}` expression with its brace depth
    frames: std.ArrayList(i32) = .empty,
    last_is_value: bool = false,
    bodies: std.ArrayList(Region) = .empty,
    allocator: std.mem.Allocator,

    /// `scanBody`
    fn scanBody(self: *Lexer) !void {
        const t = self.t;
        const start = self.index;
        while (self.index < t.len) {
            self.index = std.mem.indexOfAnyPos(u8, t, self.index, "\\`$") orelse t.len;
            if (self.index == t.len) break;
            const ch = t[self.index];
            if (ch == '\\') {
                self.index += 2;
                continue;
            }
            if (ch == '`') {
                try self.bodies.append(self.allocator, .{ .start = start, .end = self.index });
                _ = self.frames.pop();
                self.index += 1;
                self.last_is_value = true;
                return;
            }
            if (ch == '$' and self.index + 1 < t.len and t[self.index + 1] == '{') {
                try self.bodies.append(self.allocator, .{ .start = start, .end = self.index });
                try self.frames.append(self.allocator, 0);
                self.index += 2;
                self.last_is_value = false;
                return;
            }
            self.index += 1;
        }
        // Unterminated: the body runs to the end of the text
        self.index = @min(self.index, t.len);
        try self.bodies.append(self.allocator, .{ .start = start, .end = self.index });
        self.frames.clearRetainingCapacity();
    }

    fn run(self: *Lexer) !void {
        const t = self.t;
        const length = t.len;
        var i: usize = 0;
        if (std.mem.startsWith(u8, t, "#!")) i = findBreak(t, 2);
        // `last === 'value'`
        var value = false;

        while (i < length) {
            const frames = self.frames.items;
            if (frames.len > 0 and frames[frames.len - 1] == -1) {
                self.index = i;
                self.last_is_value = value;
                try self.scanBody();
                i = self.index;
                value = self.last_is_value;
                continue;
            }
            const ch = t[i];
            switch (classes[ch]) {
                // Whitespace changes nothing: step over the whole run
                .space => {
                    i += 1;
                    while (i < length and classes[t[i]] == .space) i += 1;
                },
                .word => {
                    const start = i;
                    i = wordEnd(t, i + 1);
                    value = !isRegexKeyword(t[start..i]);
                },
                .high => {
                    const wc = wordCharAt(t, i);
                    if (wc.word) {
                        const start = i;
                        i = wordEnd(t, i + wc.len);
                        value = !isRegexKeyword(t[start..i]);
                    } else {
                        value = false;
                        i += wc.len;
                    }
                },
                .slash => {
                    const next: u8 = if (i + 1 < length) t[i + 1] else 0;
                    if (next == '/') {
                        i = findBreak(t, i + 2);
                    } else if (next == '*') {
                        i = if (std.mem.indexOfPos(u8, t, i + 2, "*/")) |close| close + 2 else length;
                    } else if (if (!value) regexEnd(t, i) else null) |e| {
                        i = e;
                        value = true;
                    } else {
                        i += 1;
                        value = false;
                    }
                },
                .quote => {
                    const stops = if (ch == '\'') "'\\\n\r\xE2" else "\"\\\n\r\xE2";
                    var end = i + 1;
                    while (end < length) {
                        end = std.mem.indexOfAnyPos(u8, t, end, stops) orelse length;
                        if (end == length) break;
                        const c = t[end];
                        if (c == '\\') {
                            end += if (end + 2 < length and t[end + 1] == '\r' and t[end + 2] == '\n') 3 else 2;
                            continue;
                        }
                        if (c == ch or isBreakAt(t, end)) break;
                        end += 1;
                    }
                    end = @min(end, length);
                    i = if (end < length and t[end] == ch) end + 1 else end;
                    value = true;
                },
                .backtick => {
                    try self.frames.append(self.allocator, -1);
                    i += 1;
                },
                .open_brace => {
                    if (frames.len > 0) frames[frames.len - 1] += 1;
                    value = false;
                    i += 1;
                },
                .close_brace => {
                    if (frames.len > 0 and frames[frames.len - 1] == 0) {
                        // Back into the template body that owns this expression
                        _ = self.frames.pop();
                    } else {
                        if (frames.len > 0) frames[frames.len - 1] -= 1;
                        value = false;
                    }
                    i += 1;
                },
                .closer => {
                    value = true;
                    i += 1;
                },
                .other => {
                    value = false;
                    i += 1;
                },
            }
        }
    }
};

const Class = enum(u8) { other, space, word, high, slash, quote, backtick, open_brace, close_brace, closer };

const classes: [256]Class = blk: {
    var table: [256]Class = @splat(.other);
    for (0..256) |c| {
        if (c >= 0x80) {
            table[c] = .high;
        } else if (ascii_word[c]) {
            table[c] = .word;
        }
    }
    for ([_]u8{ ' ', '\t', '\n', 0x0B, 0x0C, '\r' }) |c| table[c] = .space;
    table['/'] = .slash;
    table['\''] = .quote;
    table['"'] = .quote;
    table['`'] = .backtick;
    table['{'] = .open_brace;
    table['}'] = .close_brace;
    table[')'] = .closer;
    table[']'] = .closer;
    break :blk table;
};

/// The end of a run of word characters continuing at `from`.
fn wordEnd(t: []const u8, from: usize) usize {
    var end = from;
    while (end < t.len) {
        const c = t[end];
        if (c < 0x80) {
            if (!ascii_word[c]) break;
            end += 1;
            continue;
        }
        const w = wordCharAt(t, end);
        if (!w.word) break;
        end += w.len;
    }
    return end;
}

/// One entry per `\n`-separated line: whether it begins inside a template body.
pub fn lineStartsInTemplate(allocator: std.mem.Allocator, t: []const u8) ![]bool {
    var lexer: Lexer = .{ .t = t, .allocator = allocator };
    try lexer.run();
    const bodies = lexer.bodies.items;

    const count = std.mem.count(u8, t, "\n") + 1;
    const out = try allocator.alloc(bool, count);
    var cursor: usize = 0;
    var at: usize = 0;
    var line: usize = 0;
    while (line < count) : (line += 1) {
        while (cursor < bodies.len and bodies[cursor].end < at) cursor += 1;
        out[line] = cursor < bodies.len and bodies[cursor].start <= at and at <= bodies[cursor].end and at > 0;
        if (line + 1 < count) at = std.mem.indexOfScalarPos(u8, t, at, '\n').? + 1;
    }
    return out;
}

test "template line starts" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    // A line starting at `${` is still in the body; one inside the expression is not
    const r = try lineStartsInTemplate(arena.allocator(), "const a = `x\nlet b = 1\n${y\n}`\nlet c = 2");
    try std.testing.expectEqualSlices(bool, &.{ false, true, true, false, false }, r);
}
