//! `general/no-new` - port of packages/pickier/src/rules/general/no-new.ts
//!
//! A line (`/\r?\n/`) matching `/^\s*new\s+\w+/`, unless its trimmed text is
//! a comment, the line matches `/^\s*new\s+\w[^;]*,/` (taken for an argument
//! list), or the trimmed text has `/[=:,(]\s*new\s+/` anywhere. Reported at
//! the first `/new\s+/`, which is the leading `new`.
//!
//! The rule's assignment (`/^\s*(?:const|let|var|this\.\w+)\s*=\s*new\s+/`)
//! and return (`/^\s*return\s+new\s+/`) checks cannot match a line that
//! starts with `new`, so they are left out.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        const lead = line.len - text.trimStart(line).len;
        const rest = line[lead..];
        // `/^\s*new\s+\w/`: the offset of the `\w` in `rest`
        const word = newWord(rest) orelse continue;
        // Comment lines - which a line starting with `new` never is
        const trimmed = text.trimEnd(rest);
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) continue;
        // `isArgument`: a `,` before any `;` after that first word character
        if (commaBeforeSemicolon(rest[word + 1 ..])) continue;
        if (inExpression(trimmed)) continue;

        try out.append(a, .{
            .line = @intCast(i + 1),
            .column = @intCast(text.utf16Index(line, lead) + 1),
            .rule_id = "no-new",
            .message = "Do not use 'new' for side effects",
            .severity = .@"error",
            .help = "Either assign the result to a variable or remove the 'new' operator if the side effect is intentional.",
        });
    }
}

/// `/^new\s+\w/`: the offset of the word character.
fn newWord(s: []const u8) ?usize {
    if (!std.mem.startsWith(u8, s, "new")) return null;
    const j = skipSpace(s, 3);
    if (j == 3 or j >= s.len or !text.isWordByte(s[j])) return null;
    return j;
}

fn commaBeforeSemicolon(s: []const u8) bool {
    for (s) |c| {
        if (c == ',') return true;
        if (c == ';') return false;
    }
    return false;
}

/// `/[=:,(]\s*new\s+/.test(s)`
fn inExpression(s: []const u8) bool {
    for (s, 0..) |c, k| {
        if (c != '=' and c != ':' and c != ',' and c != '(') continue;
        const j = skipSpace(s, k + 1);
        if (!std.mem.startsWith(u8, s[j..], "new")) continue;
        if (j + 3 < s.len and text.whitespaceLenAt(s, j + 3) > 0) return true;
    }
    return false;
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

test "general no-new pieces" {
    try std.testing.expectEqual(@as(?usize, 4), newWord("new Foo()"));
    try std.testing.expectEqual(@as(?usize, null), newWord("new  "));
    try std.testing.expect(commaBeforeSemicolon("oo(a, b)"));
    try std.testing.expect(!commaBeforeSemicolon("oo(a); b, c"));
    try std.testing.expect(inExpression("new Foo(new Bar())"));
    try std.testing.expect(inExpression("new Foo(x, new\tBar())"));
    try std.testing.expect(!inExpression("new Foo(new"));
}
