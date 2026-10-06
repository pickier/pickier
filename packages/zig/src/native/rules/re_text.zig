//! Helpers shared by the regexp rule ports (rules/no_super_linear_backtracking,
//! no_unused_capturing_group, no_useless_lazy): JavaScript regex `.` and `\s`
//! on UTF-8 bytes, UTF-16 windows of the source, and the line and column the
//! TypeScript rules compute for an index into the file.

const std = @import("std");
const text = @import("../text.zig");

/// Byte length of the character at `i`, decoded the way `text.utf16Len`
/// decodes it: invalid UTF-8 is one byte per character.
pub fn charLen(s: []const u8, i: usize) usize {
    const b = s[i];
    if (b < 0x80) return 1;
    const len = std.unicode.utf8ByteSequenceLength(b) catch return 1;
    if (i + len > s.len) return 1;
    _ = std.unicode.utf8Decode(s[i .. i + len]) catch return 1;
    return len;
}

/// Whether a line terminator - `\n`, `\r`, U+2028 or U+2029, what `.`
/// does not match - starts at `i`.
pub fn isLineTerminatorAt(s: []const u8, i: usize) bool {
    const b = s[i];
    if (b == '\n' or b == '\r') return true;
    return b == 0xE2 and i + 2 < s.len and s[i + 1] == 0x80 and (s[i + 2] == 0xA8 or s[i + 2] == 0xA9);
}

/// Byte length of what `/./` matches at `i`, or 0 at a line terminator or
/// the end. A character outside the BMP is two code units; `.` takes the
/// first and the rule's next class always takes the second, so a port can
/// step over the whole character.
pub fn dotLenAt(s: []const u8, i: usize) usize {
    if (i >= s.len or isLineTerminatorAt(s, i)) return 0;
    return charLen(s, i);
}

/// The end of the `/\s*/` run starting at `i`.
pub fn skipSpaces(s: []const u8, i: usize) usize {
    var j = i;
    while (j < s.len) {
        const len = text.whitespaceLenAt(s, j);
        if (len == 0) break;
        j += len;
    }
    return j;
}

/// Byte index where the last `units` UTF-16 code units before `end` start,
/// or 0. A surrogate pair cut in half by the window is left out; for the
/// rules' `\b` and `\s` tests a lone low surrogate at the start of a slice
/// behaves like the start of the slice.
pub fn unitsBefore(s: []const u8, end: usize, units: usize) usize {
    var start = end;
    var left = units;
    while (start > 0 and left > 0) {
        // Find the start of the character that ends at `start`
        var k = start - 1;
        var steps: usize = 0;
        while (k > 0 and (s[k] & 0xC0) == 0x80 and steps < 3) : (steps += 1) k -= 1;
        const width: usize = if (charLen(s, k) == start - k) start - k else 1;
        const char_start = start - width;
        const cost: usize = if (width == 4) 2 else 1;
        if (cost > left) break;
        left -= cost;
        start = char_start;
    }
    return start;
}

/// Byte index where the first `units` UTF-16 code units from `start` end, or
/// the end of `s`. A character outside the BMP that does not fit whole is
/// left out (its high surrogate is never one the rules look for).
pub fn unitsAfter(s: []const u8, start: usize, units: usize) usize {
    var end = start;
    var left = units;
    while (end < s.len and left > 0) {
        const width = charLen(s, end);
        const cost: usize = if (width == 4) 2 else 1;
        if (cost > left) break;
        left -= cost;
        end += width;
    }
    return end;
}

pub const Position = struct { line: u32, column: u32 };

/// Line and column of byte indexes in increasing order, as the rules compute
/// them: the line counts `\n` before the index, the column is UTF-16 code
/// units since the last `\n`, from 1. Indexes must fall on ASCII characters.
/// Each byte is looked at once however many indexes a line has.
pub const Lines = struct {
    content: []const u8,
    /// Newlines are counted up to here
    pos: usize = 0,
    line: u32 = 1,
    line_start: usize = 0,
    /// `units` code units lie between `line_start` and `unit_pos`
    unit_pos: usize = 0,
    units: usize = 0,

    /// Moves to `index`; `line` and `line_start` are then its line's.
    pub fn advance(self: *Lines, index: usize) void {
        if (index < self.pos) self.* = .{ .content = self.content };
        while (std.mem.indexOfScalarPos(u8, self.content[0..index], self.pos, '\n')) |nl| {
            self.line += 1;
            self.line_start = nl + 1;
            self.pos = nl + 1;
            self.unit_pos = nl + 1;
            self.units = 0;
        }
        self.pos = index;
    }

    pub fn at(self: *Lines, index: usize) Position {
        self.advance(index);
        self.units += text.utf16Len(self.content[self.unit_pos..index]);
        self.unit_pos = index;
        return .{ .line = self.line, .column = @intCast(self.units + 1) };
    }
};

test "unit windows" {
    try std.testing.expectEqual(@as(usize, 2), unitsBefore("abcdef", 6, 4));
    try std.testing.expectEqual(@as(usize, 0), unitsBefore("ab", 2, 6));
    // "😀ab": a window of 3 units ending at the end cuts the pair
    try std.testing.expectEqual(@as(usize, 4), unitsBefore("😀ab", 6, 3));
    try std.testing.expectEqual(@as(usize, 0), unitsBefore("😀ab", 6, 4));
    try std.testing.expectEqual(@as(usize, 3), unitsAfter("éab", 0, 2));
}

test "lines and columns" {
    var lines: Lines = .{ .content = "ab\r\né/x\n/" };
    const p = lines.at(6);
    try std.testing.expectEqual(@as(u32, 2), p.line);
    try std.testing.expectEqual(@as(u32, 2), p.column);
    const q = lines.at(9);
    try std.testing.expectEqual(@as(u32, 3), q.line);
    try std.testing.expectEqual(@as(u32, 1), q.column);
}
