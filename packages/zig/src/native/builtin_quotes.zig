//! The quotes check's line test, ported from packages/pickier/src/format.ts:
//! `detectQuoteIssues` with `quoteConvertible`. The scan reports only the
//! first offending quote of a line, so this stops there.

const std = @import("std");
const text = @import("text.zig");
const types = @import("types.zig");

/// `quoteConvertible`: whether the string opening at `open` contains no
/// unescaped `target` quote before its closing `quote`.
fn quoteConvertible(line: []const u8, open: usize, quote: u8, target: u8) bool {
    var j = open + 1;
    while (j < line.len) : (j += 1) {
        const c = line[j];
        if (c == '\\') {
            j += 1;
            continue;
        }
        if (c == quote) return true;
        if (c == target) return false;
    }
    return true;
}

/// `/^\s*\/\/\/\s*<reference/`
fn isTripleSlashReference(line: []const u8) bool {
    var i: usize = 0;
    while (i < line.len) {
        const n = text.whitespaceLenAt(line, i);
        if (n == 0) break;
        i += n;
    }
    if (!std.mem.startsWith(u8, line[i..], "///")) return false;
    i += 3;
    while (i < line.len) {
        const n = text.whitespaceLenAt(line, i);
        if (n == 0) break;
        i += n;
    }
    return std.mem.startsWith(u8, line[i..], "<reference");
}

/// `detectQuoteIssues(line, preferred)[0]`: the byte index of the first
/// offending quote, or null for none.
pub fn firstQuoteIssue(line: []const u8, preferred: types.QuoteStyle) ?usize {
    if (isTripleSlashReference(line)) return null;
    // 0 outside a string, else its quote character
    var in_string: u8 = 0;
    var escaped = false;
    for (line, 0..) |ch, i| {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\') {
            escaped = true;
            continue;
        }
        if (in_string == 0) {
            // The rest of the line is a comment
            if (ch == '/' and i + 1 < line.len and line[i + 1] == '/') break;
            if (ch == '\'') {
                if (preferred == .double and quoteConvertible(line, i, '\'', '"')) return i;
                in_string = '\'';
            } else if (ch == '"') {
                if (preferred == .single and quoteConvertible(line, i, '"', '\'')) return i;
                in_string = '"';
            } else if (ch == '`') {
                in_string = '`';
            }
        } else if (ch == in_string) {
            in_string = 0;
        }
    }
    return null;
}

test "first quote issue" {
    try std.testing.expectEqual(@as(?usize, 4), firstQuoteIssue("a = \"x\"", .single));
    try std.testing.expectEqual(@as(?usize, null), firstQuoteIssue("a = \"it's\"", .single));
    try std.testing.expectEqual(@as(?usize, null), firstQuoteIssue("/// <reference path=\"x\" />", .single));
    try std.testing.expectEqual(@as(?usize, null), firstQuoteIssue("a = '\"' // \"x\"", .single));
    try std.testing.expectEqual(@as(?usize, 0), firstQuoteIssue("'x'", .double));
}
