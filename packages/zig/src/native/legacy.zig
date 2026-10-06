//! The older rules.zig implementations, run one rule at a time through the
//! native interface. A rule file uses this only until its port lands.

const std = @import("std");
const types = @import("types.zig");
const old_rules = @import("../rules.zig");
const cfg_mod = @import("../config.zig");
const directives = @import("../directives.zig");

/// The older rules.zig implementation of `old_id`, run alone and unsuppressed
/// (suppression is the pipeline's job, as in TypeScript).
pub fn adapter(comptime old_id: []const u8) types.CheckFn {
    return struct {
        fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
            var cfg = cfg_mod.default_config;
            cfg.plugin_rules = &[_]cfg_mod.PluginRuleEntry{.{ .rule_id = old_id, .severity = .@"error" }};
            var none = try directives.parseDisableDirectives("", ctx.allocator);
            var found: std.ArrayList(old_rules.LintIssue) = .empty;
            try old_rules.runPluginRules(ctx.file_path, ctx.content, &cfg, &none, &found, ctx.allocator);
            for (found.items) |f| {
                try out.append(ctx.allocator, .{
                    .line = f.line,
                    .column = f.column,
                    .rule_id = f.rule_id,
                    .message = f.message,
                    .severity = if (f.severity == .@"error") .@"error" else .warning,
                    .help = f.help,
                });
            }
        }
    }.check;
}
