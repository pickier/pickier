//! Types shared by the native lint engine (`pickier-zig lint-batch`).
//!
//! The native engine lints TS/JS files for the TypeScript CLI and must report
//! exactly what the TypeScript linter reports for the same file and settings.
//! Every rule here is a port of its TypeScript source, checked against it by
//! scripts/parity.ts.

const std = @import("std");

pub const Severity = enum {
    @"error",
    warning,

    pub fn toString(self: Severity) []const u8 {
        return switch (self) {
            .@"error" => "error",
            .warning => "warning",
        };
    }

    pub fn parse(s: []const u8) ?Severity {
        if (std.mem.eql(u8, s, "error")) return .@"error";
        if (std.mem.eql(u8, s, "warning") or std.mem.eql(u8, s, "warn")) return .warning;
        return null;
    }
};

/// One reported problem, with the fields of the TypeScript `LintIssue`.
pub const Issue = struct {
    line: u32,
    column: u32,
    rule_id: []const u8,
    message: []const u8,
    severity: Severity,
    help: ?[]const u8 = null,
    /// Index of the reporting rule in `Settings.rules`; -1 for a built-in check.
    /// Set by the pipeline, not by rules.
    rule_index: i32 = -1,
};

pub const QuoteStyle = enum { single, double };
pub const IndentStyle = enum { spaces, tabs };

/// Severities the TypeScript CLI resolved for the built-in checks; null is off.
pub const Builtins = struct {
    quotes: ?Severity = null,
    indent: ?Severity = null,
    no_debugger: ?Severity = null,
    no_console: ?Severity = null,
    no_template_curly_in_string: ?Severity = null,
    no_cond_assign: ?Severity = null,
};

/// A plugin rule from the TypeScript plan, in plan order.
pub const RuleSetting = struct {
    /// The plan's full id, e.g. `general/no-unused-vars`
    id: []const u8,
    /// The configured severity; null keeps the severity the rule reports
    severity: ?Severity,
    /// The rule's options from the config, as given
    options: ?std.json.Value = null,
};

pub const Settings = struct {
    quotes: QuoteStyle = .single,
    indent: u8 = 2,
    indent_style: IndentStyle = .spaces,
    builtins: Builtins = .{},
    rules: []const RuleSetting = &.{},
};

/// What a rule's `check` receives - the TypeScript `(text, ctx)`.
pub const RuleContext = struct {
    file_path: []const u8,
    content: []const u8,
    options: ?std.json.Value,
    settings: *const Settings,
    /// Arena for this file; everything a rule allocates lives until the file is done
    allocator: std.mem.Allocator,
};

pub const CheckFn = *const fn (ctx: *const RuleContext, out: *std.ArrayList(Issue)) anyerror!void;
