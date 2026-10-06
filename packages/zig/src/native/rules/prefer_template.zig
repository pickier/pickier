//! `general/prefer-template` - port of packages/pickier/src/rules/general/prefer-template.ts
//!
//! Per line (`/\r?\n/`), on the trimmed text, the first match of
//!
//!   stringPlusIdentifier  /(['"`][^'"`]*['"`])\s*\+\s*([a-z_$][\w$]*)/i
//!   identifierPlusString  /([a-z_$][\w$]*)\s*\+\s*(['"`][^'"`]*['"`])/i
//!
//! is reported unless it is past a `//`, starts inside a string by the rule's
//! quote toggling, or (identifier + string only) the string is followed by `.`.
//!
//! Neither regex can backtrack into a different match: `[^'"`]*` stops at the
//! next quote whatever it is, and `[a-z_$][\w$]*` runs to the end of its word,
//! so each start position has one candidate. The leftmost match is also the
//! first occurrence of its own text, so `indexOf(match[0])` is its position.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

const message = "Unexpected string concatenation. Use template literals instead";
const help = "Use template literals (backticks) instead of string concatenation. Example: `hello ${name}!` instead of 'hello ' + name + '!'";

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const content = ctx.content;
    var line_no: u32 = 0;
    var start: usize = 0;
    while (true) {
        line_no += 1;
        const nl = std.mem.indexOfScalarPos(u8, content, start, '\n');
        var end = nl orelse content.len;
        if (nl != null and end > start and content[end - 1] == '\r') end -= 1;
        const line = content[start..end];
        // Both patterns need a `+`
        if (std.mem.indexOfScalar(u8, line, '+') != null) {
            if (checkLine(line)) |byte_col| {
                try out.append(ctx.allocator, .{
                    .line = line_no,
                    .column = @intCast(text.utf16Index(line, byte_col) + 1),
                    .rule_id = "general/prefer-template",
                    .message = message,
                    .severity = .warning,
                    .help = help,
                });
            }
        }
        start = (nl orelse break) + 1;
    }
}

const Match = struct { start: usize, end: usize };

/// The byte offset of the reported match in `line`, or null for none.
fn checkLine(line: []const u8) ?usize {
    const trimmed = text.trim(line);
    if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or
        std.mem.startsWith(u8, trimmed, "*") or std.mem.startsWith(u8, trimmed, "import"))
        return null;

    const spi = stringPlusIdentifier(trimmed);
    const m = spi orelse identifierPlusString(trimmed) orelse return null;

    // `line.indexOf(match[0])`: trimmed starts `lead` bytes into the line
    const lead = @intFromPtr(trimmed.ptr) - @intFromPtr(line.ptr);
    const match_idx = lead + m.start;
    if (std.mem.indexOf(u8, line, "//")) |comment_idx| {
        if (match_idx > comment_idx) return null;
    }
    if (isInsideString(line, match_idx)) return null;

    // identifier + string only: `x + 'abc'.length` is not concatenation
    if (spi == null) {
        if (m.end < trimmed.len and trimmed[m.end] == '.') return null;
    }
    return match_idx;
}

fn isQuote(c: u8) bool {
    return c == '\'' or c == '"' or c == '`';
}

/// `[a-z_$]` under the `i` flag (no `u` flag, so ASCII only)
fn isIdentStart(c: u8) bool {
    return std.ascii.isAlphabetic(c) or c == '_' or c == '$';
}

/// `\s*` from `i`
fn skipSpace(s: []const u8, from: usize) usize {
    var i = from;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) break;
        i += n;
    }
    return i;
}

/// `\s*\+\s*` from `i`: the offset after it, or null.
fn plusAt(s: []const u8, i: usize) ?usize {
    const k = skipSpace(s, i);
    if (k >= s.len or s[k] != '+') return null;
    return skipSpace(s, k + 1);
}

/// `(['"`][^'"`]*['"`])\s*\+\s*([a-z_$][\w$]*)`, leftmost.
fn stringPlusIdentifier(s: []const u8) ?Match {
    var p = std.mem.indexOfAny(u8, s, "'\"`") orelse return null;
    while (true) {
        // The closing quote is the next quote of any kind
        const q = std.mem.indexOfAnyPos(u8, s, p + 1, "'\"`") orelse return null;
        if (plusAt(s, q + 1)) |k| {
            if (k < s.len and isIdentStart(s[k])) {
                var e = k + 1;
                while (e < s.len and text.isIdentByte(s[e])) e += 1;
                return .{ .start = p, .end = e };
            }
        }
        // The next attempt starts at the next quote, which is this one
        p = q;
    }
}

/// `([a-z_$][\w$]*)\s*\+\s*(['"`][^'"`]*['"`])`, leftmost.
fn identifierPlusString(s: []const u8) ?Match {
    var i: usize = 0;
    while (i < s.len) {
        if (!text.isIdentByte(s[i])) {
            i += 1;
            continue;
        }
        // A run of [\w$]: every start in it that is not a digit reaches the
        // same end, so the first such start is the only candidate
        const run = i;
        while (i < s.len and text.isIdentByte(s[i])) i += 1;
        var first = run;
        while (first < i and std.ascii.isDigit(s[first])) first += 1;
        if (first == i) continue;
        const k = plusAt(s, i) orelse continue;
        if (k >= s.len or !isQuote(s[k])) continue;
        const q = std.mem.indexOfAnyPos(u8, s, k + 1, "'\"`") orelse continue;
        return .{ .start = first, .end = q + 1 };
    }
    return null;
}

/// The rule's `isInsideString`: quote toggling up to `pos`, where a backslash
/// skips the next code unit. Skipping one byte of a multi-byte character is
/// the same: its remaining bytes are never quotes.
fn isInsideString(line: []const u8, pos: usize) bool {
    var in_single = false;
    var in_double = false;
    var in_template = false;
    var i: usize = 0;
    while (i < pos) : (i += 1) {
        const c = line[i];
        if (c == '\\') {
            i += 1;
            continue;
        }
        if (c == '\'' and !in_double and !in_template) {
            in_single = !in_single;
        } else if (c == '"' and !in_single and !in_template) {
            in_double = !in_double;
        } else if (c == '`' and !in_single and !in_double) {
            in_template = !in_template;
        }
    }
    return in_single or in_double or in_template;
}

test "prefer-template matches" {
    try std.testing.expectEqual(@as(?usize, 4), checkLine("x = 'a' + b"));
    try std.testing.expectEqual(@as(?usize, 4), checkLine("x = b + 'a'"));
    try std.testing.expectEqual(@as(?usize, null), checkLine("x = b + 'a'.length"));
    try std.testing.expectEqual(@as(?usize, null), checkLine("// 'a' + b"));
    try std.testing.expectEqual(@as(?usize, 5), checkLine("x = 9ab + 'a'"));
}
