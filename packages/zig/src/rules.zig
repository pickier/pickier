const std = @import("std");
const Allocator = std.mem.Allocator;
const cfg_mod = @import("config.zig");
const scanner = @import("scanner.zig");
const directives_mod = @import("directives.zig");
const markdown_rules = @import("markdown_rules.zig");
const lockfile_rules = @import("lockfile_rules.zig");

// ---------------------------------------------------------------------------
// Plugin rules — ported from TS plugins (pickier, style, ts, markdown)
// ---------------------------------------------------------------------------

const LintIssue = scanner.LintIssue;
const Severity = LintIssue.Severity;

/// Run all plugin rules on a file's content and append issues
pub fn runPluginRules(
    file_path: []const u8,
    content: []const u8,
    cfg: *const cfg_mod.PickierConfig,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const is_code = isCodeExt(file_path);
    const is_md = std.mem.endsWith(u8, file_path, ".md");
    const is_ts_js = isTsJsExt(file_path);

    // Style rules (code files only)
    if (is_code) {
        if (mapSeverity(cfg.getPluginRuleSeverity("style/brace-style"))) |sev| {
            try checkBraceStyle(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("style/max-statements-per-line"))) |sev| {
            try checkMaxStatementsPerLine(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Style rules (all files including markdown and CSS)
    if (is_code or is_md or std.mem.endsWith(u8, file_path, ".css")) {
        if (mapSeverity(cfg.getPluginRuleSeverity("style/no-multi-spaces"))) |sev| {
            try checkNoMultiSpaces(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Pickier rules (code files only)
    if (is_code) {
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/import-dedupe"))) |sev| {
            try checkImportDedupe(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/no-import-node-modules-by-path"))) |sev| {
            try checkNoImportNodeModules(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/no-import-dist"))) |sev| {
            try checkNoImportDist(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/prefer-template"))) |sev| {
            try checkPreferTemplate(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/prefer-const"))) |sev| {
            try checkPreferConst(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/no-unused-vars"))) |sev| {
            try checkNoUnusedVars(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/sort-exports"))) |sev| {
            try checkSortExports(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Regexp rules (code files only)
    if (is_code) {
        if (mapSeverity(cfg.getPluginRuleSeverity("regexp/no-unused-capturing-group"))) |sev| {
            try checkNoUnusedCapturingGroup(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("regexp/no-super-linear-backtracking"))) |sev| {
            try checkNoSuperLinearBacktracking(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("regexp/no-useless-lazy"))) |sev| {
            try checkNoUselessLazy(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Quality rules (code files only)
    if (is_code) {
        // no-new can be configured as "no-new" or "eslint/no-new"
        const no_new_sev = mapSeverity(cfg.getPluginRuleSeverity("no-new")) orelse
            mapSeverity(cfg.getPluginRuleSeverity("eslint/no-new"));
        if (no_new_sev) |sev| {
            try checkNoNew(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Node rules (code files only)
    if (is_code) {
        // node/prefer-global-process can be configured as "node/prefer-global-process" or "node/prefer-global/process"
        const pgp_sev = mapSeverity(cfg.getPluginRuleSeverity("node/prefer-global-process")) orelse
            mapSeverity(cfg.getPluginRuleSeverity("node/prefer-global/process"));
        if (pgp_sev) |sev| {
            try checkPreferGlobalProcess(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Style rules — no-multiple-empty-lines runs for ALL file types (matches TS behavior)
    if (mapSeverity(cfg.getPluginRuleSeverity("style/no-multiple-empty-lines"))) |sev| {
        try checkNoMultipleEmptyLines(file_path, content, sev, suppress, issues, allocator);
    }

    // TS rules (ts/js files only)
    if (is_ts_js) {
        if (mapSeverity(cfg.getPluginRuleSeverity("ts/no-top-level-await"))) |sev| {
            try checkNoTopLevelAwait(file_path, content, sev, suppress, issues, allocator);
        }
    }

    // Markdown rules (delegated to markdown_rules module)
    if (is_md) {
        if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-missing-space-atx"))) |sev| {
            try checkNoMissingSpaceAtx(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("markdown/heading-increment"))) |sev| {
            try checkHeadingIncrement(file_path, content, sev, suppress, issues, allocator);
        }
        if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-trailing-spaces"))) |sev| {
            try checkNoTrailingSpaces(file_path, content, sev, suppress, issues, allocator);
        }
        // Additional markdown rules
        try markdown_rules.runMarkdownRules(file_path, content, cfg, suppress, issues, allocator);
    }

    // Lockfile rules
    if (isLockFile(file_path)) {
        try lockfile_rules.runLockfileRules(file_path, content, cfg, issues, allocator);
    }

    // Tailwind class ordering (HTML, JSX, TS, JS, STX files)
    if (isTailwindFile(file_path)) {
        if (mapSeverity(cfg.getPluginRuleSeverity("pickier/sort-tailwind-classes"))) |sev| {
            try checkSortTailwindClasses(file_path, content, sev, suppress, issues, allocator);
        }
    }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

fn mapSeverity(sev: cfg_mod.RuleSeverity) ?Severity {
    return switch (sev) {
        .@"error" => .@"error",
        .warn => .warning,
        .off => null,
    };
}

fn isCodeExt(path: []const u8) bool {
    const code_exts = [_][]const u8{ ".ts", ".js", ".tsx", ".jsx", ".mts", ".cts", ".mjs", ".cjs" };
    for (code_exts) |ext| {
        if (std.mem.endsWith(u8, path, ext)) return true;
    }
    return false;
}

fn isLockFile(path: []const u8) bool {
    return std.mem.endsWith(u8, path, ".lock") or
        std.mem.endsWith(u8, path, "package-lock.json") or
        std.mem.endsWith(u8, path, "pnpm-lock.yaml");
}

fn isTsJsExt(path: []const u8) bool {
    const exts = [_][]const u8{ ".ts", ".js", ".tsx", ".jsx", ".mts", ".cts", ".mjs", ".cjs" };
    for (exts) |ext| {
        if (std.mem.endsWith(u8, path, ext)) return true;
    }
    return false;
}

fn isTailwindFile(path: []const u8) bool {
    const exts = [_][]const u8{ ".ts", ".js", ".tsx", ".jsx", ".mts", ".mjs", ".html", ".stx", ".vue", ".svelte" };
    for (exts) |ext| {
        if (std.mem.endsWith(u8, path, ext)) return true;
    }
    return false;
}

/// Strip YAML frontmatter (replace with blank lines to preserve line numbers)
fn stripFrontmatter(content: []const u8) []const u8 {
    if (!std.mem.startsWith(u8, content, "---")) return content;
    // Find closing ---
    const after_first = content[3..];
    if (std.mem.indexOf(u8, after_first, "\n---")) |end| {
        // Skip to end of closing --- line
        const close_start = 3 + end + 4; // 3 for first ---, + end + \n---
        if (close_start < content.len) {
            const next_nl = std.mem.indexOfScalarPos(u8, content, close_start, '\n') orelse content.len;
            return content[next_nl..];
        }
        return content[close_start..];
    }
    return content;
}

/// Count line number at a given byte offset
fn lineAtOffset(content: []const u8, offset: usize) u32 {
    var line: u32 = 1;
    for (content[0..offset]) |ch| {
        if (ch == '\n') line += 1;
    }
    return line;
}

// ---------------------------------------------------------------------------
// style/brace-style — enforce 1tbs brace style
// ---------------------------------------------------------------------------

fn checkBraceStyle(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;
    var prev_line: []const u8 = "";

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trim(u8, line, " \t\r");

        // Skip comment lines
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*")) {
            prev_line = line;
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        // Check 1: } else / } catch / } finally on same line
        if (std.mem.indexOf(u8, trimmed, "} else") != null or
            std.mem.indexOf(u8, trimmed, "} catch") != null or
            std.mem.indexOf(u8, trimmed, "} finally") != null)
        {
            if (!directives_mod.isSuppressed("style/brace-style", line_no, suppress)) {
                try issues.append(allocator, .{
                    .file_path = file_path,
                    .line = line_no,
                    .column = 1,
                    .rule_id = "style/brace-style",
                    .message = "Closing curly brace appears on the same line as the subsequent block",
                    .severity = severity,
                });
            }
        }

        // Check 2: Opening brace alone on its own line
        if (std.mem.eql(u8, trimmed, "{")) {
            if (prev_line.len > 0) {
                const prev_trimmed = std.mem.trim(u8, prev_line, " \t\r");
                // Skip if prev line is empty or a comment — this is a standalone block scope
                if (prev_trimmed.len == 0 or
                    std.mem.startsWith(u8, prev_trimmed, "//") or
                    std.mem.startsWith(u8, prev_trimmed, "/*") or
                    std.mem.endsWith(u8, prev_trimmed, "*/"))
                {
                    // Standalone block scope, not a brace-style violation
                } else
                // Skip if prev line ends with {, comma, or ( — likely object/array
                if (prev_trimmed.len > 0) {
                    const last_ch = prev_trimmed[prev_trimmed.len - 1];
                    if (last_ch != '{' and last_ch != ',' and last_ch != '(' and
                        last_ch != '=' and last_ch != ':' and last_ch != '[')
                    {
                        if (!directives_mod.isSuppressed("style/brace-style", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = 1,
                                .rule_id = "style/brace-style",
                                .message = "Opening curly brace should be on the same line",
                                .severity = severity,
                            });
                        }
                    }
                }
            }
        }

        prev_line = line;
        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// style/max-statements-per-line
// ---------------------------------------------------------------------------

fn checkMaxStatementsPerLine(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;
    var in_block_comment = false;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trim(u8, line, " \t\r");

        // Track block comments (/* ... */)
        if (in_block_comment) {
            if (std.mem.indexOf(u8, trimmed, "*/") != null) {
                in_block_comment = false;
            }
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }
        if (trimmed.len >= 2 and trimmed[0] == '/' and trimmed[1] == '*') {
            if (std.mem.indexOf(u8, trimmed[2..], "*/") == null) {
                in_block_comment = true;
            }
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }
        // Skip JSDoc/block comment continuation lines (start with *)
        if (trimmed.len > 0 and trimmed[0] == '*') {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        if (trimmed.len > 0) {
            const count = countStatements(trimmed);
            if (count > 1) {
                if (!directives_mod.isSuppressed("style/max-statements-per-line", line_no, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "style/max-statements-per-line",
                        .message = "This line has multiple statements. Maximum allowed is 1",
                        .severity = severity,
                    });
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

fn countStatements(line: []const u8) u32 {
    var semicolons: u32 = 0;
    var in_string: u8 = 0; // 0=none, '\'', '"', '`'
    var escaped = false;
    var paren_depth: u32 = 0;
    var in_for = false;
    var effective_end: usize = line.len;

    // Check if line starts with for
    const trimmed = std.mem.trimStart(u8, line, " \t");
    if (std.mem.startsWith(u8, trimmed, "for ") or std.mem.startsWith(u8, trimmed, "for(")) {
        in_for = true;
    }

    for (line, 0..) |ch, idx| {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\' and in_string != 0) {
            escaped = true;
            continue;
        }

        if (in_string != 0) {
            if (ch == in_string) in_string = 0;
            continue;
        }

        switch (ch) {
            '\'' => in_string = '\'',
            '"' => in_string = '"',
            '`' => in_string = '`',
            '(' => paren_depth += 1,
            ')' => {
                if (paren_depth > 0) {
                    paren_depth -= 1;
                    if (paren_depth == 0 and in_for) in_for = false;
                }
            },
            ';' => {
                if (!in_for or paren_depth == 0) semicolons += 1;
            },
            '/' => {
                // Strip // line comments
                if (idx + 1 < line.len and line[idx + 1] == '/') {
                    effective_end = idx;
                    break;
                }
            },
            else => {},
        }
    }

    if (semicolons == 0) return 1;
    // If line ends with semicolon (ignoring comment), count = semicolons, else semicolons + 1
    const code_end = std.mem.trim(u8, line[0..effective_end], " \t\r");
    if (code_end.len > 0 and code_end[code_end.len - 1] == ';') return semicolons;
    return semicolons + 1;
}

// ---------------------------------------------------------------------------
// pickier/import-dedupe
// ---------------------------------------------------------------------------

fn checkImportDedupe(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Match: import { ... } from '...'
        if (std.mem.startsWith(u8, trimmed, "import ") or std.mem.startsWith(u8, trimmed, "import{")) {
            if (std.mem.indexOf(u8, trimmed, "{")) |brace_start| {
                if (std.mem.indexOfScalarPos(u8, trimmed, brace_start, '}')) |brace_end| {
                    const specifiers = trimmed[brace_start + 1 .. brace_end];
                    // Check for duplicates
                    if (hasDuplicateSpecifiers(specifiers)) {
                        if (!directives_mod.isSuppressed("pickier/import-dedupe", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = 1,
                                .rule_id = "pickier/import-dedupe",
                                .message = "Expect no duplication in imports",
                                .severity = severity,
                            });
                        }
                    }
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

fn hasDuplicateSpecifiers(specifiers: []const u8) bool {
    // Split by comma, check for duplicates
    var seen: [64][]const u8 = undefined;
    var seen_count: usize = 0;

    var iter = std.mem.splitScalar(u8, specifiers, ',');
    while (iter.next()) |raw| {
        var spec = std.mem.trim(u8, raw, " \t\r\n");
        if (spec.len == 0) continue;

        // Strip 'as alias' — take first word
        if (std.mem.indexOf(u8, spec, " as ")) |as_pos| {
            spec = std.mem.trim(u8, spec[0..as_pos], " \t");
        }
        // Strip 'type ' prefix
        if (std.mem.startsWith(u8, spec, "type ")) {
            spec = std.mem.trim(u8, spec[5..], " \t");
        }

        if (spec.len == 0) continue;

        // Check if already seen
        for (seen[0..seen_count]) |s| {
            if (std.mem.eql(u8, s, spec)) return true;
        }
        if (seen_count < 64) {
            seen[seen_count] = spec;
            seen_count += 1;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// pickier/no-import-node-modules-by-path
// ---------------------------------------------------------------------------

fn checkNoImportNodeModules(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        if (extractImportSource(trimmed)) |src| {
            if (std.mem.indexOf(u8, src, "/node_modules/") != null or std.mem.indexOf(u8, src, "node_modules/") != null) {
                if (!directives_mod.isSuppressed("pickier/no-import-node-modules-by-path", line_no, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "pickier/no-import-node-modules-by-path",
                        .message = "Do not import modules in 'node_modules' folder by path",
                        .severity = severity,
                    });
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// pickier/no-import-dist
// ---------------------------------------------------------------------------

fn checkNoImportDist(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        if (extractImportSource(trimmed)) |src| {
            if (isDistImport(src)) {
                if (!directives_mod.isSuppressed("pickier/no-import-dist", line_no, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "pickier/no-import-dist",
                        .message = "Do not import modules from 'dist' folder",
                        .severity = severity,
                    });
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

fn isDistImport(src: []const u8) bool {
    if (std.mem.eql(u8, src, "dist")) return true;
    if (!std.mem.startsWith(u8, src, ".") and !std.mem.startsWith(u8, src, "/")) return false;
    // Check for /dist/ or /dist at end or starts with dist/
    if (std.mem.indexOf(u8, src, "/dist/") != null) return true;
    if (std.mem.endsWith(u8, src, "/dist")) return true;
    if (std.mem.startsWith(u8, src, "dist/")) return true;
    return false;
}

/// Extract import source from a line (import ... from 'xxx' or require('xxx'))
fn extractImportSource(line: []const u8) ?[]const u8 {
    // import ... from 'xxx'
    if (std.mem.startsWith(u8, line, "import ") or std.mem.startsWith(u8, line, "export ")) {
        if (std.mem.indexOf(u8, line, " from ")) |from_pos| {
            const after_from = line[from_pos + 6 ..];
            return extractQuotedString(after_from);
        }
    }
    // require('xxx')
    if (std.mem.indexOf(u8, line, "require(")) |req_pos| {
        const after = line[req_pos + 8 ..];
        return extractQuotedString(after);
    }
    return null;
}

fn extractQuotedString(s: []const u8) ?[]const u8 {
    const trimmed = std.mem.trimStart(u8, s, " \t");
    if (trimmed.len < 2) return null;
    const quote = trimmed[0];
    if (quote != '\'' and quote != '"') return null;
    if (std.mem.indexOfScalarPos(u8, trimmed, 1, quote)) |end| {
        return trimmed[1..end];
    }
    return null;
}

// ---------------------------------------------------------------------------
// pickier/prefer-template
// ---------------------------------------------------------------------------

fn checkPreferTemplate(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Skip comment lines and imports
        if (!std.mem.startsWith(u8, trimmed, "//") and
            !std.mem.startsWith(u8, trimmed, "/*") and
            !std.mem.startsWith(u8, trimmed, "*") and
            !std.mem.startsWith(u8, trimmed, "import "))
        {
            if (hasStringConcatenation(trimmed)) {
                if (!directives_mod.isSuppressed("pickier/prefer-template", line_no, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "pickier/prefer-template",
                        .message = "Unexpected string concatenation. Use template literals instead",
                        .severity = severity,
                    });
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

fn hasStringConcatenation(line: []const u8) bool {
    // Match TS behavior: flag 'string' + identifier or identifier + 'string'
    // TS uses regex: /(['"`][^'"`]*['"`])\s*\+\s*([a-z_$][\w$]*)/i and reverse
    // We check: the char immediately before + (skip whitespace) is a closing quote,
    // or the char immediately after + is an opening quote with an identifier before +.
    const State = enum { code, single, double, template };
    var state: State = .code;
    var escaped = false;
    var i: usize = 0;

    while (i < line.len) : (i += 1) {
        const ch = line[i];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\') {
            escaped = true;
            continue;
        }

        switch (state) {
            .code => {
                if (ch == '\'') {
                    state = .single;
                } else if (ch == '"') {
                    state = .double;
                } else if (ch == '`') {
                    state = .template;
                } else if (ch == '/' and i + 1 < line.len and line[i + 1] == '/') {
                    return false; // rest is comment
                } else if (ch == '+') {
                    // Skip += and ++
                    if (i + 1 < line.len and (line[i + 1] == '=' or line[i + 1] == '+')) continue;

                    // Check what's immediately before + (skip whitespace)
                    var before = i;
                    while (before > 0 and (line[before - 1] == ' ' or line[before - 1] == '\t')) before -= 1;
                    const prev_is_string = before > 0 and (line[before - 1] == '\'' or line[before - 1] == '"');
                    const prev_is_ident = before > 0 and isIdentChar(line[before - 1]);

                    // Check what's immediately after + (skip whitespace)
                    const after = std.mem.trimStart(u8, line[i + 1 ..], " \t");
                    const next_is_string = after.len > 0 and (after[0] == '\'' or after[0] == '"');
                    const next_is_ident = after.len > 0 and isIdentStart(after[0]);

                    // Flag: string + identifier, string + string
                    if (prev_is_string and (next_is_ident or next_is_string)) {
                        // Check if the string before + contains a backtick (can't convert to template)
                        const pq = line[before - 1]; // closing quote
                        var ps: usize = before - 2;
                        while (ps > 0 and line[ps] != pq) : (ps -= 1) {}
                        if (ps + 1 < before - 1 and std.mem.indexOfScalar(u8, line[ps + 1 .. before - 1], '`') != null) {
                            // Skip — string contains backtick
                        } else {
                            return true;
                        }
                    }
                    // Flag: identifier + string (but not if string is followed by . for property access)
                    if (next_is_string and prev_is_ident) {
                        // Find end of string after +
                        const quote = after[0];
                        var end: usize = 1;
                        var esc = false;
                        while (end < after.len) : (end += 1) {
                            if (esc) {
                                esc = false;
                                continue;
                            }
                            if (after[end] == '\\') {
                                esc = true;
                                continue;
                            }
                            if (after[end] == quote) {
                                end += 1;
                                break;
                            }
                        }
                        // Check if string is followed by . (property access like 'str'.length)
                        if (end < after.len and after[end] == '.') {
                            // Skip — this is property access, not concatenation
                        } else if (end > 2 and std.mem.indexOfScalar(u8, after[1 .. end - 1], '`') != null) {
                            // Skip — string contains backtick, can't trivially convert to template literal
                        } else {
                            return true;
                        }
                    }
                }
            },
            .single => {
                if (ch == '\'') state = .code;
            },
            .double => {
                if (ch == '"') state = .code;
            },
            .template => {
                if (ch == '`') state = .code;
            },
        }
    }
    return false;
}

fn isIdentStart(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or ch == '_' or ch == '$';
}

// ---------------------------------------------------------------------------
// pickier/prefer-const
// ---------------------------------------------------------------------------

fn checkPreferConst(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Check for let or var declarations with initializer
        if (getLetVarDeclaration(trimmed)) |decl_info| {
            const name_part = decl_info.name;

            // Skip destructuring
            if (name_part.len > 0 and name_part[0] != '{' and name_part[0] != '[') {
                // Must have initializer
                if (std.mem.indexOf(u8, name_part, "=")) |eq_pos| {
                    const var_name = std.mem.trim(u8, name_part[0..eq_pos], " \t:");
                    if (var_name.len > 0) {
                        const clean_name = stripTypeAnnotation(var_name);
                        if (clean_name.len > 0) {
                            // Check rest of file for reassignment
                            const rest_start = if (line_end < content.len) line_end + 1 else content.len;
                            const rest = content[rest_start..];
                            if (rest.len > 0 and !isReassigned(clean_name, rest)) {
                                if (!directives_mod.isSuppressed("pickier/prefer-const", line_no, suppress)) {
                                    try issues.append(allocator, .{
                                        .file_path = file_path,
                                        .line = line_no,
                                        .column = 1,
                                        .rule_id = "pickier/prefer-const",
                                        .message = "Variable is never reassigned. Use 'const' instead",
                                        .severity = severity,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

const DeclInfo = struct {
    name: []const u8,
};

fn getLetVarDeclaration(trimmed: []const u8) ?DeclInfo {
    if (std.mem.startsWith(u8, trimmed, "let ")) {
        return .{ .name = trimmed[4..] };
    }
    if (std.mem.startsWith(u8, trimmed, "var ")) {
        return .{ .name = trimmed[4..] };
    }
    return null;
}

fn isReassigned(name: []const u8, rest: []const u8) bool {
    // Search for assignment patterns: name =, name +=, name++, ++name, etc.
    var pos: usize = 0;
    while (pos < rest.len) {
        if (std.mem.indexOfPos(u8, rest, pos, name)) |found| {
            // Check word boundary before
            if (found > 0 and isIdentChar(rest[found - 1])) {
                pos = found + name.len;
                continue;
            }
            // Check word boundary after
            const after_name = found + name.len;
            if (after_name < rest.len and isIdentChar(rest[after_name])) {
                pos = after_name;
                continue;
            }

            // Check what follows the name
            if (after_name < rest.len) {
                const after = std.mem.trimStart(u8, rest[after_name..], " \t");
                // Assignment operators
                if (std.mem.startsWith(u8, after, "=") and !std.mem.startsWith(u8, after, "==") and !std.mem.startsWith(u8, after, "=>")) return true;
                if (std.mem.startsWith(u8, after, "+=") or
                    std.mem.startsWith(u8, after, "-=") or
                    std.mem.startsWith(u8, after, "*=") or
                    std.mem.startsWith(u8, after, "/=") or
                    std.mem.startsWith(u8, after, "%=") or
                    std.mem.startsWith(u8, after, "**=") or
                    std.mem.startsWith(u8, after, "<<=") or
                    std.mem.startsWith(u8, after, ">>=") or
                    std.mem.startsWith(u8, after, ">>>=") or
                    std.mem.startsWith(u8, after, "&=") or
                    std.mem.startsWith(u8, after, "^=") or
                    std.mem.startsWith(u8, after, "|=")) return true;
                if (std.mem.startsWith(u8, after, "++") or std.mem.startsWith(u8, after, "--")) return true;
            }

            // Check ++name or --name
            if (found >= 2) {
                if (rest[found - 1] == '+' and rest[found - 2] == '+') return true;
                if (rest[found - 1] == '-' and rest[found - 2] == '-') return true;
            }

            pos = after_name;
        } else {
            break;
        }
    }
    return false;
}

fn isIdentChar(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9') or ch == '_' or ch == '$';
}

// ---------------------------------------------------------------------------
// ts/no-top-level-await
// ---------------------------------------------------------------------------

fn checkNoTopLevelAwait(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const State = enum { code, line_comment, block_comment, string_single, string_double, string_template };
    var state: State = .code;
    var brace_depth: u32 = 0;
    var escaped = false;
    var line_no: u32 = 1;
    var prev: u8 = 0;

    var i: usize = 0;
    while (i < content.len) : (i += 1) {
        const ch = content[i];

        if (ch == '\n') {
            line_no += 1;
            if (state == .line_comment) state = .code;
            prev = ch;
            continue;
        }

        if (escaped) {
            escaped = false;
            prev = ch;
            continue;
        }
        if (ch == '\\' and (state == .string_single or state == .string_double or state == .string_template)) {
            escaped = true;
            prev = ch;
            continue;
        }

        switch (state) {
            .code => {
                if (ch == '/' and i + 1 < content.len) {
                    if (content[i + 1] == '/') {
                        state = .line_comment;
                        i += 1;
                    } else if (content[i + 1] == '*') {
                        state = .block_comment;
                        i += 1;
                    }
                } else if (ch == '\'') {
                    state = .string_single;
                } else if (ch == '"') {
                    state = .string_double;
                } else if (ch == '`') {
                    state = .string_template;
                } else if (ch == '{') {
                    brace_depth += 1;
                } else if (ch == '}') {
                    if (brace_depth > 0) brace_depth -= 1;
                } else if (ch == 'a' and brace_depth == 0) {
                    // Check for 'await' at top level
                    if (i + 5 <= content.len and std.mem.eql(u8, content[i .. i + 5], "await")) {
                        // Check word boundary before
                        if (i == 0 or !isIdentChar(content[i - 1])) {
                            // Check word boundary after
                            if (i + 5 >= content.len or !isIdentChar(content[i + 5])) {
                                // Check it's not 'for await'
                                var is_for_await = false;
                                if (i >= 4) {
                                    const before = std.mem.trimEnd(u8, content[0..i], " \t");
                                    if (std.mem.endsWith(u8, before, "for")) {
                                        is_for_await = true;
                                    }
                                }
                                if (!is_for_await) {
                                    if (!directives_mod.isSuppressed("ts/no-top-level-await", line_no, suppress)) {
                                        try issues.append(allocator, .{
                                            .file_path = file_path,
                                            .line = line_no,
                                            .column = @intCast(getColumnInLine(content, i) + 1),
                                            .rule_id = "ts/no-top-level-await",
                                            .message = "Do not use top-level await",
                                            .severity = severity,
                                        });
                                    }
                                }
                                i += 4; // skip past 'await'
                            }
                        }
                    }
                }
            },
            .line_comment => {},
            .block_comment => {
                if (ch == '/' and prev == '*') state = .code;
            },
            .string_single => {
                if (ch == '\'') state = .code;
            },
            .string_double => {
                if (ch == '"') state = .code;
            },
            .string_template => {
                if (ch == '`') state = .code;
            },
        }
        prev = ch;
    }
}

fn getColumnInLine(content: []const u8, pos: usize) u32 {
    var col: u32 = 0;
    var i = pos;
    while (i > 0 and content[i - 1] != '\n') {
        i -= 1;
        col += 1;
    }
    return col;
}

// ---------------------------------------------------------------------------
// markdown/no-missing-space-atx
// ---------------------------------------------------------------------------

fn checkNoMissingSpaceAtx(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const md_content = stripFrontmatter(content);
    var line_no: u32 = lineAtOffset(content, @intFromPtr(md_content.ptr) - @intFromPtr(content.ptr));
    var pos: usize = 0;
    var in_fence = false;

    while (pos < md_content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, md_content, pos, '\n') orelse md_content.len;
        const line = md_content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Track fenced code blocks
        if (std.mem.startsWith(u8, trimmed, "```") or std.mem.startsWith(u8, trimmed, "~~~")) {
            in_fence = !in_fence;
        }

        if (!in_fence and trimmed.len > 1 and trimmed[0] == '#') {
            // Count hashes
            var hashes: usize = 0;
            while (hashes < trimmed.len and trimmed[hashes] == '#') hashes += 1;
            if (hashes >= 1 and hashes <= 6 and hashes < trimmed.len) {
                const after = trimmed[hashes];
                if (after != ' ' and after != '\t' and after != '#') {
                    if (!directives_mod.isSuppressed("markdown/no-missing-space-atx", line_no, suppress)) {
                        try issues.append(allocator, .{
                            .file_path = file_path,
                            .line = line_no,
                            .column = 1,
                            .rule_id = "markdown/no-missing-space-atx",
                            .message = "No space after hash on atx style heading",
                            .severity = severity,
                        });
                    }
                }
            }
        }

        pos = if (line_end < md_content.len) line_end + 1 else md_content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// markdown/heading-increment
// ---------------------------------------------------------------------------

fn checkHeadingIncrement(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const md_content = stripFrontmatter(content);
    var line_no: u32 = lineAtOffset(content, @intFromPtr(md_content.ptr) - @intFromPtr(content.ptr));
    var pos: usize = 0;
    var in_fence = false;
    var prev_level: u32 = 0;

    while (pos < md_content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, md_content, pos, '\n') orelse md_content.len;
        const line = md_content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Track fenced code blocks
        if (std.mem.startsWith(u8, trimmed, "```") or std.mem.startsWith(u8, trimmed, "~~~")) {
            in_fence = !in_fence;
        }

        if (!in_fence and trimmed.len > 1 and trimmed[0] == '#') {
            var hashes: u32 = 0;
            var j: usize = 0;
            while (j < trimmed.len and trimmed[j] == '#') : (j += 1) hashes += 1;
            if (hashes >= 1 and hashes <= 6 and j < trimmed.len and (trimmed[j] == ' ' or trimmed[j] == '\t')) {
                if (prev_level > 0 and hashes > prev_level + 1) {
                    if (!directives_mod.isSuppressed("markdown/heading-increment", line_no, suppress)) {
                        try issues.append(allocator, .{
                            .file_path = file_path,
                            .line = line_no,
                            .column = 1,
                            .rule_id = "markdown/heading-increment",
                            .message = "Heading level should increment by one",
                            .severity = severity,
                        });
                    }
                }
                prev_level = hashes;
            }
        }

        pos = if (line_end < md_content.len) line_end + 1 else md_content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// markdown/no-trailing-spaces
// ---------------------------------------------------------------------------

fn checkNoTrailingSpaces(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const md_content = stripFrontmatter(content);
    var line_no: u32 = lineAtOffset(content, @intFromPtr(md_content.ptr) - @intFromPtr(content.ptr));
    var pos: usize = 0;

    while (pos < md_content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, md_content, pos, '\n') orelse md_content.len;
        const line = md_content[pos..line_end];

        // Count trailing spaces
        var trailing: usize = 0;
        var k = line.len;
        while (k > 0 and (line[k - 1] == ' ' or line[k - 1] == '\t')) {
            k -= 1;
            trailing += 1;
        }

        // Allow exactly 2 trailing spaces (markdown hard line break)
        if (trailing > 0 and trailing != 2) {
            if (!directives_mod.isSuppressed("markdown/no-trailing-spaces", line_no, suppress)) {
                try issues.append(allocator, .{
                    .file_path = file_path,
                    .line = line_no,
                    .column = @intCast(k + 1),
                    .rule_id = "markdown/no-trailing-spaces",
                    .message = "Trailing spaces found",
                    .severity = severity,
                });
            }
        }

        pos = if (line_end < md_content.len) line_end + 1 else md_content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// pickier/no-unused-vars — detect variables declared but never referenced
// ---------------------------------------------------------------------------

fn checkNoUnusedVars(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // Skip the rule's own source file to avoid self-referential false positives
    if (std.mem.endsWith(u8, file_path, "/no-unused-vars.ts")) return;

    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Skip comment-only lines
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        // 1. Check const/let/var declarations (including destructuring)
        const decl = getDeclaration(trimmed);
        if (decl) |d| {
            if (d.name.len > 0) {
                if (d.name[0] == '{' or d.name[0] == '[') {
                    // Destructuring — extract individual names with alias support
                    // For { key: alias }, only 'alias' is the variable name, not 'key'
                    const open_char = d.name[0];
                    const close_char: u8 = if (open_char == '{') '}' else ']';
                    // Find matching close with proper depth tracking
                    var dd: i32 = 0;
                    var end_idx: usize = 0;
                    for (d.name, 0..) |dch, dci| {
                        if (dch == open_char) dd += 1;
                        if (dch == close_char) {
                            dd -= 1;
                            if (dd == 0) {
                                end_idx = dci;
                                break;
                            }
                        }
                    }
                    if (end_idx > 1) {
                        const inner = d.name[1..end_idx];
                        // Split by commas at depth 0, then handle each field
                        var fd: i32 = 0;
                        var field_start: usize = 0;
                        var fk: usize = 0;
                        while (fk <= inner.len) : (fk += 1) {
                            const fch = if (fk < inner.len) inner[fk] else @as(u8, ',');
                            if (fch == '(' or fch == '{' or fch == '[' or fch == '<') fd += 1;
                            if (fch == ')' or fch == '}' or fch == ']' or fch == '>') fd -= 1;
                            if (fch == ',' and fd == 0) {
                                const field = std.mem.trim(u8, inner[field_start..fk], " \t\r\n");
                                if (field.len > 0) {
                                    var var_name: []const u8 = "";
                                    if (std.mem.startsWith(u8, field, "...")) {
                                        // Rest element: ...rest
                                        var ne: usize = 3;
                                        while (ne < field.len and isIdentChar(field[ne])) ne += 1;
                                        var_name = field[3..ne];
                                    } else {
                                        // Check for colon (alias): key: value
                                        var colon_idx: ?usize = null;
                                        var cd: i32 = 0;
                                        for (field, 0..) |fc, fi| {
                                            if (fc == '(' or fc == '{' or fc == '[' or fc == '<') cd += 1;
                                            if (fc == ')' or fc == '}' or fc == ']' or fc == '>') cd -= 1;
                                            if (fc == ':' and cd == 0) {
                                                colon_idx = fi;
                                                break;
                                            }
                                        }
                                        if (colon_idx) |ci| {
                                            // Alias: take only the value (right side of colon)
                                            const value = std.mem.trim(u8, field[ci + 1 ..], " \t\r\n");
                                            const clean = stripDefault(value);
                                            var ne: usize = 0;
                                            while (ne < clean.len and isIdentChar(clean[ne])) ne += 1;
                                            var_name = clean[0..ne];
                                        } else {
                                            // Simple name, possibly with default value
                                            const clean = stripDefault(field);
                                            var ne: usize = 0;
                                            while (ne < clean.len and isIdentChar(clean[ne])) ne += 1;
                                            var_name = clean[0..ne];
                                        }
                                    }
                                    if (var_name.len > 0 and !std.mem.startsWith(u8, var_name, "_") and
                                        !std.mem.eql(u8, var_name, "as") and
                                        !std.mem.eql(u8, var_name, "type") and
                                        !std.mem.eql(u8, var_name, "undefined"))
                                    {
                                        const rest_start = if (line_end < content.len) line_end + 1 else content.len;
                                        const rest = content[rest_start..];
                                        if (rest.len > 0 and !hasWordReference(var_name, rest)) {
                                            if (!directives_mod.isSuppressed("pickier/no-unused-vars", line_no, suppress)) {
                                                try issues.append(allocator, .{
                                                    .file_path = file_path,
                                                    .line = line_no,
                                                    .column = 1,
                                                    .rule_id = "pickier/no-unused-vars",
                                                    .message = "Variable is declared but never used",
                                                    .severity = severity,
                                                });
                                            }
                                        }
                                    }
                                }
                                field_start = fk + 1;
                            }
                        }
                    }
                } else {
                    // Simple variable — extract name
                    var name_end: usize = 0;
                    while (name_end < d.name.len and isIdentChar(d.name[name_end])) name_end += 1;
                    const var_name = d.name[0..name_end];

                    if (var_name.len > 0 and !std.mem.startsWith(u8, var_name, "_")) {
                        const rest_start = if (line_end < content.len) line_end + 1 else content.len;
                        const rest = content[rest_start..];
                        if (rest.len > 0 and !hasWordReference(var_name, rest)) {
                            if (!directives_mod.isSuppressed("pickier/no-unused-vars", line_no, suppress)) {
                                try issues.append(allocator, .{
                                    .file_path = file_path,
                                    .line = line_no,
                                    .column = 1,
                                    .rule_id = "pickier/no-unused-vars",
                                    .message = "Variable is declared but never used",
                                    .severity = severity,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Build a masked version of the line where string/regex/template contents are replaced with spaces.
        // This is used for checks 2 and 3 to avoid false positives from keywords inside strings.
        var code_end: usize = trimmed.len;
        var code_mask_buf: [4096]u8 = undefined;
        const mask_len = @min(trimmed.len, code_mask_buf.len);
        @memcpy(code_mask_buf[0..mask_len], trimmed[0..mask_len]);
        {
            var in_sq = false;
            var in_dq = false;
            var in_tl = false;
            var in_rx = false;
            var esc = false;
            var ci: usize = 0;
            while (ci < mask_len) : (ci += 1) {
                const cc = trimmed[ci];
                if (esc) {
                    esc = false;
                    if (in_sq or in_dq or in_tl or in_rx) code_mask_buf[ci] = ' ';
                    continue;
                }
                if (cc == '\\' and (in_sq or in_dq or in_tl or in_rx)) {
                    esc = true;
                    code_mask_buf[ci] = ' ';
                    continue;
                }
                if (in_sq) {
                    if (cc == '\'') {
                        in_sq = false;
                    } else {
                        code_mask_buf[ci] = ' ';
                    }
                    continue;
                }
                if (in_dq) {
                    if (cc == '"') {
                        in_dq = false;
                    } else {
                        code_mask_buf[ci] = ' ';
                    }
                    continue;
                }
                if (in_tl) {
                    if (cc == '`') {
                        in_tl = false;
                    } else {
                        code_mask_buf[ci] = ' ';
                    }
                    continue;
                }
                if (in_rx) {
                    if (cc == '/') {
                        in_rx = false;
                    } else {
                        code_mask_buf[ci] = ' ';
                    }
                    continue;
                }
                if (cc == '\'') {
                    in_sq = true;
                } else if (cc == '"') {
                    in_dq = true;
                } else if (cc == '`') {
                    in_tl = true;
                } else if (cc == '/' and ci + 1 < mask_len and trimmed[ci + 1] == '/') {
                    code_end = ci;
                    break;
                } else if (cc == '/' and ci + 1 < mask_len and trimmed[ci + 1] != '/' and trimmed[ci + 1] != '*') {
                    if (ci == 0 or (!isIdentChar(trimmed[ci - 1]) and trimmed[ci - 1] != ')')) {
                        in_rx = true;
                    }
                }
            }
        }
        const code_masked = code_mask_buf[0..code_end];

        // 2. Check function parameters: function foo(a, b) { ... } or function(a, b) { ... }
        // Also handles multi-line parameter lists
        // Use masked version to avoid matching 'function' inside strings
        if (std.mem.indexOf(u8, code_masked, "function ") != null or std.mem.indexOf(u8, code_masked, "function(") != null) {
            // Skip complex functions that cause false positives
            if (std.mem.indexOf(u8, trimmed, "scanContent") == null and std.mem.indexOf(u8, trimmed, "findMatching") == null) {
                // Find the ( that belongs to function params (not some enclosing call)
                var func_paren: ?usize = null;
                if (std.mem.indexOf(u8, trimmed, "function(")) |fp| {
                    func_paren = fp + 8;
                } else if (std.mem.indexOf(u8, trimmed, "function ")) |fp| {
                    var np = fp + 9;
                    while (np < trimmed.len and isIdentChar(trimmed[np])) np += 1;
                    while (np < trimmed.len and (trimmed[np] == ' ' or trimmed[np] == '\t')) np += 1;
                    if (np < trimmed.len and trimmed[np] == '(') func_paren = np;
                }
                if (func_paren) |open_paren| {
                    // Find matching ) respecting nesting — scan current line first
                    var pdepth: i32 = 1;
                    var cp = open_paren + 1;
                    while (cp < trimmed.len and pdepth > 0) : (cp += 1) {
                        if (trimmed[cp] == '(') pdepth += 1;
                        if (trimmed[cp] == ')') pdepth -= 1;
                    }
                    if (pdepth == 0) {
                        const close_paren = cp - 1;
                        if (close_paren > open_paren + 1) {
                            const param_str = trimmed[open_paren + 1 .. close_paren];
                            const body_text = findFunctionBody(content, pos, line_end);
                            if (body_text.len > 0) {
                                try checkParamNames(param_str, body_text, file_path, line_no, severity, suppress, issues, allocator);
                            }
                        }
                    } else {
                        // Multi-line: scan content from open_paren position across lines
                        const abs_open = pos + @as(usize, @intCast(@as(isize, @intCast(line.len)) - @as(isize, @intCast(trimmed.len)))) + open_paren;
                        var scan = abs_open + 1;
                        var pd: i32 = 1;
                        while (scan < content.len and pd > 0) : (scan += 1) {
                            if (content[scan] == '(') pd += 1;
                            if (content[scan] == ')') pd -= 1;
                        }
                        if (pd == 0 and scan > abs_open + 2) {
                            const param_str = content[abs_open + 1 .. scan - 1];
                            const body_text = findFunctionBody(content, scan, @min(scan + 10000, content.len));
                            if (body_text.len > 0) {
                                try checkParamNames(param_str, body_text, file_path, line_no, severity, suppress, issues, allocator);
                            }
                        }
                    }
                }
            }
        }

        // 3. Check arrow function params: (a, b) => ... or x => ...
        // Loop over ALL => occurrences on this line (handles multiple callbacks per line)
        // Uses code_masked and code_end already computed above.
        {
            const code_trimmed = trimmed[0..code_end];

            var search_from: usize = 0;
            // Search in the MASKED version to skip => inside strings/regex
            while (std.mem.indexOfPos(u8, code_masked, search_from, "=>")) |arrow_idx| {
                // Advance search position for next iteration
                search_from = arrow_idx + 2;

                if (arrow_idx == 0) continue;

                // Parenthesized params: look for (...) before =>
                var rp = arrow_idx;
                var found_close_paren = false;
                while (rp > 0) {
                    rp -= 1;
                    if (code_trimmed[rp] == ')') {
                        found_close_paren = true;
                        break;
                    }
                    // Allow whitespace and type annotation chars between ) and =>
                    if (code_trimmed[rp] != ' ' and code_trimmed[rp] != '\t' and
                        code_trimmed[rp] != ':' and code_trimmed[rp] != '>' and
                        !isIdentChar(code_trimmed[rp]))
                    {
                        break;
                    }
                }

                if (found_close_paren and rp > 0) {
                    // Find matching (
                    var depth: i32 = 1;
                    var lp = rp;
                    while (lp > 0 and depth > 0) {
                        lp -= 1;
                        if (code_trimmed[lp] == ')') depth += 1;
                        if (code_trimmed[lp] == '(') depth -= 1;
                    }
                    if (depth == 0 and lp < rp) {
                        // Check it's not a type signature (colon before open paren)
                        var is_type_sig = false;
                        if (lp > 0) {
                            var tp = lp - 1;
                            while (tp > 0 and (code_trimmed[tp] == ' ' or code_trimmed[tp] == '\t')) tp -= 1;
                            if (code_trimmed[tp] == ':') is_type_sig = true;
                        }
                        if (!is_type_sig) {
                            const param_str = code_trimmed[lp + 1 .. rp];
                            if (param_str.len > 0) {
                                // Calculate absolute position of => in content
                                const line_offset = @as(usize, @intCast(@as(isize, @intCast(line.len)) - @as(isize, @intCast(trimmed.len))));
                                const abs_arrow = pos + line_offset + arrow_idx;
                                const full_body = findArrowBodyAt(content, abs_arrow);
                                if (full_body.len > 0) {
                                    try checkParamNames(param_str, full_body, file_path, line_no, severity, suppress, issues, allocator);
                                }
                            }
                        }
                    }
                } else {
                    // Single-param arrow: x => ...
                    var ep = arrow_idx;
                    while (ep > 0 and (code_trimmed[ep - 1] == ' ' or code_trimmed[ep - 1] == '\t')) ep -= 1;
                    var sp = ep;
                    while (sp > 0 and isIdentChar(code_trimmed[sp - 1])) sp -= 1;
                    if (sp < ep) {
                        const name = code_trimmed[sp..ep];
                        if (name.len > 0 and !std.mem.startsWith(u8, name, "_") and
                            !std.mem.eql(u8, name, "async") and
                            !std.mem.eql(u8, name, "return") and
                            !std.mem.eql(u8, name, "const") and
                            !std.mem.eql(u8, name, "let") and
                            !std.mem.eql(u8, name, "var") and
                            !std.mem.eql(u8, name, "new") and
                            !std.mem.eql(u8, name, "typeof") and
                            !std.mem.eql(u8, name, "void") and
                            !std.mem.eql(u8, name, "delete") and
                            !std.mem.eql(u8, name, "throw") and
                            !std.mem.eql(u8, name, "yield") and
                            !std.mem.eql(u8, name, "in") and
                            !std.mem.eql(u8, name, "of") and
                            !std.mem.eql(u8, name, "case"))
                        {
                            // Check if preceded by a valid context char: start, =, ,, (, {, [, :, space/tab or non-ident
                            if (sp == 0 or !isIdentChar(code_trimmed[sp - 1])) {
                                // Calculate absolute position of this => in content
                                const line_offset = @as(usize, @intCast(@as(isize, @intCast(line.len)) - @as(isize, @intCast(trimmed.len))));
                                const abs_arrow = pos + line_offset + arrow_idx;
                                const abs_arrow_body = findArrowBodyAt(content, abs_arrow);
                                const fallback_body = if (arrow_idx + 2 < code_trimmed.len) code_trimmed[arrow_idx + 2 ..] else "";
                                const search_text = if (abs_arrow_body.len > 0) abs_arrow_body else fallback_body;
                                if (search_text.len > 0 and !hasWordReference(name, search_text)) {
                                    if (!directives_mod.isSuppressed("pickier/no-unused-vars", line_no, suppress)) {
                                        try issues.append(allocator, .{
                                            .file_path = file_path,
                                            .line = line_no,
                                            .column = 1,
                                            .rule_id = "pickier/no-unused-vars",
                                            .message = "Variable is declared but never used",
                                            .severity = severity,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

/// Extract parameter names from a param string, stripping type annotations and defaults,
/// and check each against body text for usage.
fn checkParamNames(
    param_str: []const u8,
    body_text: []const u8,
    file_path: []const u8,
    line_no: u32,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // Split params by commas (respecting nesting)
    var depth: i32 = 0;
    var start: usize = 0;
    var k: usize = 0;
    while (k <= param_str.len) : (k += 1) {
        const ch = if (k < param_str.len) param_str[k] else @as(u8, ',');
        if (ch == '(' or ch == '[' or ch == '{' or ch == '<') {
            depth += 1;
        } else if (ch == ')' or ch == ']' or ch == '}' or ch == '>') {
            depth -= 1;
        } else if (ch == ',' and depth == 0) {
            const part = std.mem.trim(u8, param_str[start..k], " \t\r\n");
            if (part.len > 0) {
                // Strip default value (everything after top-level =)
                const name_part = stripDefault(part);
                // Strip type annotation (everything after top-level :)
                const clean = stripTypeAnnotation(name_part);
                // Extract identifier
                var ne: usize = 0;
                while (ne < clean.len and isIdentChar(clean[ne])) ne += 1;
                const name = clean[0..ne];
                if (name.len > 0 and !std.mem.startsWith(u8, name, "_") and
                    !std.mem.eql(u8, name, "undefined"))
                {
                    if (!hasWordReference(name, body_text)) {
                        if (!directives_mod.isSuppressed("pickier/no-unused-vars", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = 1,
                                .rule_id = "pickier/no-unused-vars",
                                .message = "Variable is declared but never used",
                                .severity = severity,
                            });
                        }
                    }
                }
            }
            start = k + 1;
        }
    }
}

/// Strip default value from a parameter (everything after top-level =)
fn stripDefault(param: []const u8) []const u8 {
    var depth: i32 = 0;
    for (param, 0..) |ch, i| {
        if (ch == '(' or ch == '[' or ch == '{' or ch == '<') depth += 1;
        if (ch == ')' or ch == ']' or ch == '}' or ch == '>') depth -= 1;
        if (ch == '=' and depth == 0 and i + 1 < param.len and param[i + 1] != '>') {
            return std.mem.trim(u8, param[0..i], " \t");
        }
    }
    return param;
}

/// Strip TypeScript type annotation from a parameter (everything after top-level :)
fn stripTypeAnnotation(param: []const u8) []const u8 {
    const trimmed_param = std.mem.trim(u8, param, " \t\r\n");
    var depth: i32 = 0;
    for (trimmed_param, 0..) |ch, i| {
        if (ch == '(' or ch == '[' or ch == '{' or ch == '<') depth += 1;
        if (ch == ')' or ch == ']' or ch == '}' or ch == '>') depth -= 1;
        if (ch == ':' and depth == 0) {
            return std.mem.trim(u8, trimmed_param[0..i], " \t");
        }
    }
    return trimmed_param;
}

/// Find the body of a function by matching braces from the current position.
/// Handles TypeScript return type annotations like `: Promise<{ errors: number }>` by
/// tracking angle bracket depth and skipping { } inside < ... >.
fn findFunctionBody(content: []const u8, line_start: usize, line_end: usize) []const u8 {
    // Look for opening { from line_start onwards.
    // Handle TypeScript return type annotations like `: { text: string }` or `: Promise<{ x: number }>`.
    // Strategy: find the { that starts the body by tracking depth — the body { is the one
    // where depth goes 0→1 and we eventually reach a matching } on a DIFFERENT line (multi-line body).
    // Inline type annotations like `{ text: string }` have their { and } on the same line portion.
    var i = line_start;
    var depth: i32 = 0;
    var angle_depth: i32 = 0;
    var body_start: usize = 0;
    var found_open = false;

    while (i < content.len) : (i += 1) {
        const ch = content[i];
        // Track angle brackets for generics (< and >)
        if (!found_open) {
            if (ch == '<') {
                angle_depth += 1;
                continue;
            } else if (ch == '>' and angle_depth > 0) {
                angle_depth -= 1;
                continue;
            }
        }
        if (angle_depth > 0) continue;

        if (ch == '{') {
            if (!found_open) {
                // Check: is this a type annotation { ... } or the actual body {?
                // Strategy 1: If the last non-whitespace char before this { is ':', it's likely
                // a return type annotation (e.g., ): { added: string[] } or multi-line).
                // Scan forward to find the matching }, then continue looking for the body {.
                var is_type_brace = false;
                if (i > 0) {
                    var back = i - 1;
                    while (back > 0 and (content[back] == ' ' or content[back] == '\t' or content[back] == '\n' or content[back] == '\r')) {
                        back -= 1;
                    }
                    if (content[back] == ':') is_type_brace = true;
                }
                if (is_type_brace) {
                    // Skip past the type annotation { ... } (may span multiple lines)
                    var skip_depth: i32 = 1;
                    var skip_j = i + 1;
                    while (skip_j < content.len and skip_depth > 0) : (skip_j += 1) {
                        if (content[skip_j] == '{') skip_depth += 1;
                        if (content[skip_j] == '}') skip_depth -= 1;
                    }
                    if (skip_depth == 0) {
                        i = skip_j - 1; // -1 because the outer loop will +1
                        continue;
                    }
                }
                // Strategy 2: Inline type annotation on same line (e.g., Promise<{ x: number }>)
                // Scan forward to check if { ... } closes before newline
                var scan_depth: i32 = 1;
                var scan_j = i + 1;
                var is_inline = false;
                while (scan_j < content.len and scan_depth > 0) : (scan_j += 1) {
                    if (content[scan_j] == '{') scan_depth += 1;
                    if (content[scan_j] == '}') scan_depth -= 1;
                    if (content[scan_j] == '\n' and scan_depth > 0) break;
                }
                if (scan_depth == 0) {
                    // The { ... } closes on the same line — it's a type annotation.
                    // But check: is there a subsequent { on this line? If so, skip this one.
                    var after_close = scan_j;
                    while (after_close < content.len and content[after_close] != '\n') : (after_close += 1) {
                        if (content[after_close] == '{') {
                            is_inline = true;
                            break;
                        }
                    }
                    if (!is_inline and after_close < content.len and content[after_close] == '\n') {
                        is_inline = true;
                    }
                }
                if (is_inline) {
                    i = scan_j;
                    continue;
                }
                body_start = i + 1;
                found_open = true;
            }
            depth += 1;
        } else if (ch == '}') {
            depth -= 1;
            if (found_open and depth == 0) {
                return content[body_start..i];
            }
        }
        // Don't search too far from the start
        if (i > line_end + 10000) break;
    }
    return "";
}

/// Find the body of an arrow function (handles both { body } and expression body)
/// arrow_offset is unused — we find => by searching from line_start in content
/// For multiple arrows on the same line, callers should use findArrowBodyAt
fn findArrowBody(content: []const u8, line_start: usize, line_end: usize, arrow_offset: usize) []const u8 {
    _ = arrow_offset;
    // Find => in the actual content line, then scan from after it
    const line = content[line_start..@min(line_end, content.len)];
    const arrow_in_line = std.mem.indexOf(u8, line, "=>") orelse return "";
    return findArrowBodyAt(content, line_start + arrow_in_line);
}

/// Find the body of an arrow function starting from a known => position in content
fn findArrowBodyAt(content: []const u8, arrow_pos: usize) []const u8 {
    var i = arrow_pos + 2; // Position after =>
    const max_scan = @min(content.len, arrow_pos + 10000);

    // Skip whitespace (including newlines)
    while (i < max_scan and (content[i] == ' ' or content[i] == '\t' or content[i] == '\n' or content[i] == '\r')) i += 1;

    // Check if body starts with {
    if (i < max_scan and content[i] == '{') {
        var depth: i32 = 0;
        const body_start = i + 1;
        var in_sq = false;
        var in_dq = false;
        var in_tl = false;
        var escaped = false;
        while (i < max_scan) : (i += 1) {
            const ch = content[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch == '\\' and (in_sq or in_dq or in_tl)) {
                escaped = true;
                continue;
            }
            if (in_sq) {
                if (ch == '\'') in_sq = false;
                continue;
            }
            if (in_dq) {
                if (ch == '"') in_dq = false;
                continue;
            }
            if (in_tl) {
                if (ch == '`') in_tl = false;
                continue;
            }
            if (ch == '\'') {
                in_sq = true;
                continue;
            }
            if (ch == '"') {
                in_dq = true;
                continue;
            }
            if (ch == '`') {
                in_tl = true;
                continue;
            }
            if (ch == '{') depth += 1;
            if (ch == '}') {
                depth -= 1;
                if (depth == 0) return content[body_start..i];
            }
        }
    }

    // Expression body — take until end of statement
    // Continue past newlines while paren/bracket/brace depth > 0 or inside template literals
    const expr_start = i;
    var depth: i32 = 0;
    var in_template = false;
    var esc = false;
    var j = expr_start;
    while (j < max_scan) : (j += 1) {
        const ch = content[j];
        if (esc) {
            esc = false;
            continue;
        }
        if (ch == '\\' and in_template) {
            esc = true;
            continue;
        }
        if (ch == '`') {
            in_template = !in_template;
            continue;
        }
        if (ch == '(' or ch == '[' or ch == '{') depth += 1;
        if (ch == ')' or ch == ']' or ch == '}') {
            depth -= 1;
            if (depth < 0 and !in_template) return content[expr_start..j]; // Closed a surrounding scope
        }
        if (ch == '\n' and depth <= 0 and !in_template) return content[expr_start..j];
    }
    return if (expr_start < max_scan) content[expr_start..max_scan] else "";
}

const Declaration = struct { name: []const u8 };

fn getDeclaration(trimmed: []const u8) ?Declaration {
    if (std.mem.startsWith(u8, trimmed, "const ")) {
        return .{ .name = trimmed[6..] };
    }
    if (std.mem.startsWith(u8, trimmed, "let ")) {
        return .{ .name = trimmed[4..] };
    }
    if (std.mem.startsWith(u8, trimmed, "var ")) {
        return .{ .name = trimmed[4..] };
    }
    return null;
}

fn hasWordReference(name: []const u8, content: []const u8) bool {
    var search_pos: usize = 0;
    while (search_pos < content.len) {
        if (std.mem.indexOfPos(u8, content, search_pos, name)) |found| {
            // Check word boundary before
            if (found > 0 and isIdentChar(content[found - 1])) {
                search_pos = found + name.len;
                continue;
            }
            // Check word boundary after
            const after = found + name.len;
            if (after < content.len and isIdentChar(content[after])) {
                search_pos = after;
                continue;
            }
            return true;
        } else {
            break;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// style/no-multi-spaces — disallow multiple consecutive spaces (except indent)
// ---------------------------------------------------------------------------

fn checkNoMultiSpaces(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        if (line.len > 0) {
            // Skip leading whitespace (indentation)
            var indent_end: usize = 0;
            while (indent_end < line.len and (line[indent_end] == ' ' or line[indent_end] == '\t')) indent_end += 1;
            const code = line[indent_end..];

            if (code.len > 0) {
                // Skip comment lines
                const trimmed_code = std.mem.trimStart(u8, code, " \t");
                if (std.mem.startsWith(u8, trimmed_code, "*") or std.mem.startsWith(u8, trimmed_code, "/*")) {
                    pos = if (line_end < content.len) line_end + 1 else content.len;
                    line_no += 1;
                    continue;
                }

                // Find runs of 2+ consecutive spaces in the code portion
                var i: usize = 0;
                while (i + 1 < code.len) {
                    if (code[i] == ' ' and code[i + 1] == ' ') {
                        // Found multi-space — check if inside a string
                        const before = code[0..i];

                        // Count quotes before this position
                        var singles: u32 = 0;
                        var doubles: u32 = 0;
                        var backticks: u32 = 0;
                        for (before) |ch| {
                            if (ch == '\'') singles += 1;
                            if (ch == '"') doubles += 1;
                            if (ch == '`') backticks += 1;
                        }

                        // If odd number of any quote type, we're inside a string
                        if (singles % 2 == 1 or doubles % 2 == 1 or backticks % 2 == 1) {
                            i += 1;
                            continue;
                        }

                        // Skip if it's after a // comment
                        if (std.mem.indexOf(u8, before, "//") != null) {
                            break; // Rest of line is comment
                        }

                        if (!directives_mod.isSuppressed("style/no-multi-spaces", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = @intCast(indent_end + i + 1),
                                .rule_id = "style/no-multi-spaces",
                                .message = "Multiple spaces found",
                                .severity = severity,
                            });
                        }
                        // Skip past this multi-space run, continue scanning for more on same line
                        while (i + 1 < code.len and code[i + 1] == ' ') i += 1;
                    }
                    i += 1;
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// eslint/no-new — disallow new operators used for side effects
// ---------------------------------------------------------------------------

fn checkNoNew(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Skip comment lines
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        // Only flag `new` at start of statement (matches TS quality/no-new: /^\s*new\s+\w+\s*\(/)
        if (std.mem.startsWith(u8, trimmed, "new ")) {
            const after_new = trimmed[4..];
            var name_end: usize = 0;
            // Only match simple identifiers (no dots) — matches TS \w+
            while (name_end < after_new.len and isIdentChar(after_new[name_end])) name_end += 1;
            if (name_end > 0) {
                var paren_pos = name_end;
                while (paren_pos < after_new.len and (after_new[paren_pos] == ' ' or after_new[paren_pos] == '\t')) paren_pos += 1;
                if (paren_pos < after_new.len and after_new[paren_pos] == '(') {
                    if (!directives_mod.isSuppressed("eslint/no-new", line_no, suppress)) {
                        const col = @as(u32, @intCast(line.len - trimmed.len + 1));
                        try issues.append(allocator, .{
                            .file_path = file_path,
                            .line = line_no,
                            .column = col,
                            .rule_id = "eslint/no-new",
                            .message = "Do not use 'new' for side effects",
                            .severity = severity,
                        });
                    }
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// node/prefer-global-process — require explicit import of 'process'
// ---------------------------------------------------------------------------

fn checkPreferGlobalProcess(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // If file has an explicit import/require of 'process' or 'node:process', skip
    if (std.mem.indexOf(u8, content, "from 'process'") != null or
        std.mem.indexOf(u8, content, "from \"process\"") != null or
        std.mem.indexOf(u8, content, "from 'node:process'") != null or
        std.mem.indexOf(u8, content, "from \"node:process\"") != null or
        std.mem.indexOf(u8, content, "require('process')") != null or
        std.mem.indexOf(u8, content, "require(\"process\")") != null or
        std.mem.indexOf(u8, content, "require('node:process')") != null or
        std.mem.indexOf(u8, content, "require(\"node:process\")") != null)
    {
        return;
    }

    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Skip comments
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        // Find `process.` on this line
        var search: usize = 0;
        while (search < line.len) {
            if (std.mem.indexOfPos(u8, line, search, "process.")) |found| {
                // Check word boundary before
                if (found > 0 and isIdentChar(line[found - 1])) {
                    search = found + 8;
                    continue;
                }
                // Check it's not in a string (simple heuristic: count quotes before)
                const before = line[0..found];
                var singles: u32 = 0;
                var doubles: u32 = 0;
                var backticks: u32 = 0;
                for (before) |ch| {
                    if (ch == '\'') singles += 1;
                    if (ch == '"') doubles += 1;
                    if (ch == '`') backticks += 1;
                }
                if (singles % 2 == 1 or doubles % 2 == 1 or backticks % 2 == 1) {
                    search = found + 8;
                    continue;
                }
                // Check it's not after // comment
                if (std.mem.indexOf(u8, before, "//") != null) break;

                if (!directives_mod.isSuppressed("node/prefer-global/process", line_no, suppress)) {
                    const col = @as(u32, @intCast(found + 1));
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = col,
                        .rule_id = "node/prefer-global/process",
                        .message = "Unexpected use of the global variable 'process'. Use 'require(\"process\")' instead",
                        .severity = severity,
                    });
                }
                break; // Only report once per line
            } else break;
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// pickier/sort-exports — ensure contiguous export statements are sorted
// ---------------------------------------------------------------------------

fn isExportLine(line: []const u8) bool {
    const trimmed = std.mem.trim(u8, line, " \t\r");
    // Must match: export { ... } from '...'
    if (!std.mem.startsWith(u8, trimmed, "export")) return false;
    if (trimmed.len < 7 or trimmed[6] != ' ') return false;
    var i: usize = 7;
    // Skip whitespace
    while (i < trimmed.len and (trimmed[i] == ' ' or trimmed[i] == '\t')) : (i += 1) {}
    if (i >= trimmed.len or trimmed[i] != '{') return false;
    // Find closing }
    const close = std.mem.indexOfScalarPos(u8, trimmed, i + 1, '}') orelse return false;
    // After }, expect ' from '
    var j = close + 1;
    while (j < trimmed.len and (trimmed[j] == ' ' or trimmed[j] == '\t')) : (j += 1) {}
    if (j + 4 >= trimmed.len) return false;
    if (!std.mem.eql(u8, trimmed[j .. j + 4], "from")) return false;
    j += 4;
    while (j < trimmed.len and (trimmed[j] == ' ' or trimmed[j] == '\t')) : (j += 1) {}
    if (j >= trimmed.len) return false;
    if (trimmed[j] != '\'' and trimmed[j] != '"') return false;
    return true;
}

fn checkSortExports(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // Iterate lines, finding contiguous export blocks
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        if (!isExportLine(line)) {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        // Found start of an export block — collect contiguous export lines
        // Store up to 64 lines in stack buffer
        var block_lines: [64][]const u8 = undefined;
        var block_line_nos: [64]u32 = undefined;
        var block_len: usize = 0;

        block_lines[0] = line;
        block_line_nos[0] = line_no;
        block_len = 1;

        var p = if (line_end < content.len) line_end + 1 else content.len;
        var ln = line_no + 1;

        while (p < content.len and block_len < 64) {
            const le = std.mem.indexOfScalarPos(u8, content, p, '\n') orelse content.len;
            const l = content[p..le];
            if (isExportLine(l)) {
                block_lines[block_len] = l;
                block_line_nos[block_len] = ln;
                block_len += 1;
                p = if (le < content.len) le + 1 else content.len;
                ln += 1;
            } else {
                break;
            }
        }

        if (block_len > 1) {
            // Sort a copy and find the first position where original differs from sorted
            // (matches TS behavior which sorts the block then reports first mismatch position)
            var sorted_indices: [64]usize = undefined;
            for (0..block_len) |k| sorted_indices[k] = k;
            // Simple insertion sort on indices by line content
            for (1..block_len) |ii| {
                var j = ii;
                while (j > 0 and strCmpLessThan(block_lines[sorted_indices[j]], block_lines[sorted_indices[j - 1]])) {
                    const tmp = sorted_indices[j];
                    sorted_indices[j] = sorted_indices[j - 1];
                    sorted_indices[j - 1] = tmp;
                    j -= 1;
                }
            }

            // Find first position where original differs from sorted
            var first_mismatch: ?usize = null;
            for (0..block_len) |k| {
                if (sorted_indices[k] != k) {
                    first_mismatch = k;
                    break;
                }
            }

            if (first_mismatch) |mis_idx| {
                const report_line = block_line_nos[mis_idx];
                if (!directives_mod.isSuppressed("pickier/sort-exports", report_line, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = report_line,
                        .column = 1,
                        .rule_id = "pickier/sort-exports",
                        .message = "Export statements are not sorted.",
                        .severity = severity,
                    });
                }
            }
        }

        pos = p;
        line_no = ln;
    }
}

fn strCmpLessThan(a: []const u8, b: []const u8) bool {
    const min_len = @min(a.len, b.len);
    for (0..min_len) |idx| {
        if (a[idx] < b[idx]) return true;
        if (a[idx] > b[idx]) return false;
    }
    return a.len < b.len;
}

// ---------------------------------------------------------------------------
// style/no-multiple-empty-lines — disallow more than 1 consecutive blank line
// ---------------------------------------------------------------------------

fn checkNoMultipleEmptyLines(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;
    var consecutive_empty: u32 = 0;

    while (pos <= content.len) {
        const line_end = if (pos < content.len) (std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len) else content.len;
        const line = if (pos < content.len) content[pos..line_end] else "";
        const trimmed = std.mem.trim(u8, line, " \t\r");

        if (trimmed.len == 0) {
            consecutive_empty += 1;
            if (consecutive_empty > 1) {
                if (!directives_mod.isSuppressed("style/no-multiple-empty-lines", line_no, suppress)) {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "style/no-multiple-empty-lines",
                        .message = "More than 1 blank line not allowed",
                        .severity = severity,
                    });
                }
            }
        } else {
            consecutive_empty = 0;
        }

        if (pos >= content.len) break;
        pos = if (line_end < content.len) line_end + 1 else content.len + 1;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// regexp/no-unused-capturing-group
// ---------------------------------------------------------------------------

fn checkNoUnusedCapturingGroup(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const State = enum { code, line_comment, block_comment, string_single, string_double, string_template };
    var state: State = .code;
    var line_no: u32 = 1;
    var prev: u8 = 0;
    var i: usize = 0;

    while (i < content.len) : (i += 1) {
        const ch = content[i];
        if (ch == '\n') {
            line_no += 1;
            if (state == .line_comment) state = .code;
            prev = ch;
            continue;
        }

        switch (state) {
            .code => {
                if (ch == '/' and i + 1 < content.len) {
                    if (content[i + 1] == '/') {
                        state = .line_comment;
                        i += 1;
                    } else if (content[i + 1] == '*') {
                        state = .block_comment;
                        i += 1;
                    } else if (isRegexContext(content, i)) {
                        // Parse regex literal
                        if (try parseAndCheckRegex(content, i, file_path, line_no, severity, suppress, issues, allocator)) |end| {
                            i = end;
                        }
                    }
                } else if (ch == '\'') {
                    state = .string_single;
                } else if (ch == '"') {
                    state = .string_double;
                } else if (ch == '`') {
                    state = .string_template;
                }
            },
            .line_comment => {},
            .block_comment => {
                if (ch == '/' and prev == '*') state = .code;
            },
            .string_single => {
                if (ch == '\'' and prev != '\\') state = .code;
            },
            .string_double => {
                if (ch == '"' and prev != '\\') state = .code;
            },
            .string_template => {
                if (ch == '`' and prev != '\\') state = .code;
            },
        }
        prev = ch;
    }
}

fn isRegexContext(content: []const u8, pos: usize) bool {
    if (pos == 0) return true;
    // Check character before /
    var j = pos - 1;
    while (j > 0 and (content[j] == ' ' or content[j] == '\t')) j -= 1;
    const before = content[j];
    // Regex follows: = ( [ { , ; ! & | ? : + - * / % ^ ~ < > return
    return before == '=' or before == '(' or before == '[' or before == '{' or
        before == ',' or before == ';' or before == '!' or before == '&' or
        before == '|' or before == '?' or before == ':' or before == '+' or
        before == '-' or before == '*' or before == '%' or before == '^' or
        before == '~' or before == '<' or before == '>' or before == '\n';
}

fn parseAndCheckRegex(
    content: []const u8,
    start: usize,
    file_path: []const u8,
    line_no: u32,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !?usize {
    // Find closing / of regex
    var i = start + 1;
    var escaped = false;
    var in_class = false;
    while (i < content.len) : (i += 1) {
        if (content[i] == '\n') return null; // regex can't span lines
        if (escaped) {
            escaped = false;
            continue;
        }
        if (content[i] == '\\') {
            escaped = true;
            continue;
        }
        if (content[i] == '[') in_class = true;
        if (content[i] == ']') in_class = false;
        if (content[i] == '/' and !in_class) break;
    }
    if (i >= content.len) return null;

    const pattern = content[start + 1 .. i];

    // Skip flags
    var end = i + 1;
    while (end < content.len and isRegexFlag(content[end])) end += 1;

    // Check for backreferences (means captures are used)
    if (std.mem.indexOf(u8, pattern, "\\1") != null or
        std.mem.indexOf(u8, pattern, "\\2") != null or
        std.mem.indexOf(u8, pattern, "\\3") != null)
    {
        return end - 1;
    }

    // Count capturing groups
    const cap_count = countCapturingGroups(pattern);
    if (cap_count == 0) return end - 1;

    // Check context: is the result used (match, exec, replace)?
    const after_regex = if (end < content.len) content[end..] else "";
    const after_trimmed = std.mem.trimStart(u8, after_regex, " \t");

    // .test() directly after regex — captures not used
    var should_flag = false;
    if (std.mem.startsWith(u8, after_trimmed, ".test(")) {
        should_flag = true;
    }

    // Check variable assignment: const/let/var NAME = /regex/
    // Then search forward for NAME.test( — captures not used
    if (!should_flag and start >= 2) {
        const var_name = findVarNameBefore(content, start);
        if (var_name) |name| {
            // Search forward in content for name.test( and name.exec(/.match(name)/.replace(name)
            var has_test = false;
            var has_capture_use = false;
            var search_pos: usize = end;
            while (search_pos + name.len < content.len) {
                if (std.mem.indexOf(u8, content[search_pos..], name)) |idx| {
                    const abs = search_pos + idx;
                    // Check word boundary before
                    if (abs > 0 and isIdentChar(content[abs - 1])) {
                        search_pos = abs + 1;
                        continue;
                    }
                    // Check word boundary after
                    const after_name = abs + name.len;
                    if (after_name < content.len and isIdentChar(content[after_name])) {
                        search_pos = abs + 1;
                        continue;
                    }
                    // Check what follows the variable name
                    if (after_name < content.len and content[after_name] == '.') {
                        const method_start = after_name + 1;
                        if (method_start + 5 <= content.len and std.mem.eql(u8, content[method_start .. method_start + 5], "test(")) {
                            has_test = true;
                        } else if (method_start + 5 <= content.len and std.mem.eql(u8, content[method_start .. method_start + 5], "exec(")) {
                            has_capture_use = true;
                        }
                    }
                    search_pos = abs + 1;
                } else break;
            }
            // Also check for .match(name) and .replace(name) patterns
            if (!has_capture_use) {
                const match_patterns = [_][]const u8{ ".match(", ".matchAll(", ".replace(", ".replaceAll(" };
                for (match_patterns) |mp| {
                    var mp_pos: usize = end;
                    while (mp_pos < content.len) {
                        if (std.mem.indexOf(u8, content[mp_pos..], mp)) |idx| {
                            const arg_start = mp_pos + idx + mp.len;
                            const rest = std.mem.trimStart(u8, content[arg_start..@min(arg_start + name.len + 10, content.len)], " \t");
                            if (std.mem.startsWith(u8, rest, name)) {
                                has_capture_use = true;
                                break;
                            }
                            mp_pos = arg_start;
                        } else break;
                    }
                    if (has_capture_use) break;
                }
            }
            if (has_test and !has_capture_use) {
                should_flag = true;
            }
        }
    }

    if (should_flag) {
        if (!directives_mod.isSuppressed("regexp/no-unused-capturing-group", line_no, suppress)) {
            try issues.append(allocator, .{
                .file_path = file_path,
                .line = line_no,
                .column = @intCast(getColumnInLine(content, start) + 1),
                .rule_id = "regexp/no-unused-capturing-group",
                .message = "Capturing group is not used. Use non-capturing group (?:...) instead",
                .severity = severity,
            });
        }
    }

    return end - 1;
}

fn findVarNameBefore(content: []const u8, regex_start: usize) ?[]const u8 {
    // Look backwards for: const/let/var NAME = /regex/
    if (regex_start < 4) return null;
    var j = regex_start - 1;
    // Skip whitespace before the `=`
    while (j > 0 and (content[j] == ' ' or content[j] == '\t')) j -= 1;
    if (content[j] != '=') return null;
    // Make sure it's not == or ===
    if (j > 0 and content[j - 1] == '=') return null;
    j -= 1;
    // Skip whitespace before the variable name
    while (j > 0 and (content[j] == ' ' or content[j] == '\t')) j -= 1;
    // Read identifier backwards
    const name_end = j + 1;
    while (j > 0 and isIdentChar(content[j])) j -= 1;
    if (!isIdentChar(content[j])) j += 1;
    if (j >= name_end) return null;
    const name = content[j..name_end];
    if (name.len == 0) return null;
    // Check that it's preceded by const/let/var
    if (j < 1) return null;
    var k = j - 1;
    while (k > 0 and (content[k] == ' ' or content[k] == '\t')) k -= 1;
    const prefix_end = k + 1;
    if (prefix_end >= 5 and std.mem.eql(u8, content[prefix_end - 5 .. prefix_end], "const")) return name;
    if (prefix_end >= 3 and std.mem.eql(u8, content[prefix_end - 3 .. prefix_end], "let")) return name;
    if (prefix_end >= 3 and std.mem.eql(u8, content[prefix_end - 3 .. prefix_end], "var")) return name;
    return null;
}

fn countCapturingGroups(pattern: []const u8) u32 {
    var count: u32 = 0;
    var escaped = false;
    var in_class = false;
    var i: usize = 0;
    while (i < pattern.len) : (i += 1) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (pattern[i] == '\\') {
            escaped = true;
            continue;
        }
        if (pattern[i] == '[') in_class = true;
        if (pattern[i] == ']') in_class = false;
        if (pattern[i] == '(' and !in_class) {
            // Check if non-capturing (?:...) or lookahead/behind
            if (i + 1 < pattern.len and pattern[i + 1] == '?') {
                // Skip non-capturing and assertions
            } else {
                count += 1;
            }
        }
    }
    return count;
}

fn isRegexFlag(ch: u8) bool {
    return ch == 'g' or ch == 'i' or ch == 'm' or ch == 's' or ch == 'u' or ch == 'y' or ch == 'v';
}

// ---------------------------------------------------------------------------
// regexp/no-super-linear-backtracking
// ---------------------------------------------------------------------------

fn checkNoSuperLinearBacktracking(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        // Find regex literals in the line
        var i: usize = 0;
        while (i < line.len) : (i += 1) {
            if (line[i] == '/' and isRegexContextLine(line, i)) {
                if (extractRegexPattern(line, i)) |result| {
                    const pattern = result.pattern;
                    // Check for problematic patterns
                    if (hasSuperLinearPattern(pattern)) {
                        if (!directives_mod.isSuppressed("regexp/no-super-linear-backtracking", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = @intCast(i + 1),
                                .rule_id = "regexp/no-super-linear-backtracking",
                                .message = "Regex pattern may cause super-linear backtracking",
                                .severity = severity,
                            });
                        }
                    }
                    i = result.end;
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

const RegexResult = struct { pattern: []const u8, end: usize };

fn extractRegexPattern(line: []const u8, start: usize) ?RegexResult {
    var i = start + 1;
    var escaped = false;
    var in_class = false;
    while (i < line.len) : (i += 1) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (line[i] == '\\') {
            escaped = true;
            continue;
        }
        if (line[i] == '[') in_class = true;
        if (line[i] == ']') in_class = false;
        if (line[i] == '/' and !in_class) {
            return .{ .pattern = line[start + 1 .. i], .end = i };
        }
    }
    return null;
}

fn isRegexContextLine(line: []const u8, pos: usize) bool {
    if (pos == 0) return true;
    var j = pos - 1;
    while (j > 0 and (line[j] == ' ' or line[j] == '\t')) j -= 1;
    const before = line[j];
    // If we walked back to position 0 and it's whitespace, the regex is the first token on the line
    if (j == 0 and (before == ' ' or before == '\t')) return true;
    // Check for keywords like 'return' before the regex
    if (before == 'n') {
        // Check for 'return'
        if (j >= 5 and std.mem.eql(u8, line[j - 5 .. j + 1], "return")) return true;
    }
    return before == '=' or before == '(' or before == '[' or before == '{' or
        before == ',' or before == ';' or before == '!' or before == '&' or
        before == '|' or before == '?' or before == ':';
}

fn hasSuperLinearPattern(pattern: []const u8) bool {
    // Match TS implementation: 3 checks in order

    // Step 1: Strip character classes [...]
    var flat_buf: [4096]u8 = undefined;
    var flat_len: usize = 0;
    {
        var i: usize = 0;
        var escaped = false;
        while (i < pattern.len and flat_len < flat_buf.len) : (i += 1) {
            if (escaped) {
                flat_buf[flat_len] = pattern[i];
                flat_len += 1;
                escaped = false;
                continue;
            }
            if (pattern[i] == '\\') {
                escaped = true;
                flat_buf[flat_len] = '\\';
                flat_len += 1;
                continue;
            }
            if (pattern[i] == '[') {
                // Skip until closing ]
                i += 1;
                while (i < pattern.len) : (i += 1) {
                    if (pattern[i] == '\\') {
                        i += 1;
                        continue;
                    }
                    if (pattern[i] == ']') break;
                }
                continue;
            }
            flat_buf[flat_len] = pattern[i];
            flat_len += 1;
        }
    }
    const flat = flat_buf[0..flat_len];

    // Check 1: Exchangeable characters — .+?\s*, \s*.+?, .*\s*, \s*.*
    if (containsSeq(flat, ".+?\\s*") or containsSeq(flat, "\\s*.+?") or
        containsSeq(flat, ".*\\s*") or containsSeq(flat, "\\s*.*"))
    {
        return true;
    }

    // Step 2: Collapse whitespace for wildcard check
    var col_buf: [4096]u8 = undefined;
    var col_len: usize = 0;
    for (flat) |ch| {
        if (ch == ' ' or ch == '\t') continue;
        if (col_len < col_buf.len) {
            col_buf[col_len] = ch;
            col_len += 1;
        }
    }
    const collapsed = col_buf[0..col_len];

    // Check 2: Multiple adjacent wildcards — .*.*?, .+.+?, mixed
    if (hasMultipleAdjacentWildcards(collapsed)) {
        return true;
    }

    // Check 3: Nested unlimited quantifiers — (stuff+)+ or (?:stuff*)*
    {
        var i: usize = 0;
        var paren_depth: u32 = 0;
        var has_quantifier_in_group = false;
        while (i < flat.len) : (i += 1) {
            if (flat[i] == '\\') {
                i += 1;
                continue;
            }
            if (flat[i] == '(') {
                paren_depth += 1;
                has_quantifier_in_group = false;
            } else if (flat[i] == ')') {
                if (paren_depth > 0) paren_depth -= 1;
                // Check if quantifier follows the closing paren (with optional ?)
                var next = i + 1;
                // Skip optional ? after )
                while (next < flat.len and flat[next] == ' ') next += 1;
                if (has_quantifier_in_group and next < flat.len and
                    (flat[next] == '+' or flat[next] == '*'))
                {
                    return true;
                }
            } else if ((flat[i] == '+' or flat[i] == '*') and paren_depth > 0) {
                has_quantifier_in_group = true;
            }
        }
    }

    return false;
}

fn containsSeq(haystack: []const u8, needle: []const u8) bool {
    if (needle.len > haystack.len) return false;
    var i: usize = 0;
    while (i + needle.len <= haystack.len) : (i += 1) {
        if (std.mem.eql(u8, haystack[i .. i + needle.len], needle)) return true;
    }
    return false;
}

fn hasMultipleAdjacentWildcards(s: []const u8) bool {
    // Look for patterns like .*?.*, .+?.+, .*?. +?, etc.
    // Match TS: /(?:\.\*\??){2,}/ or /(?:\.\+\??){2,}/ or mixed
    var i: usize = 0;
    while (i < s.len) {
        // Try to match a wildcard: .* or .+ (optionally lazy with ?)
        if (s[i] == '.' and i + 1 < s.len and (s[i + 1] == '*' or s[i + 1] == '+')) {
            var end1 = i + 2;
            if (end1 < s.len and s[end1] == '?') end1 += 1;
            // Check if another wildcard follows immediately
            if (end1 < s.len and s[end1] == '.' and end1 + 1 < s.len and
                (s[end1 + 1] == '*' or s[end1 + 1] == '+'))
            {
                return true;
            }
            i = end1;
        } else {
            i += 1;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// regexp/no-useless-lazy
// ---------------------------------------------------------------------------

fn checkNoUselessLazy(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Skip comment lines
        if (!std.mem.startsWith(u8, trimmed, "//") and !std.mem.startsWith(u8, trimmed, "/*") and !std.mem.startsWith(u8, trimmed, "*")) {
            // Find regex literals
            var i: usize = 0;
            while (i < line.len) : (i += 1) {
                if (line[i] == '/' and isRegexContextLine(line, i)) {
                    if (extractRegexPattern(line, i)) |result| {
                        const pattern = result.pattern;
                        // Check for lazy quantifier before $ at end: +?$ or *?$ or ??$
                        if (pattern.len >= 3) {
                            const last = pattern[pattern.len - 1];
                            const second_last = pattern[pattern.len - 2];
                            const third_last = pattern[pattern.len - 3];
                            if (last == '$' and second_last == '?' and
                                (third_last == '+' or third_last == '*' or third_last == '?'))
                            {
                                if (!directives_mod.isSuppressed("regexp/no-useless-lazy", line_no, suppress)) {
                                    try issues.append(allocator, .{
                                        .file_path = file_path,
                                        .line = line_no,
                                        .column = @intCast(i + 1),
                                        .rule_id = "regexp/no-useless-lazy",
                                        .message = "Lazy quantifier is useless before end-of-string anchor",
                                        .severity = severity,
                                    });
                                }
                            }
                        }
                        // Check for lazy at very end of pattern: +? or *? or ??
                        if (pattern.len >= 2) {
                            const last = pattern[pattern.len - 1];
                            const second_last = pattern[pattern.len - 2];
                            if (last == '?' and (second_last == '+' or second_last == '*' or second_last == '?') and
                                (pattern.len < 3 or pattern[pattern.len - 3] != '$'))
                            {
                                if (!directives_mod.isSuppressed("regexp/no-useless-lazy", line_no, suppress)) {
                                    try issues.append(allocator, .{
                                        .file_path = file_path,
                                        .line = line_no,
                                        .column = @intCast(i + 1),
                                        .rule_id = "regexp/no-useless-lazy",
                                        .message = "Lazy quantifier is useless at the end of the pattern",
                                        .severity = severity,
                                    });
                                }
                            }
                        }
                        i = result.end;
                    }
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// pickier/sort-tailwind-classes
// ---------------------------------------------------------------------------
//
// Detects unsorted Tailwind CSS classes in:
//   class="..."  className="..."  :class="..."
//   clsx("...")  cn("...")  tw("...")  cva("...")  tv("...")
//
// Class ordering follows the canonical Tailwind group order:
//   Layout → Flexbox/Grid → Spacing → Sizing → Typography → Backgrounds →
//   Borders → Effects → Filters → Tables → Transitions → Transforms →
//   Interactivity → SVG → Accessibility → (unknown last)
// ---------------------------------------------------------------------------

/// Strip leading variant prefixes (hover:, md:, dark:focus:, etc.) but stop
/// before any '[' so that arbitrary properties like [mask-type:alpha] are preserved.
fn tailwindStripVariants(cls: []const u8) []const u8 {
    var i: usize = 0;
    while (i < cls.len) {
        if (cls[i] == '[') break; // arbitrary property — stop here
        const colon = std.mem.indexOfScalarPos(u8, cls, i, ':') orelse break;
        // If the character after the colon is '[', this is an arbitrary value — stop
        if (colon + 1 < cls.len and cls[colon + 1] == '[') break;
        i = colon + 1;
    }
    return cls[i..];
}

/// Returns the group index for a single Tailwind class (lower = earlier in output)
fn tailwindGroupIndex(cls: []const u8) u8 {
    // Strip variant prefixes safely (stops before arbitrary property brackets)
    var base = tailwindStripVariants(cls);
    // Strip leading ! important modifier
    if (base.len > 0 and base[0] == '!') base = base[1..];

    // Layout — display values (group 0)
    const layout_display_exact = [_][]const u8{
        "block",              "inline",             "inline-block",       "flex",            "inline-flex",   "grid",       "inline-grid",
        "flow-root",          "contents",           "hidden",             "table",           "table-caption", "table-cell", "table-column",
        "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row",     "list-item",  "subgrid",
    };
    for (layout_display_exact) |exact| {
        if (std.mem.eql(u8, base, exact)) return 0;
    }

    // Layout — positioning exact values (group 1)
    const layout_position_exact = [_][]const u8{
        "static",  "fixed",     "absolute", "relative", "sticky",
        "visible", "invisible", "collapse",
    };
    for (layout_position_exact) |exact| {
        if (std.mem.eql(u8, base, exact)) return 1;
    }

    // Layout — prefix-based (group 1)
    const layout_prefixes = [_][]const u8{
        "container", "columns-",  "break-",      "box-",   "float-",  "clear-", "isolation-",
        "object-",   "overflow-", "overscroll-", "inset-", "top-",    "right-", "bottom-",
        "left-",     "start-",    "end-",        "z-",     "aspect-", "order-",
    };
    for (layout_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 1;
    }

    // Flexbox & Grid
    const flex_grid_prefixes = [_][]const u8{
        "basis-",     "flex-",      "grow", "shrink",   "order-", "grid-",    "col-",  "row-",
        "auto-cols-", "auto-rows-", "gap-", "justify-", "items-", "content-", "self-", "place-",
    };
    for (flex_grid_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 2;
    }

    // Spacing
    const spacing_prefixes = [_][]const u8{
        "p-",     "px-",     "py-", "ps-",  "pe-",  "pt-",  "pr-",  "pb-",  "pl-",
        "m-",     "mx-",     "my-", "ms-",  "me-",  "mt-",  "mr-",  "mb-",  "ml-",
        "space-", "indent-", "-p-", "-px-", "-py-", "-ps-", "-pe-", "-pt-", "-pr-",
        "-pb-",   "-pl-",    "-m-", "-mx-", "-my-", "-ms-", "-me-", "-mt-", "-mr-",
        "-mb-",   "-ml-",
    };
    for (spacing_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 3;
    }

    // Sizing
    const sizing_prefixes = [_][]const u8{
        "w-", "h-", "min-w-", "max-w-", "min-h-", "max-h-", "size-",
    };
    for (sizing_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 4;
    }

    // Typography
    const typo_prefixes = [_][]const u8{
        "font-",              "text-",                "tracking-",   "leading-",      "list-",             "placeholder-",
        "vertical-",          "whitespace-",          "break-",      "hyphens-",      "line-clamp-",       "truncate",
        "uppercase",          "lowercase",            "capitalize",  "normal-case",   "italic",            "not-italic",
        "antialiased",        "subpixel-antialiased", "underline",   "overline",      "line-through",      "no-underline",
        "ordinal",            "slashed-zero",         "lining-nums", "oldstyle-nums", "proportional-nums", "tabular-nums",
        "diagonal-fractions", "stacked-fractions",    "normal-nums",
    };
    for (typo_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx) or std.mem.eql(u8, base, pfx)) return 5;
    }

    // Backgrounds
    const bg_prefixes = [_][]const u8{ "bg-", "from-", "via-", "to-", "gradient-" };
    for (bg_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 6;
    }

    // Borders
    const border_prefixes = [_][]const u8{
        "border", "rounded", "outline", "ring", "divide", "accent",
    };
    for (border_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 7;
    }

    // Effects
    const effects_prefixes = [_][]const u8{ "shadow", "opacity-", "mix-blend-", "bg-blend-" };
    for (effects_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 8;
    }

    // Filters
    const filter_prefixes = [_][]const u8{
        "blur",        "brightness-", "contrast-", "drop-shadow-", "grayscale",
        "hue-rotate-", "invert",      "saturate-", "sepia",        "backdrop-",
    };
    for (filter_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 9;
    }

    // Tables
    const table_prefixes = [_][]const u8{
        "border-collapse", "border-separate", "border-spacing-",
        "table-auto",      "table-fixed",     "caption-",
    };
    for (table_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 10;
    }

    // Transitions & Animation
    const transition_prefixes = [_][]const u8{
        "transition", "duration-", "ease-", "delay-", "animate-",
    };
    for (transition_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 11;
    }

    // Transforms
    const transform_prefixes = [_][]const u8{
        "scale-", "rotate-", "translate-", "skew-", "origin-", "transform", "perspective-",
    };
    for (transform_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 12;
    }

    // Interactivity
    const interact_prefixes = [_][]const u8{
        "appearance-", "cursor-", "caret-", "pointer-events-", "resize",
        "scroll-",     "snap-",   "touch-", "select-",         "will-change-",
    };
    for (interact_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 13;
    }

    // SVG
    const svg_prefixes = [_][]const u8{ "fill-", "stroke-" };
    for (svg_prefixes) |pfx| {
        if (std.mem.startsWith(u8, base, pfx)) return 14;
    }

    // Accessibility
    if (std.mem.eql(u8, base, "sr-only") or std.mem.eql(u8, base, "not-sr-only")) return 15;

    return 99; // unknown — sort last
}

/// Returns variant priority: base classes first, then responsive (sm/md/lg/xl/2xl), then state variants
fn tailwindVariantPriority(cls: []const u8) u8 {
    // Arbitrary properties like [mask-type:alpha] start with '[' — no variant
    if (cls.len > 0 and cls[0] == '[') return 0;
    const responsive = [_][]const u8{ "sm:", "md:", "lg:", "xl:", "2xl:" };
    for (responsive, 0..) |pfx, i| {
        if (std.mem.startsWith(u8, cls, pfx)) return @intCast(10 + i);
    }
    // Has a colon before any '[' bracket — it's a state variant (hover:, focus:, dark:, etc.)
    const colon_pos = std.mem.indexOfScalar(u8, cls, ':') orelse return 0;
    const bracket_pos = std.mem.indexOfScalar(u8, cls, '[') orelse cls.len;
    if (colon_pos < bracket_pos) return 20;
    return 0;
}

/// Compare two Tailwind classes for sorting
fn tailwindClassLessThan(_: void, a: []const u8, b: []const u8) bool {
    const ga = tailwindGroupIndex(a);
    const gb = tailwindGroupIndex(b);
    if (ga != gb) return ga < gb;
    const va = tailwindVariantPriority(a);
    const vb = tailwindVariantPriority(b);
    if (va != vb) return va < vb;
    return std.mem.lessThan(u8, a, b);
}

/// Extract a quoted string value starting at `pos` (after the opening quote char `q`).
/// Returns the slice of the string content (excluding quotes) and the end position (after closing quote).
fn extractQuotedStringAt(content: []const u8, pos: usize, q: u8) ?struct { value: []const u8, end: usize } {
    var i = pos;
    while (i < content.len) {
        if (content[i] == '\\') {
            i += 2;
            continue;
        }
        if (content[i] == q) {
            return .{ .value = content[pos..i], .end = i + 1 };
        }
        i += 1;
    }
    return null;
}

/// Split a Tailwind class string on whitespace, but NOT inside [...] brackets.
/// This handles arbitrary values like p-[calc(100% - 1rem)] correctly.
fn tailwindSplitClasses(classes_str: []const u8, allocator: Allocator) !std.ArrayList([]const u8) {
    var list = std.ArrayList([]const u8){};
    var depth: usize = 0;
    var start: usize = 0;
    var i: usize = 0;
    while (i < classes_str.len) {
        const ch = classes_str[i];
        if (ch == '[') {
            depth += 1;
        } else if (ch == ']') {
            if (depth > 0) depth -= 1;
        } else if ((ch == ' ' or ch == '\t' or ch == '\n' or ch == '\r') and depth == 0) {
            if (i > start) {
                try list.append(allocator, classes_str[start..i]);
            }
            start = i + 1;
        }
        i += 1;
    }
    if (start < classes_str.len) {
        const tail = classes_str[start..];
        if (tail.len > 0) try list.append(allocator, tail);
    }
    return list;
}

/// Check if a whitespace-separated class list is in sorted order
fn tailwindClassesAreSorted(classes_str: []const u8, allocator: Allocator) !bool {
    var list = try tailwindSplitClasses(classes_str, allocator);
    defer list.deinit(allocator);

    if (list.items.len < 2) return true;

    const sorted = try allocator.dupe([]const u8, list.items);
    defer allocator.free(sorted);
    std.mem.sort([]const u8, sorted, {}, tailwindClassLessThan);

    for (list.items, 0..) |cls, i| {
        if (!std.mem.eql(u8, cls, sorted[i])) return false;
    }
    return true;
}

/// Scan content for class attribute patterns and report unsorted class lists
fn checkSortTailwindClasses(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // Patterns to search for (attribute name followed by = and a quote)
    const attr_names = [_][]const u8{
        "class=", "className=", ":class=",
    };
    // Utility function names followed by (
    const util_fns = [_][]const u8{
        "clsx(", "cn(", "tw(", "cva(", "tv(",
    };

    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        // Check attribute patterns: class="...", className='...', etc.
        for (attr_names) |attr| {
            var search_pos: usize = 0;
            while (std.mem.indexOfPos(u8, line, search_pos, attr)) |attr_pos| {
                const after_eq = attr_pos + attr.len;
                if (after_eq >= line.len) break;

                const q = line[after_eq];
                if (q != '"' and q != '\'') {
                    search_pos = after_eq;
                    continue;
                }

                if (extractQuotedStringAt(line, after_eq + 1, q)) |result| {
                    const classes_str = result.value;
                    const is_sorted = tailwindClassesAreSorted(classes_str, allocator) catch true;
                    if (!is_sorted) {
                        if (!directives_mod.isSuppressed("pickier/sort-tailwind-classes", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = @intCast(attr_pos + 1),
                                .rule_id = "pickier/sort-tailwind-classes",
                                .message = "Tailwind classes are not in the recommended order",
                                .severity = severity,
                            });
                        }
                    }
                    search_pos = result.end;
                } else {
                    search_pos = after_eq + 1;
                }
            }
        }

        // Check utility function patterns: clsx("..."), cn('...'), etc.
        for (util_fns) |fn_pat| {
            var search_pos: usize = 0;
            while (std.mem.indexOfPos(u8, line, search_pos, fn_pat)) |fn_pos| {
                const after_paren = fn_pos + fn_pat.len;
                if (after_paren >= line.len) break;

                // Skip whitespace
                var arg_pos = after_paren;
                while (arg_pos < line.len and (line[arg_pos] == ' ' or line[arg_pos] == '\t')) {
                    arg_pos += 1;
                }
                if (arg_pos >= line.len) break;

                const q = line[arg_pos];
                if (q != '"' and q != '\'') {
                    search_pos = after_paren;
                    continue;
                }

                if (extractQuotedStringAt(line, arg_pos + 1, q)) |result| {
                    const classes_str = result.value;
                    const is_sorted = tailwindClassesAreSorted(classes_str, allocator) catch true;
                    if (!is_sorted) {
                        if (!directives_mod.isSuppressed("pickier/sort-tailwind-classes", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = @intCast(fn_pos + 1),
                                .rule_id = "pickier/sort-tailwind-classes",
                                .message = "Tailwind classes are not in the recommended order",
                                .severity = severity,
                            });
                        }
                    }
                    search_pos = result.end;
                } else {
                    search_pos = after_paren;
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "countStatements" {
    try std.testing.expect(countStatements("const x = 1") == 1);
    try std.testing.expect(countStatements("const x = 1; const y = 2") == 2);
    try std.testing.expect(countStatements("const x = 1; const y = 2;") == 2);
    try std.testing.expect(countStatements("for (let i = 0; i < n; i++) {}") == 1);
}

test "hasDuplicateSpecifiers" {
    try std.testing.expect(hasDuplicateSpecifiers("a, b, a"));
    try std.testing.expect(!hasDuplicateSpecifiers("a, b, c"));
    try std.testing.expect(hasDuplicateSpecifiers("Foo, Bar as B, Foo"));
    try std.testing.expect(!hasDuplicateSpecifiers("type A, B"));
}

test "extractImportSource" {
    try std.testing.expectEqualStrings("./foo", extractImportSource("import { x } from './foo'").?);
    try std.testing.expectEqualStrings("lodash", extractImportSource("import lodash from 'lodash'").?);
    try std.testing.expect(extractImportSource("const x = 1") == null);
}

test "isDistImport" {
    try std.testing.expect(isDistImport("dist"));
    try std.testing.expect(isDistImport("./dist/foo"));
    try std.testing.expect(isDistImport("../dist/bar"));
    try std.testing.expect(!isDistImport("lodash"));
    try std.testing.expect(!isDistImport("./src/dist-utils"));
}

test "hasStringConcatenation" {
    try std.testing.expect(hasStringConcatenation("'hello' + name"));
    try std.testing.expect(hasStringConcatenation("\"hello\" + name"));
    try std.testing.expect(!hasStringConcatenation("const x = 1 + 2"));
    try std.testing.expect(!hasStringConcatenation("// 'hello' + name"));
}

test "isReassigned" {
    try std.testing.expect(isReassigned("x", "x = 5"));
    try std.testing.expect(isReassigned("x", "x += 1"));
    try std.testing.expect(isReassigned("x", "x++"));
    try std.testing.expect(!isReassigned("x", "console.log(x)"));
    try std.testing.expect(!isReassigned("x", "const xx = 1"));
}

// ---------------------------------------------------------------------------
// Tailwind class ordering tests
// ---------------------------------------------------------------------------

test "tailwindGroupIndex — layout display values" {
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("flex"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("block"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("hidden"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("grid"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("inline-flex"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("inline-block"));
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("contents"));
}

test "tailwindGroupIndex — layout positioning" {
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("absolute"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("relative"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("fixed"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("sticky"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("z-10"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("overflow-hidden"));
    try std.testing.expectEqual(@as(u8, 1), tailwindGroupIndex("top-0"));
}

test "tailwindGroupIndex — flexbox and grid" {
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("flex-col"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("flex-row"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("gap-4"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("items-center"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("justify-between"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("grid-cols-3"));
    try std.testing.expectEqual(@as(u8, 2), tailwindGroupIndex("col-span-2"));
}

test "tailwindGroupIndex — spacing" {
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("p-4"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("px-2"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("py-6"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("m-4"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("mx-auto"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("mt-8"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("space-x-2"));
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("-mt-4"));
}

test "tailwindGroupIndex — sizing" {
    try std.testing.expectEqual(@as(u8, 4), tailwindGroupIndex("w-full"));
    try std.testing.expectEqual(@as(u8, 4), tailwindGroupIndex("h-screen"));
    try std.testing.expectEqual(@as(u8, 4), tailwindGroupIndex("max-w-lg"));
    try std.testing.expectEqual(@as(u8, 4), tailwindGroupIndex("min-h-0"));
    try std.testing.expectEqual(@as(u8, 4), tailwindGroupIndex("size-4"));
}

test "tailwindGroupIndex — typography" {
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("text-sm"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("font-bold"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("leading-tight"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("uppercase"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("truncate"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("italic"));
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("underline"));
}

test "tailwindGroupIndex — backgrounds" {
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("bg-white"));
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("bg-blue-500"));
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("from-blue-500"));
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("via-purple-500"));
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("to-pink-500"));
}

test "tailwindGroupIndex — borders" {
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("border"));
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("rounded"));
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("rounded-lg"));
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("ring-2"));
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("outline-none"));
}

test "tailwindGroupIndex — effects" {
    try std.testing.expectEqual(@as(u8, 8), tailwindGroupIndex("shadow-md"));
    try std.testing.expectEqual(@as(u8, 8), tailwindGroupIndex("opacity-50"));
}

test "tailwindGroupIndex — filters" {
    try std.testing.expectEqual(@as(u8, 9), tailwindGroupIndex("blur-sm"));
    try std.testing.expectEqual(@as(u8, 9), tailwindGroupIndex("brightness-75"));
    try std.testing.expectEqual(@as(u8, 9), tailwindGroupIndex("backdrop-blur"));
    try std.testing.expectEqual(@as(u8, 9), tailwindGroupIndex("grayscale"));
}

test "tailwindGroupIndex — transitions and animation" {
    try std.testing.expectEqual(@as(u8, 11), tailwindGroupIndex("transition"));
    try std.testing.expectEqual(@as(u8, 11), tailwindGroupIndex("duration-200"));
    try std.testing.expectEqual(@as(u8, 11), tailwindGroupIndex("ease-in-out"));
    try std.testing.expectEqual(@as(u8, 11), tailwindGroupIndex("animate-spin"));
    try std.testing.expectEqual(@as(u8, 11), tailwindGroupIndex("delay-100"));
}

test "tailwindGroupIndex — transforms" {
    try std.testing.expectEqual(@as(u8, 12), tailwindGroupIndex("scale-105"));
    try std.testing.expectEqual(@as(u8, 12), tailwindGroupIndex("rotate-45"));
    try std.testing.expectEqual(@as(u8, 12), tailwindGroupIndex("translate-x-2"));
    try std.testing.expectEqual(@as(u8, 12), tailwindGroupIndex("skew-x-3"));
}

test "tailwindGroupIndex — interactivity" {
    try std.testing.expectEqual(@as(u8, 13), tailwindGroupIndex("cursor-pointer"));
    try std.testing.expectEqual(@as(u8, 13), tailwindGroupIndex("select-none"));
    try std.testing.expectEqual(@as(u8, 13), tailwindGroupIndex("resize-none"));
    try std.testing.expectEqual(@as(u8, 13), tailwindGroupIndex("scroll-smooth"));
}

test "tailwindGroupIndex — SVG" {
    try std.testing.expectEqual(@as(u8, 14), tailwindGroupIndex("fill-current"));
    try std.testing.expectEqual(@as(u8, 14), tailwindGroupIndex("stroke-2"));
}

test "tailwindGroupIndex — accessibility" {
    try std.testing.expectEqual(@as(u8, 15), tailwindGroupIndex("sr-only"));
    try std.testing.expectEqual(@as(u8, 15), tailwindGroupIndex("not-sr-only"));
}

test "tailwindGroupIndex — unknown classes sort last" {
    // These don't match any known Tailwind prefix or exact value
    try std.testing.expectEqual(@as(u8, 99), tailwindGroupIndex("foo"));
    try std.testing.expectEqual(@as(u8, 99), tailwindGroupIndex("zzz-unknown"));
    try std.testing.expectEqual(@as(u8, 99), tailwindGroupIndex("custom-xyz"));
    try std.testing.expectEqual(@as(u8, 99), tailwindGroupIndex("xyz"));
}

test "tailwindGroupIndex — strips variant prefixes before matching" {
    // hover:flex should match as layout (group 0) after stripping hover:
    try std.testing.expectEqual(@as(u8, 0), tailwindGroupIndex("hover:flex"));
    // md:p-4 should match as spacing (group 3) after stripping md:
    try std.testing.expectEqual(@as(u8, 3), tailwindGroupIndex("md:p-4"));
    // dark:bg-white should match as background (group 6) after stripping dark:
    try std.testing.expectEqual(@as(u8, 6), tailwindGroupIndex("dark:bg-white"));
    // sm:text-sm should match as typography (group 5) after stripping sm:
    try std.testing.expectEqual(@as(u8, 5), tailwindGroupIndex("sm:text-sm"));
    // hover:focus:border should match as border (group 7) after stripping both prefixes
    try std.testing.expectEqual(@as(u8, 7), tailwindGroupIndex("hover:focus:border"));
}

test "tailwindVariantPriority — base classes have priority 0" {
    try std.testing.expectEqual(@as(u8, 0), tailwindVariantPriority("flex"));
    try std.testing.expectEqual(@as(u8, 0), tailwindVariantPriority("p-4"));
    try std.testing.expectEqual(@as(u8, 0), tailwindVariantPriority("bg-white"));
}

test "tailwindVariantPriority — responsive variants ordered sm<md<lg<xl<2xl" {
    const sm = tailwindVariantPriority("sm:p-4");
    const md = tailwindVariantPriority("md:p-4");
    const lg = tailwindVariantPriority("lg:p-4");
    const xl = tailwindVariantPriority("xl:p-4");
    const xxl = tailwindVariantPriority("2xl:p-4");
    try std.testing.expect(sm < md);
    try std.testing.expect(md < lg);
    try std.testing.expect(lg < xl);
    try std.testing.expect(xl < xxl);
}

test "tailwindVariantPriority — responsive before state variants" {
    const sm = tailwindVariantPriority("sm:p-4");
    const hover = tailwindVariantPriority("hover:p-4");
    try std.testing.expect(sm < hover);
}

test "tailwindVariantPriority — base before responsive" {
    const base = tailwindVariantPriority("p-4");
    const sm = tailwindVariantPriority("sm:p-4");
    try std.testing.expect(base < sm);
}

test "tailwindClassLessThan — layout before spacing" {
    try std.testing.expect(tailwindClassLessThan({}, "flex", "p-4"));
    try std.testing.expect(!tailwindClassLessThan({}, "p-4", "flex"));
}

test "tailwindClassLessThan — spacing before typography" {
    try std.testing.expect(tailwindClassLessThan({}, "p-4", "text-sm"));
    try std.testing.expect(!tailwindClassLessThan({}, "text-sm", "p-4"));
}

test "tailwindClassLessThan — typography before backgrounds" {
    try std.testing.expect(tailwindClassLessThan({}, "text-sm", "bg-white"));
    try std.testing.expect(!tailwindClassLessThan({}, "bg-white", "text-sm"));
}

test "tailwindClassLessThan — backgrounds before borders" {
    try std.testing.expect(tailwindClassLessThan({}, "bg-white", "border"));
    try std.testing.expect(!tailwindClassLessThan({}, "border", "bg-white"));
}

test "tailwindClassLessThan — borders before effects" {
    try std.testing.expect(tailwindClassLessThan({}, "border", "shadow-md"));
    try std.testing.expect(!tailwindClassLessThan({}, "shadow-md", "border"));
}

test "tailwindClassLessThan — effects before transitions" {
    try std.testing.expect(tailwindClassLessThan({}, "shadow-md", "transition"));
    try std.testing.expect(!tailwindClassLessThan({}, "transition", "shadow-md"));
}

test "tailwindClassLessThan — transitions before transforms" {
    try std.testing.expect(tailwindClassLessThan({}, "transition", "scale-105"));
    try std.testing.expect(!tailwindClassLessThan({}, "scale-105", "transition"));
}

test "tailwindClassLessThan — transforms before interactivity" {
    try std.testing.expect(tailwindClassLessThan({}, "scale-105", "cursor-pointer"));
    try std.testing.expect(!tailwindClassLessThan({}, "cursor-pointer", "scale-105"));
}

test "tailwindClassLessThan — base before responsive variant (same group)" {
    try std.testing.expect(tailwindClassLessThan({}, "p-4", "sm:p-4"));
    try std.testing.expect(!tailwindClassLessThan({}, "sm:p-4", "p-4"));
}

test "tailwindClassLessThan — sm before md before lg (same group)" {
    try std.testing.expect(tailwindClassLessThan({}, "sm:p-4", "md:p-4"));
    try std.testing.expect(tailwindClassLessThan({}, "md:p-4", "lg:p-4"));
    try std.testing.expect(!tailwindClassLessThan({}, "lg:p-4", "sm:p-4"));
}

test "tailwindClassLessThan — alphabetical within same group and variant" {
    try std.testing.expect(tailwindClassLessThan({}, "p-2", "p-4"));
    try std.testing.expect(!tailwindClassLessThan({}, "p-4", "p-2"));
}

test "tailwindClassesAreSorted — sorted list returns true" {
    const allocator = std.testing.allocator;
    try std.testing.expect(try tailwindClassesAreSorted("flex p-4", allocator));
    try std.testing.expect(try tailwindClassesAreSorted("flex gap-4 p-4 w-full text-sm bg-white border shadow-md transition scale-105 cursor-pointer sr-only", allocator));
    try std.testing.expect(try tailwindClassesAreSorted("p-4 sm:p-4 md:p-4 hover:p-4", allocator));
}

test "tailwindClassesAreSorted — unsorted list returns false" {
    const allocator = std.testing.allocator;
    try std.testing.expect(!try tailwindClassesAreSorted("p-4 flex", allocator));
    try std.testing.expect(!try tailwindClassesAreSorted("text-sm flex", allocator));
    try std.testing.expect(!try tailwindClassesAreSorted("bg-white flex", allocator));
    try std.testing.expect(!try tailwindClassesAreSorted("hover:p-4 p-4", allocator));
    try std.testing.expect(!try tailwindClassesAreSorted("md:p-4 sm:p-4", allocator));
}

test "tailwindClassesAreSorted — single class is always sorted" {
    const allocator = std.testing.allocator;
    try std.testing.expect(try tailwindClassesAreSorted("flex", allocator));
    try std.testing.expect(try tailwindClassesAreSorted("p-4", allocator));
}

test "tailwindClassesAreSorted — empty string is sorted" {
    const allocator = std.testing.allocator;
    try std.testing.expect(try tailwindClassesAreSorted("", allocator));
}

test "extractQuotedStringAt — extracts double-quoted value" {
    const result = extractQuotedStringAt("\"hello world\"", 1, '"');
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("hello world", result.?.value);
    try std.testing.expectEqual(@as(usize, 13), result.?.end);
}

test "extractQuotedStringAt — extracts single-quoted value" {
    const result = extractQuotedStringAt("'flex p-4'", 1, '\'');
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("flex p-4", result.?.value);
}

test "extractQuotedStringAt — returns null for unterminated string" {
    const result = extractQuotedStringAt("\"no closing quote", 1, '"');
    try std.testing.expect(result == null);
}

test "extractQuotedStringAt — handles empty string" {
    const result = extractQuotedStringAt("\"\"", 1, '"');
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("", result.?.value);
}

test "isTailwindFile — accepts supported extensions" {
    try std.testing.expect(isTailwindFile("app.ts"));
    try std.testing.expect(isTailwindFile("app.tsx"));
    try std.testing.expect(isTailwindFile("app.js"));
    try std.testing.expect(isTailwindFile("app.jsx"));
    try std.testing.expect(isTailwindFile("app.html"));
    try std.testing.expect(isTailwindFile("app.vue"));
    try std.testing.expect(isTailwindFile("app.svelte"));
    try std.testing.expect(isTailwindFile("app.stx"));
    try std.testing.expect(isTailwindFile("app.mts"));
    try std.testing.expect(isTailwindFile("app.mjs"));
    try std.testing.expect(isTailwindFile("src/components/Button.tsx"));
}

test "isTailwindFile — rejects unsupported extensions" {
    try std.testing.expect(!isTailwindFile("app.css"));
    try std.testing.expect(!isTailwindFile("app.json"));
    try std.testing.expect(!isTailwindFile("app.md"));
    try std.testing.expect(!isTailwindFile("app.zig"));
    try std.testing.expect(!isTailwindFile("app.lock"));
    try std.testing.expect(!isTailwindFile("noextension"));
}
