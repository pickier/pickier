//! The no-cond-assign check's line test, ported from the `no-cond-assign`
//! block of `scanContentOptimized` in packages/pickier/src/linter.ts, with
//! `conditionText` and `topLevelOnly`.

const std = @import("std");
const text = @import("text.zig");

const Allocator = std.mem.Allocator;

pub const Keyword = enum { if_while, @"for" };

/// The first match of `/\b(?:if|while)\s*\(/` or `/\bfor\s*\(/` in `s`: the
/// byte index of its `(`.
pub fn findKeyword(s: []const u8, keyword: Keyword) ?usize {
    const words: []const []const u8 = switch (keyword) {
        .if_while => &.{ "if", "while" },
        .@"for" => &.{"for"},
    };
    var p: usize = 0;
    while (p < s.len) : (p += 1) {
        const c = s[p];
        if (c != 'i' and c != 'w' and c != 'f') continue;
        if (p > 0 and text.isWordByte(s[p - 1])) continue;
        for (words) |w| {
            if (!std.mem.startsWith(u8, s[p..], w)) continue;
            var j = p + w.len;
            while (j < s.len) {
                const n = text.whitespaceLenAt(s, j);
                if (n == 0) break;
                j += n;
            }
            if (j < s.len and s[j] == '(') return j;
        }
    }
    return null;
}

/// `conditionText`: the text inside the parentheses opening at `open`,
/// respecting nesting, or null when they never close.
fn conditionText(s: []const u8, open: usize) ?[]const u8 {
    var depth: usize = 0;
    var i = open;
    while (i < s.len) : (i += 1) {
        if (s[i] == '(') {
            depth += 1;
        } else if (s[i] == ')') {
            // `depth--` from 0 goes negative in TypeScript and can never get
            // back to 0 - but `open` is a `(`, so depth is at least 1 here.
            depth -= 1;
            if (depth == 0) return s[open + 1 .. i];
        }
    }
    return null;
}

/// `/[^=!<>]=(?![=>])/.test(topLevelOnly(cond))`, without building the
/// top-level string: the characters outside parentheses, in order.
fn hasTopLevelAssignment(cond: []const u8) bool {
    var depth: usize = 0;
    // The previous top-level character, null at the start
    var prev: ?u8 = null;
    // A `=` after an allowed character, waiting to see what follows it
    var pending = false;
    for (cond) |ch| {
        if (ch == '(') {
            depth += 1;
            continue;
        }
        if (ch == ')') {
            depth -|= 1;
            continue;
        }
        if (depth != 0) continue;
        if (pending) {
            if (ch != '=' and ch != '>') return true;
            pending = false;
        }
        if (ch == '=') {
            if (prev) |p| {
                if (p != '=' and p != '!' and p != '<' and p != '>') pending = true;
            }
        }
        prev = ch;
    }
    return pending;
}

/// `strippedLine.replace(/'[^']*'|"[^"]*"/g, '""')`
pub fn blankStrings(allocator: Allocator, s: []const u8, buf: *std.ArrayList(u8)) ![]const u8 {
    if (std.mem.indexOfAny(u8, s, "'\"") == null) return s;
    buf.clearRetainingCapacity();
    var i: usize = 0;
    while (i < s.len) {
        const c = s[i];
        if (c == '\'' or c == '"') {
            if (std.mem.indexOfScalarPos(u8, s, i + 1, c)) |close| {
                try buf.appendSlice(allocator, "\"\"");
                i = close + 1;
                continue;
            }
        }
        try buf.append(allocator, c);
        i += 1;
    }
    return buf.items;
}

/// Whether the condition of the first `if`/`while` (or the test of the first
/// `for`) in the blanked line assigns at its top level.
pub fn conditionAssigns(cond_line: []const u8, keyword: Keyword) bool {
    const open = findKeyword(cond_line, keyword) orelse return false;
    const inner = conditionText(cond_line, open) orelse return false;
    switch (keyword) {
        .if_while => return hasTopLevelAssignment(inner),
        .@"for" => {
            // `mFor.split(';')[1]`, when there is one
            const first = std.mem.indexOfScalar(u8, inner, ';') orelse return false;
            const rest = inner[first + 1 ..];
            const part = rest[0 .. std.mem.indexOfScalar(u8, rest, ';') orelse rest.len];
            return hasTopLevelAssignment(part);
        },
    }
}

/// `condParenColumn`: the column of the keyword's `(` in the original line,
/// else of the line's first `(`, else 1.
pub fn parenColumn(line: []const u8, keyword: Keyword) u32 {
    if (findKeyword(line, keyword)) |open| return @intCast(text.utf16Index(line, open) + 1);
    if (std.mem.indexOfScalar(u8, line, '(')) |at| return @intCast(text.utf16Index(line, at) + 1);
    return 1;
}

test "cond assign" {
    try std.testing.expect(conditionAssigns("if (a = b) {}", .if_while));
    try std.testing.expect(!conditionAssigns("if (a === b) {}", .if_while));
    try std.testing.expect(!conditionAssigns("while ((m = re.exec(s)) !== null) {}", .if_while));
    try std.testing.expect(!conditionAssigns("if (x => y) {}", .if_while));
    try std.testing.expect(conditionAssigns("for (;a = b;) {}", .@"for"));
    try std.testing.expect(!conditionAssigns("for (let i = 0; i < n; i++) {}", .@"for"));
    try std.testing.expect(!conditionAssigns("if (=x) {}", .if_while));
    try std.testing.expect(conditionAssigns("if (a =", .if_while) == false);
}
