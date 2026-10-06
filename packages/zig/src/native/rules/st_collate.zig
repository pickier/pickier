//! `String.prototype.localeCompare` as Bun runs it by default (ICU, locale
//! en-US, which collates as the CLDR root: tertiary strength, punctuation not
//! ignored, no numeric ordering), for ASCII strings.
//!
//! Primary weights put whitespace, then punctuation and symbols, then digits,
//! then letters, with a letter's cases equal; ties are broken by case,
//! lowercase first. C0 controls other than TAB..CR, and DEL, are ignored.
//! Checked against Bun over random strings of the whole ASCII range.

const std = @import("std");

/// Primary order of the non-letter, non-ignorable ASCII characters.
const symbol_order = "\t\n\x0b\x0c\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789";

const primary: [128]u8 = blk: {
    var t: [128]u8 = @splat(0);
    var w: u8 = 1;
    for (symbol_order) |c| {
        t[c] = w;
        w += 1;
    }
    for (0..26) |k| {
        t['a' + k] = w;
        t['A' + k] = w;
        w += 1;
    }
    break :blk t;
};

/// `a.localeCompare(b)` for ASCII `a` and `b`; null when either has a
/// non-ASCII byte, which this table does not cover.
pub fn compareAscii(a: []const u8, b: []const u8) ?std.math.Order {
    for (a) |c| if (c >= 0x80) return null;
    for (b) |c| if (c >= 0x80) return null;

    // Primary level
    var i: usize = 0;
    var j: usize = 0;
    while (true) {
        while (i < a.len and primary[a[i]] == 0) i += 1;
        while (j < b.len and primary[b[j]] == 0) j += 1;
        if (i == a.len or j == b.len) {
            if (i == a.len and j == b.len) break;
            return if (i == a.len) .lt else .gt;
        }
        const pa = primary[a[i]];
        const pb = primary[b[j]];
        if (pa != pb) return std.math.order(pa, pb);
        i += 1;
        j += 1;
    }

    // Tertiary level: uppercase after lowercase. The primaries matched, so
    // both sides have the same number of weighted characters.
    i = 0;
    j = 0;
    while (true) {
        while (i < a.len and primary[a[i]] == 0) i += 1;
        while (j < b.len and primary[b[j]] == 0) j += 1;
        if (i == a.len or j == b.len) return .eq;
        const ua = std.ascii.isUpper(a[i]);
        const ub = std.ascii.isUpper(b[j]);
        if (ua != ub) return if (ub) .lt else .gt;
        i += 1;
        j += 1;
    }
}

test "localeCompare order" {
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("a", "B").?);
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("a", "A").?);
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("aB", "Ab").?);
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("a-b", "ab").?);
    try std.testing.expectEqual(std.math.Order.eq, compareAscii("a\x01b", "ab").?);
    try std.testing.expectEqual(std.math.Order.gt, compareAscii("ab", "a-c").?);
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("10", "9").?);
    try std.testing.expectEqual(std.math.Order.lt, compareAscii("_x", "-x").?);
    try std.testing.expect(compareAscii("é", "e") == null);
}
