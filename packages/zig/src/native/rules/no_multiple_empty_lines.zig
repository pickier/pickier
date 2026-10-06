//! `style/no-multiple-empty-lines` - port of packages/pickier/src/rules/style/no-multiple-empty-lines.ts
//!
//! Per line (`/\r?\n/`): every blank line (`line.trim() === ''`) after the
//! first of a run is reported at column 1. The rule reads no options; the
//! maximum is fixed at one. A trailing newline ends the file with an empty
//! line, so `a\n\n` reports line 3.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    var consecutive: usize = 0;
    for (lines, 0..) |line, i| {
        if (text.trimStart(line).len != 0) {
            consecutive = 0;
            continue;
        }
        consecutive += 1;
        // The TypeScript `i === firstEmptyLineIndex + consecutiveEmptyLines - 1`
        // always holds inside a run
        if (consecutive > 1) {
            try out.append(a, .{
                .line = @intCast(i + 1),
                .column = 1,
                .rule_id = "style/no-multiple-empty-lines",
                .message = "More than 1 blank line not allowed",
                .severity = .@"error",
                .help = "Remove extra blank lines. Maximum 1 consecutive blank line allowed.",
            });
        }
    }
}
