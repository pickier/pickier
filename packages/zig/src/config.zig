const std = @import("std");
const Allocator = std.mem.Allocator;
const format = @import("format.zig");

// ---------------------------------------------------------------------------
// Configuration types matching TypeScript PickierConfig from types.ts
// ---------------------------------------------------------------------------

pub const RuleSeverity = enum {
    off,
    warn,
    @"error",

    pub fn fromString(s: []const u8) RuleSeverity {
        if (std.mem.eql(u8, s, "error")) return .@"error";
        if (std.mem.eql(u8, s, "warn") or std.mem.eql(u8, s, "warning")) return .warn;
        return .off;
    }
};

pub const Extension = enum {
    ts,
    js,
    html,
    css,
    json,
    jsonc,
    md,
    yaml,
    yml,
    stx,
    lock,
};

pub const LintConfig = struct {
    extensions: []const Extension = &default_lint_extensions,
    reporter: Reporter = .stylish,
    cache: bool = false,
    max_warnings: i32 = -1,

    pub const Reporter = enum { stylish, json, compact };
};

pub const FormatConfig = struct {
    extensions: []const Extension = &default_format_extensions,
    trim_trailing_whitespace: bool = true,
    max_consecutive_blank_lines: u8 = 1,
    final_newline: format.Config.FinalNewline = .one,
    indent: u8 = 2,
    indent_style: format.Config.IndentStyle = .spaces,
    quotes: format.Config.QuoteStyle = .single,
    semi: bool = false,
};

pub const RulesConfig = struct {
    no_debugger: RuleSeverity = .@"error",
    no_console: RuleSeverity = .warn,
    no_cond_assign: RuleSeverity = .off,
    no_template_curly_in_string: RuleSeverity = .off,
};

pub const PluginRuleEntry = struct {
    rule_id: []const u8,
    severity: RuleSeverity,
};

pub const PickierConfig = struct {
    verbose: bool = true,
    ignores: []const []const u8 = &default_ignores,
    lint: LintConfig = .{},
    format: FormatConfig = .{},
    rules: RulesConfig = .{},
    plugin_rules: []const PluginRuleEntry = &default_plugin_rules,

    /// Convert format config to the format.zig Config struct
    pub fn toFormatConfig(self: *const PickierConfig) format.Config {
        return .{
            .quotes = self.format.quotes,
            .indent = self.format.indent,
            .indent_style = self.format.indent_style,
            .semi_removal = !self.format.semi, // TS: semi=false means remove semicolons
            .trim_trailing_whitespace = self.format.trim_trailing_whitespace,
            .max_consecutive_blank_lines = self.format.max_consecutive_blank_lines,
            .final_newline = self.format.final_newline,
        };
    }

    /// Look up a plugin rule severity by ID
    pub fn getPluginRuleSeverity(self: *const PickierConfig, rule_id: []const u8) RuleSeverity {
        for (self.plugin_rules) |entry| {
            if (std.mem.eql(u8, entry.rule_id, rule_id)) return entry.severity;
        }
        return .off;
    }
};

// ---------------------------------------------------------------------------
// Default configuration matching config.ts
// ---------------------------------------------------------------------------

const default_lint_extensions = [_]Extension{
    .ts, .js, .html, .css, .json, .jsonc, .md, .yaml, .yml, .stx,
};

const default_format_extensions = [_]Extension{
    .ts, .js, .html, .css, .json, .jsonc, .md, .yaml, .yml, .stx,
};

pub const default_ignores = [_][]const u8{
    "**/node_modules/**",
    "**/.pnpm/**",
    "**/.yarn/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/.output/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/.vite/**",
    "**/.turbo/**",
    "**/.cache/**",
    "**/coverage/**",
    "**/vendor/**",
    "**/pantry/**",
    "**/tmp/**",
    "**/.git/**",
    "**/.idea/**",
    "**/.vscode/**",
    "**/.zed/**",
    "**/.cursor/**",
    "**/.claude/**",
    "**/.github/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.lock",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
};

