//! The built-in checks of the TypeScript `scanContentOptimized`: quotes,
//! indent, no-debugger, no-console, no-template-curly-in-string and
//! no-cond-assign, with their own suppression and comment-line handling.
//!
//! PORT IN PROGRESS: this still delegates to the older scanner.zig, whose
//! messages and edge cases differ from the TypeScript ones. scripts/parity.ts
//! measures the difference; the port replaces this body.

const std = @import("std");
const types = @import("types.zig");
const scanner = @import("../scanner.zig");
const cfg_mod = @import("../config.zig");
const directives = @import("directives.zig");

pub fn scan(
    allocator: std.mem.Allocator,
    path: []const u8,
    content: []const u8,
    settings: *const types.Settings,
    suppress: *const directives.DisableDirectives,
    comment_lines: *const std.AutoHashMap(u32, void),
    out: *std.ArrayList(types.Issue),
) !void {
    const sev = struct {
        fn of(s: ?types.Severity) cfg_mod.RuleSeverity {
            return if (s) |v| switch (v) {
                .@"error" => .@"error",
                .warning => .warn,
            } else .off;
        }
    };
    var cfg = cfg_mod.default_config;
    cfg.format.quotes = if (settings.quotes == .single) .single else .double;
    cfg.format.indent = settings.indent;
    cfg.format.indent_style = if (settings.indent_style == .spaces) .spaces else .tabs;
    cfg.rules.no_debugger = sev.of(settings.builtins.no_debugger);
    cfg.rules.no_console = sev.of(settings.builtins.no_console);
    cfg.rules.no_template_curly_in_string = sev.of(settings.builtins.no_template_curly_in_string);
    cfg.rules.no_cond_assign = sev.of(settings.builtins.no_cond_assign);

    const found = try scanner.scanContent(path, content, &cfg, suppress, comment_lines, allocator);
    for (found) |f| {
        try out.append(allocator, .{
            .line = f.line,
            .column = f.column,
            .rule_id = f.rule_id,
            .message = f.message,
            .severity = if (f.severity == .@"error") .@"error" else .warning,
            .help = f.help,
        });
    }
}
