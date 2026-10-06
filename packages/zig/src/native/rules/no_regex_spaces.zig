//! `general/no-regex-spaces` - port of packages/pickier/src/rules/general/no-regex-spaces.ts
//!
//! Per line (`/\r?\n/`), skipping `/^\s*\/\//` lines: every match of the
//! regex-literal pattern `/\/(?![*/])((?:\\.|[^/\\])+)\/[gimsuvy]*/g`, then
//! of the constructor pattern `/new\s+RegExp\s*\(\s*['"`]([^'"`]+)['"`]/g`,
//! whose captured body has two spaces in a row, reported at the match.
//!
//! The literal body's two alternatives never start on the same character, so
//! from a given `/` the body splits into one sequence of tokens. It ends at
//! an unescaped `/` (a match), or at a backslash before a line terminator or
//! the end of the line (no match); backing off a token only lands on another
//! token start, which is never `/`. Any `/` passed on the way was escaped, and
//! the tokens after it are the same ones, so those starts fail the same way.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

const rule_id = "no-regex-spaces";
const message = "Multiple spaces in regular expression";
const help = "Use quantifiers like {2} instead of multiple spaces for clarity.";

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        // Every report needs two spaces in a row on the line
        if (std.mem.indexOf(u8, line, "  ") == null) continue;
        // `/^\s*\/\//`
        if (std.mem.startsWith(u8, text.trimStart(line), "//")) continue;
        const line_no: u32 = @intCast(i + 1);

        // Regex literals
        var pos: usize = 0;
        while (std.mem.indexOfScalarPos(u8, line, pos, '/')) |p| {
            const body = p + 1;
            if (body >= line.len or line[body] == '*' or line[body] == '/') {
                pos = p + 1;
                continue;
            }
            var j = body;
            while (j < line.len and line[j] != '/') {
                if (line[j] == '\\') {
                    j += 1 + (escapedLen(line, j + 1) orelse break);
                } else j += 1;
            }
            if (j >= line.len or line[j] != '/') {
                pos = @max(j, p + 1);
                continue;
            }
            if (std.mem.indexOf(u8, line[body..j], "  ") != null) try report(ctx, out, line, line_no, p);
            var end = j + 1;
            while (end < line.len and std.mem.indexOfScalar(u8, "gimsuvy", line[end]) != null) end += 1;
            pos = end;
        }

        // `new RegExp('...')`
        pos = 0;
        while (std.mem.indexOfPos(u8, line, pos, "new")) |p| {
            const m = regExpCall(line, p) orelse {
                pos = p + 1;
                continue;
            };
            if (std.mem.indexOf(u8, line[m.body..m.close], "  ") != null) try report(ctx, out, line, line_no, p);
            pos = m.close + 1;
        }
    }
}

fn report(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue), line: []const u8, line_no: u32, at: usize) !void {
    try out.append(ctx.allocator, .{
        .line = line_no,
        .column = @intCast(text.utf16Index(line, at) + 1),
        .rule_id = rule_id,
        .message = message,
        .severity = .@"error",
        .help = help,
    });
}

/// Bytes the `.` of `\\.` takes at `k`, or null where it cannot match: the
/// end of the line or a line terminator.
fn escapedLen(s: []const u8, k: usize) ?usize {
    if (k >= s.len) return null;
    const c = s[k];
    if (c == '\n' or c == '\r') return null;
    if (c < 0x80) return 1;
    if (c == 0xE2 and k + 2 < s.len and s[k + 1] == 0x80 and (s[k + 2] == 0xA8 or s[k + 2] == 0xA9)) return null;
    const len = std.unicode.utf8ByteSequenceLength(c) catch return 1;
    if (k + len > s.len) return 1;
    _ = std.unicode.utf8Decode(s[k .. k + len]) catch return 1;
    return len;
}

const Call = struct { body: usize, close: usize };

/// `/new\s+RegExp\s*\(\s*['"`]([^'"`]+)['"`]/` at `p`. Each class stops where
/// the next token must start, so there is nothing to back off into.
fn regExpCall(s: []const u8, p: usize) ?Call {
    var j = skipSpace(s, p + 3);
    if (j == p + 3) return null;
    if (!std.mem.startsWith(u8, s[j..], "RegExp")) return null;
    j = skipSpace(s, j + 6);
    if (j >= s.len or s[j] != '(') return null;
    j = skipSpace(s, j + 1);
    if (j >= s.len or !isQuote(s[j])) return null;
    const body = j + 1;
    var k = body;
    while (k < s.len and !isQuote(s[k])) k += 1;
    if (k == body or k >= s.len) return null;
    return .{ .body = body, .close = k };
}

fn isQuote(c: u8) bool {
    return c == '\'' or c == '"' or c == '`';
}

fn skipSpace(s: []const u8, from: usize) usize {
    var j = from;
    while (j < s.len) {
        const len = text.whitespaceLenAt(s, j);
        if (len == 0) break;
        j += len;
    }
    return j;
}

test "regexp constructor" {
    const c = regExpCall("x = new RegExp( 'a  b')", 4).?;
    try std.testing.expectEqual(@as(usize, 17), c.body);
    try std.testing.expect(regExpCall("new RegExp('')", 0) == null);
    try std.testing.expect(regExpCall("newRegExp('a')", 0) == null);
}
