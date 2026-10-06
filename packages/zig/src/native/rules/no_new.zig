//! `eslint/no-new` and `quality/no-new` - port of packages/pickier/src/rules/quality/no-new.ts
//!
//! A line (`/\r?\n/`) matching `/^\s*new\s+\w+\s*\(/`. The rule then looks
//! for `=` or `:` before the first `new`, but on such a line only whitespace
//! comes before it, so every match is reported, at that `new`.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        const lead = line.len - text.trimStart(line).len;
        if (!newCall(line[lead..])) continue;
        try out.append(a, .{
            .line = @intCast(i + 1),
            .column = @intCast(text.utf16Index(line, lead) + 1),
            .rule_id = "eslint/no-new",
            .message = "Do not use 'new' for side effects",
            .severity = .warning,
        });
    }
}

/// `/^new\s+\w+\s*\(/`. The classes do not overlap, so each run is taken whole.
fn newCall(s: []const u8) bool {
    if (!std.mem.startsWith(u8, s, "new")) return false;
    var j = skipSpace(s, 3);
    if (j == 3) return false;
    const word = j;
    while (j < s.len and text.isWordByte(s[j])) j += 1;
    if (j == word) return false;
    j = skipSpace(s, j);
    return j < s.len and s[j] == '(';
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

test "new call" {
    try std.testing.expect(newCall("new Foo()"));
    try std.testing.expect(newCall("new Foo ()"));
    try std.testing.expect(!newCall("new Foo"));
    try std.testing.expect(!newCall("new (Foo)()"));
    try std.testing.expect(!newCall("newFoo()"));
    try std.testing.expect(!newCall("new foo.Bar()"));
}