pub const universal_ignores = [_][]const u8{
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.vercel/**",
    "**/.netlify/**",
    "**/.cache/**",
    "**/.turbo/**",
    "**/.vscode/**",
    "**/.idea/**",
    "**/.zed/**",
    "**/.cursor/**",
    "**/.claude/**",
    "**/.github/**",
    "**/coverage/**",
    "**/.nyc_output/**",
    "**/tmp/**",
    "**/temp/**",
    "**/.tmp/**",
    "**/.temp/**",
    "**/vendor/**",
    "**/pantry/**",
    "**/target/**",
    "**/zig-cache/**",
    "**/zig-out/**",
};

const default_plugin_rules = [_]PluginRuleEntry{
    // Style rules
    .{ .rule_id = "style/brace-style", .severity = .warn },
    .{ .rule_id = "style/curly", .severity = .off },
    .{ .rule_id = "style/if-newline", .severity = .off },
    .{ .rule_id = "style/max-statements-per-line", .severity = .warn },
    .{ .rule_id = "style/comma-dangle", .severity = .off },
    .{ .rule_id = "style/keyword-spacing", .severity = .off },
    .{ .rule_id = "style/arrow-spacing", .severity = .off },
    .{ .rule_id = "style/space-infix-ops", .severity = .off },
    .{ .rule_id = "style/object-curly-spacing", .severity = .off },
    .{ .rule_id = "style/spaced-comment", .severity = .off },
    .{ .rule_id = "style/block-spacing", .severity = .off },
    .{ .rule_id = "style/space-before-blocks", .severity = .off },
    .{ .rule_id = "style/comma-spacing", .severity = .off },
    .{ .rule_id = "style/semi-spacing", .severity = .off },
    .{ .rule_id = "style/rest-spread-spacing", .severity = .off },
    .{ .rule_id = "style/key-spacing", .severity = .off },
    .{ .rule_id = "style/computed-property-spacing", .severity = .off },
    .{ .rule_id = "style/array-bracket-spacing", .severity = .off },
    .{ .rule_id = "style/space-in-parens", .severity = .off },
    .{ .rule_id = "style/template-curly-spacing", .severity = .off },
    .{ .rule_id = "style/space-unary-ops", .severity = .off },
    .{ .rule_id = "style/switch-colon-spacing", .severity = .off },
    .{ .rule_id = "style/arrow-parens", .severity = .off },
    .{ .rule_id = "style/space-before-function-paren", .severity = .off },
    .{ .rule_id = "style/quote-props", .severity = .off },
    .{ .rule_id = "style/no-floating-decimal", .severity = .off },
    .{ .rule_id = "style/new-parens", .severity = .off },
    .{ .rule_id = "style/no-extra-parens", .severity = .off },
    .{ .rule_id = "style/wrap-iife", .severity = .off },
    .{ .rule_id = "style/comma-style", .severity = .off },
    .{ .rule_id = "style/dot-location", .severity = .off },
    .{ .rule_id = "style/operator-linebreak", .severity = .off },
    .{ .rule_id = "style/multiline-ternary", .severity = .off },
    .{ .rule_id = "style/padded-blocks", .severity = .off },
    .{ .rule_id = "style/lines-between-class-members", .severity = .off },
    .{ .rule_id = "style/no-tabs", .severity = .off },
    .{ .rule_id = "style/no-mixed-spaces-and-tabs", .severity = .off },
    .{ .rule_id = "style/generator-star-spacing", .severity = .off },
    .{ .rule_id = "style/yield-star-spacing", .severity = .off },
    .{ .rule_id = "style/function-call-spacing", .severity = .off },
    .{ .rule_id = "style/template-tag-spacing", .severity = .off },
    .{ .rule_id = "style/no-whitespace-before-property", .severity = .off },
    .{ .rule_id = "style/no-mixed-operators", .severity = .off },
    .{ .rule_id = "style/indent-binary-ops", .severity = .off },
    // Pickier rules
    .{ .rule_id = "pickier/import-dedupe", .severity = .warn },
    .{ .rule_id = "pickier/no-import-node-modules-by-path", .severity = .@"error" },
    .{ .rule_id = "pickier/no-import-dist", .severity = .@"error" },
    .{ .rule_id = "pickier/prefer-const", .severity = .@"error" },
    .{ .rule_id = "pickier/prefer-template", .severity = .warn },
    .{ .rule_id = "pickier/no-unused-vars", .severity = .@"error" },
    // Regexp rules
    .{ .rule_id = "regexp/no-unused-capturing-group", .severity = .@"error" },
    .{ .rule_id = "regexp/no-super-linear-backtracking", .severity = .@"error" },
    .{ .rule_id = "regexp/no-useless-lazy", .severity = .@"error" },
    // TypeScript rules
    .{ .rule_id = "ts/no-top-level-await", .severity = .@"error" },
    .{ .rule_id = "ts/member-delimiter-style", .severity = .off },
    .{ .rule_id = "ts/type-annotation-spacing", .severity = .off },
    .{ .rule_id = "ts/type-generic-spacing", .severity = .off },
    .{ .rule_id = "ts/type-named-tuple-spacing", .severity = .off },
    // Markdown rules
    .{ .rule_id = "markdown/heading-increment", .severity = .warn },
    .{ .rule_id = "markdown/heading-style", .severity = .warn },
    .{ .rule_id = "markdown/no-missing-space-atx", .severity = .@"error" },
    .{ .rule_id = "markdown/no-multiple-space-atx", .severity = .@"error" },
    .{ .rule_id = "markdown/no-missing-space-closed-atx", .severity = .@"error" },
    .{ .rule_id = "markdown/no-multiple-space-closed-atx", .severity = .@"error" },
    .{ .rule_id = "markdown/blanks-around-headings", .severity = .warn },
    .{ .rule_id = "markdown/heading-start-left", .severity = .warn },
    .{ .rule_id = "markdown/no-duplicate-heading", .severity = .warn },
    .{ .rule_id = "markdown/single-title", .severity = .warn },
    .{ .rule_id = "markdown/no-trailing-punctuation", .severity = .warn },
    .{ .rule_id = "markdown/ul-style", .severity = .warn },
    .{ .rule_id = "markdown/list-indent", .severity = .@"error" },
    .{ .rule_id = "markdown/ul-indent", .severity = .warn },
    .{ .rule_id = "markdown/ol-prefix", .severity = .warn },
    .{ .rule_id = "markdown/list-marker-space", .severity = .@"error" },
    .{ .rule_id = "markdown/blanks-around-lists", .severity = .warn },
    .{ .rule_id = "markdown/no-trailing-spaces", .severity = .@"error" },
    .{ .rule_id = "markdown/no-hard-tabs", .severity = .@"error" },
    .{ .rule_id = "markdown/no-multiple-blanks", .severity = .warn },
    .{ .rule_id = "markdown/no-multiple-space-blockquote", .severity = .@"error" },
    .{ .rule_id = "markdown/no-blanks-blockquote", .severity = .warn },
    .{ .rule_id = "markdown/blanks-around-fences", .severity = .warn },
    .{ .rule_id = "markdown/single-trailing-newline", .severity = .@"error" },
    .{ .rule_id = "markdown/blanks-around-tables", .severity = .warn },
    .{ .rule_id = "markdown/no-reversed-links", .severity = .@"error" },
    .{ .rule_id = "markdown/no-bare-urls", .severity = .warn },
    .{ .rule_id = "markdown/no-space-in-links", .severity = .@"error" },
    .{ .rule_id = "markdown/no-empty-links", .severity = .@"error" },
    .{ .rule_id = "markdown/link-fragments", .severity = .warn },
    .{ .rule_id = "markdown/reference-links-images", .severity = .warn },
    .{ .rule_id = "markdown/link-image-reference-definitions", .severity = .warn },
    .{ .rule_id = "markdown/link-image-style", .severity = .warn },
    .{ .rule_id = "markdown/descriptive-link-text", .severity = .warn },
    .{ .rule_id = "markdown/line-length", .severity = .off },
    .{ .rule_id = "markdown/commands-show-output", .severity = .warn },
    .{ .rule_id = "markdown/fenced-code-language", .severity = .warn },
    .{ .rule_id = "markdown/code-block-style", .severity = .warn },
    .{ .rule_id = "markdown/code-fence-style", .severity = .warn },
    .{ .rule_id = "markdown/no-emphasis-as-heading", .severity = .warn },
    .{ .rule_id = "markdown/no-space-in-emphasis", .severity = .warn },
    .{ .rule_id = "markdown/no-space-in-code", .severity = .warn },
    .{ .rule_id = "markdown/emphasis-style", .severity = .warn },
    .{ .rule_id = "markdown/strong-style", .severity = .warn },
    .{ .rule_id = "markdown/no-inline-html", .severity = .warn },
    .{ .rule_id = "markdown/hr-style", .severity = .warn },
    .{ .rule_id = "markdown/first-line-heading", .severity = .off },
    .{ .rule_id = "markdown/required-headings", .severity = .off },
    .{ .rule_id = "markdown/proper-names", .severity = .off },
    .{ .rule_id = "markdown/no-alt-text", .severity = .warn },
    .{ .rule_id = "markdown/table-pipe-style", .severity = .warn },
    .{ .rule_id = "markdown/table-column-count", .severity = .warn },
    .{ .rule_id = "markdown/table-column-style", .severity = .warn },
    // Lockfile rules
    .{ .rule_id = "lockfile/validate-host", .severity = .warn },
    .{ .rule_id = "lockfile/validate-https", .severity = .@"error" },
    .{ .rule_id = "lockfile/validate-integrity", .severity = .warn },
    .{ .rule_id = "lockfile/validate-package-names", .severity = .@"error" },
    .{ .rule_id = "lockfile/validate-scheme", .severity = .@"error" },
};

pub const default_config = PickierConfig{};

// ---------------------------------------------------------------------------
// Config parsing (pure logic, no I/O — file loading is in main.zig)
// ---------------------------------------------------------------------------

/// Parse a std.json.Value object into PickierConfig.
/// Merges with defaults: user values override, default ignores/pluginRules are kept
/// unless explicitly overridden.
pub fn parseJsonValue(value: std.json.Value, allocator: Allocator) !PickierConfig {
    if (value != .object) return default_config;

    var cfg = default_config;
    const root = value.object;

    // Parse verbose
    if (root.get("verbose")) |v| {
        if (v == .bool) cfg.verbose = v.bool;
    }

    // Parse format section
    if (root.get("format")) |fmt| {
        if (fmt == .object) {
            const f = fmt.object;
            if (f.get("indent")) |v| {
                if (v == .integer) cfg.format.indent = @intCast(v.integer);
            }
            if (f.get("quotes")) |v| {
                if (v == .string) {
                    if (std.mem.eql(u8, v.string, "double")) cfg.format.quotes = .double;
                }
            }
            if (f.get("semi")) |v| {
                if (v == .bool) cfg.format.semi = v.bool;
            }
            if (f.get("indentStyle")) |v| {
                if (v == .string) {
                    if (std.mem.eql(u8, v.string, "tabs")) cfg.format.indent_style = .tabs;
                }
            }
            if (f.get("trimTrailingWhitespace")) |v| {
                if (v == .bool) cfg.format.trim_trailing_whitespace = v.bool;
            }
            if (f.get("maxConsecutiveBlankLines")) |v| {
                if (v == .integer) cfg.format.max_consecutive_blank_lines = @intCast(v.integer);
            }
            if (f.get("finalNewline")) |v| {
                if (v == .string) {
                    if (std.mem.eql(u8, v.string, "two")) cfg.format.final_newline = .two;
                    if (std.mem.eql(u8, v.string, "none")) cfg.format.final_newline = .none;
                }
            }
        }
    }

    // Parse rules section
    if (root.get("rules")) |rules_val| {
        if (rules_val == .object) {
            const r = rules_val.object;
            if (r.get("noDebugger")) |v| {
                if (v == .string) cfg.rules.no_debugger = RuleSeverity.fromString(v.string);
            }
            if (r.get("noConsole")) |v| {
                if (v == .string) cfg.rules.no_console = RuleSeverity.fromString(v.string);
            }
            if (r.get("noCondAssign")) |v| {
                if (v == .string) cfg.rules.no_cond_assign = RuleSeverity.fromString(v.string);
            }
            if (r.get("noTemplateCurlyInString")) |v| {
                if (v == .string) cfg.rules.no_template_curly_in_string = RuleSeverity.fromString(v.string);
            }
        }
    }

    // Parse lint section
    if (root.get("lint")) |lint| {
        if (lint == .object) {
            const l = lint.object;
            if (l.get("reporter")) |v| {
                if (v == .string) {
                    if (std.mem.eql(u8, v.string, "json")) cfg.lint.reporter = .json;
                    if (std.mem.eql(u8, v.string, "compact")) cfg.lint.reporter = .compact;
                }
            }
            if (l.get("maxWarnings")) |v| {
                if (v == .integer) cfg.lint.max_warnings = @intCast(v.integer);
            }
        }
    }

    // Parse ignores — merge with defaults (like TS mergeConfig)
    if (root.get("ignores")) |ignores_val| {
        if (ignores_val == .array) {
            // Build a set of all ignores: defaults + user
            var list = std.ArrayList([]const u8){};
            // Add defaults first
            for (&default_ignores) |ig| {
                try list.append(allocator, ig);
            }
            // Add user ignores (dedup)
            for (ignores_val.array.items) |item| {
                if (item == .string) {
                    var found = false;
                    for (list.items) |existing| {
                        if (std.mem.eql(u8, existing, item.string)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        try list.append(allocator, try allocator.dupe(u8, item.string));
                    }
                }
            }
            cfg.ignores = try list.toOwnedSlice(allocator);
        }
    }

    // Parse pluginRules — merge with defaults (user overrides take precedence)
    if (root.get("pluginRules")) |pr_val| {
        if (pr_val == .object) {
            var list = std.ArrayList(PluginRuleEntry){};
            // Copy defaults
            for (&default_plugin_rules) |entry| {
                try list.append(allocator, entry);
            }
            // Apply overrides from config
            var it = pr_val.object.iterator();
            while (it.next()) |kv| {
                const key = kv.key_ptr.*;
                const val = kv.value_ptr.*;
                const sev = if (val == .string)
                    RuleSeverity.fromString(val.string)
                else
                    continue;

                // Update existing entry or add new one
                var found = false;
                for (list.items) |*entry| {
                    if (std.mem.eql(u8, entry.rule_id, key)) {
                        entry.severity = sev;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    try list.append(allocator, .{
                        .rule_id = try allocator.dupe(u8, key),
                        .severity = sev,
                    });
                }
            }
            cfg.plugin_rules = try list.toOwnedSlice(allocator);
        }
    }

    return cfg;
}

/// Parse JSON string content into PickierConfig (convenience wrapper)
pub fn parseJsonConfig(content: []const u8) !PickierConfig {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, content, .{
        .allocate = .alloc_always,
    }) catch return default_config;
    defer parsed.deinit();

    return parseJsonValue(parsed.value, std.heap.page_allocator) catch default_config;
}

// ---------------------------------------------------------------------------
// Extension helpers
// ---------------------------------------------------------------------------

pub fn extensionToString(ext: Extension) []const u8 {
    return switch (ext) {
        .ts => ".ts",
        .js => ".js",
        .html => ".html",
        .css => ".css",
        .json => ".json",
        .jsonc => ".jsonc",
        .md => ".md",
        .yaml => ".yaml",
        .yml => ".yml",
        .stx => ".stx",
        .lock => ".lock",
    };
}

pub fn hasMatchingExtension(path: []const u8, extensions: []const Extension) bool {
    for (extensions) |ext| {
        if (std.mem.endsWith(u8, path, extensionToString(ext))) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "default config matches TS defaults" {
    const cfg = default_config;
    try std.testing.expect(cfg.format.indent == 2);
    try std.testing.expect(cfg.format.quotes == .single);
    try std.testing.expect(cfg.format.semi == false);
    try std.testing.expect(cfg.format.indent_style == .spaces);
    try std.testing.expect(cfg.format.trim_trailing_whitespace == true);
    try std.testing.expect(cfg.format.max_consecutive_blank_lines == 1);
    try std.testing.expect(cfg.format.final_newline == .one);
    try std.testing.expect(cfg.rules.no_debugger == .@"error");
    try std.testing.expect(cfg.rules.no_console == .warn);
    try std.testing.expect(cfg.verbose == true);
    try std.testing.expect(cfg.lint.reporter == .stylish);
    try std.testing.expect(cfg.lint.max_warnings == -1);
}

test "toFormatConfig converts correctly" {
    const cfg = default_config;
    const fmt_cfg = cfg.toFormatConfig();
    try std.testing.expect(fmt_cfg.quotes == .single);
    try std.testing.expect(fmt_cfg.indent == 2);
    try std.testing.expect(fmt_cfg.semi_removal == true); // semi=false means remove
    try std.testing.expect(fmt_cfg.trim_trailing_whitespace == true);
}

test "getPluginRuleSeverity" {
    const cfg = default_config;
    try std.testing.expect(cfg.getPluginRuleSeverity("pickier/prefer-const") == .@"error");
    try std.testing.expect(cfg.getPluginRuleSeverity("style/brace-style") == .warn);
    try std.testing.expect(cfg.getPluginRuleSeverity("nonexistent/rule") == .off);
}

test "RuleSeverity.fromString" {
    try std.testing.expect(RuleSeverity.fromString("error") == .@"error");
    try std.testing.expect(RuleSeverity.fromString("warn") == .warn);
    try std.testing.expect(RuleSeverity.fromString("warning") == .warn);
    try std.testing.expect(RuleSeverity.fromString("off") == .off);
    try std.testing.expect(RuleSeverity.fromString("unknown") == .off);
}

test "hasMatchingExtension" {
    try std.testing.expect(hasMatchingExtension("file.ts", &default_lint_extensions));
    try std.testing.expect(hasMatchingExtension("file.js", &default_lint_extensions));
    try std.testing.expect(hasMatchingExtension("file.md", &default_lint_extensions));
    try std.testing.expect(!hasMatchingExtension("file.rs", &default_lint_extensions));
    try std.testing.expect(!hasMatchingExtension("file.zig", &default_lint_extensions));
}

test "parseJsonConfig - basic format" {
    const json =
        \\{"format":{"indent":4,"quotes":"double","semi":true}}
    ;
    const cfg = try parseJsonConfig(json);
    try std.testing.expect(cfg.format.indent == 4);
    try std.testing.expect(cfg.format.quotes == .double);
    try std.testing.expect(cfg.format.semi == true);
}

test "parseJsonConfig - invalid json returns defaults" {
    const cfg = try parseJsonConfig("not json");
    try std.testing.expect(cfg.format.indent == 2);
}
