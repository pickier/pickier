//! `style/brace-style` - port of packages/pickier/src/rules/style/brace-style.ts
//!
//! Line-based 1tbs check: a `}` followed on the same line by `else`, `catch`
//! or `finally`, and a `{` alone on a line after a line that could have
//! carried it.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

const rule_id = "style/brace-style";

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);

    for (lines, 0..) |line, i| {
        const trimmed = text.trim(line);

        // Skip comment lines
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*")) continue;

        // `/\}\s+(?:else|catch|finally)\b/`
        if (closingBraceWithNext(trimmed)) {
            const brace = std.mem.indexOfScalar(u8, trimmed, '}').?;
            try out.append(a, .{
                .line = @intCast(i + 1),
                .column = @intCast(text.utf16Index(trimmed, brace) + 1),
                .rule_id = rule_id,
                .message = "Closing curly brace appears on the same line as the subsequent block",
                .severity = .@"error",
            });
        }

        // An opening brace alone on its line
        if (std.mem.eql(u8, trimmed, "{") and i > 0) {
            const prev = text.trim(lines[i - 1]);
            // Standalone block scopes: the previous line is empty or a comment
            if (prev.len == 0 or std.mem.startsWith(u8, prev, "//") or std.mem.startsWith(u8, prev, "/*") or std.mem.endsWith(u8, prev, "*/"))
                continue;
            const last = prev[prev.len - 1];
            // `prevLine.match(/[=:]\s*$/)` - the line is trimmed, so its last character
            if (last != '{' and last != ',' and last != '(' and last != '=' and last != ':' and last != '[') {
                try out.append(a, .{
                    .line = @intCast(i + 1),
                    .column = 1,
                    .rule_id = rule_id,
                    .message = "Opening curly brace should be on the same line",
                    .severity = .@"error",
                });
            }
        }
    }
}

/// `/\}\s+(?:else|catch|finally)\b/.test(s)`
fn closingBraceWithNext(s: []const u8) bool {
    var from: usize = 0;
    while (std.mem.indexOfScalarPos(u8, s, from, '}')) |brace| {
        var j = brace + 1;
        while (j < s.len) {
            const len = text.whitespaceLenAt(s, j);
            if (len == 0) break;
            j += len;
        }
        if (j > brace + 1) {
            const rest = s[j..];
            for ([_][]const u8{ "else", "catch", "finally" }) |kw| {
                if (std.mem.startsWith(u8, rest, kw) and (rest.len == kw.len or !text.isWordByte(rest[kw.len])))
                    return true;
            }
        }
        from = j;
    }
    return false;
}
