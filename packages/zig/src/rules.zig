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

        // Check 1: } else / } catch / } finally on same line with space
        if (std.mem.indexOf(u8, trimmed, "} else") != null or
            std.mem.indexOf(u8, trimmed, "} catch") != null or
            std.mem.indexOf(u8, trimmed, "} finally") != null)
        {
            // This is actually the CORRECT 1tbs style, no issue
        }

        // Check 2: Opening brace alone on its own line
        if (std.mem.eql(u8, trimmed, "{")) {
            if (prev_line.len > 0) {
                const prev_trimmed = std.mem.trim(u8, prev_line, " \t\r");
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

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trim(u8, line, " \t\r");

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

    // Check if line starts with for
    const trimmed = std.mem.trimStart(u8, line, " \t");
    if (std.mem.startsWith(u8, trimmed, "for ") or std.mem.startsWith(u8, trimmed, "for(")) {
        in_for = true;
    }

    for (line) |ch| {
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
                // Skip rest if line comment
                // (can't check next char easily in a for loop, handled elsewhere)
            },
            else => {},
        }
    }

    if (semicolons == 0) return 1;
    // If line ends with semicolon, count = semicolons, else semicolons + 1
    const last = line[line.len - 1];
    if (last == ';') return semicolons;
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
    // Look for patterns like: "string" + identifier or identifier + "string"
    const State = enum { code, single, double, template };
    var state: State = .code;
    var escaped = false;
    var had_string = false;
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
                } else if (ch == '+' and had_string) {
                    // Check if followed by an identifier or string
                    const after = std.mem.trimStart(u8, line[i + 1 ..], " \t");
                    if (after.len > 0 and (isIdentStart(after[0]) or after[0] == '\'' or after[0] == '"')) {
                        return true;
                    }
                }
            },
            .single => {
                if (ch == '\'') {
                    state = .code;
                    had_string = true;
                }
            },
            .double => {
                if (ch == '"') {
                    state = .code;
                    had_string = true;
                }
            },
            .template => {
                if (ch == '`') {
                    state = .code;
                    had_string = true;
                }
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

fn stripTypeAnnotation(name: []const u8) []const u8 {
    // Remove TypeScript type annotation: "name: Type" -> "name"
    for (name, 0..) |ch, i| {
        if (ch == ':') return std.mem.trim(u8, name[0..i], " \t");
    }
    return name;
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
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Check for const/let/var declarations
        const decl = getDeclaration(trimmed);
        if (decl) |d| {
            // Skip destructuring
            if (d.name.len > 0 and d.name[0] != '{' and d.name[0] != '[') {
                // Get variable name (before = or :)
                var name_end: usize = 0;
                while (name_end < d.name.len and isIdentChar(d.name[name_end])) name_end += 1;
                const var_name = d.name[0..name_end];

                if (var_name.len > 0 and !std.mem.startsWith(u8, var_name, "_")) {
                    // Search rest of file for usage
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

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

const Declaration = struct { name: []const u8 };

fn getDeclaration(trimmed: []const u8) ?Declaration {
    if (std.mem.startsWith(u8, trimmed, "const ") and !std.mem.startsWith(u8, trimmed, "const {") and !std.mem.startsWith(u8, trimmed, "const [")) {
        return .{ .name = trimmed[6..] };
    }
    if (std.mem.startsWith(u8, trimmed, "let ") and !std.mem.startsWith(u8, trimmed, "let {") and !std.mem.startsWith(u8, trimmed, "let [")) {
        return .{ .name = trimmed[4..] };
    }
    if (std.mem.startsWith(u8, trimmed, "var ") and !std.mem.startsWith(u8, trimmed, "var {") and !std.mem.startsWith(u8, trimmed, "var [")) {
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

    // .test() — captures not used
    if (std.mem.startsWith(u8, after_trimmed, ".test(")) {
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
    return before == '=' or before == '(' or before == '[' or before == '{' or
        before == ',' or before == ';' or before == '!' or before == '&' or
        before == '|' or before == '?' or before == ':';
}

fn hasSuperLinearPattern(pattern: []const u8) bool {
    // Check for nested quantifiers like (.+)+, (.*)*
    var i: usize = 0;
    var paren_depth: u32 = 0;
    var has_quantifier_in_group = false;
    while (i < pattern.len) : (i += 1) {
        if (pattern[i] == '\\') {
            i += 1;
            continue;
        }
        if (pattern[i] == '(') {
            paren_depth += 1;
            has_quantifier_in_group = false;
        } else if (pattern[i] == ')') {
            if (paren_depth > 0) paren_depth -= 1;
            if (has_quantifier_in_group and i + 1 < pattern.len and
                (pattern[i + 1] == '+' or pattern[i + 1] == '*'))
            {
                return true;
            }
        } else if ((pattern[i] == '+' or pattern[i] == '*') and paren_depth > 0) {
            has_quantifier_in_group = true;
        }
    }

    // Check for multiple adjacent wildcards: .*.*
    if (std.mem.indexOf(u8, pattern, ".*.*") != null) return true;
    if (std.mem.indexOf(u8, pattern, ".+.+") != null) return true;

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
                        // Check for lazy quantifier before $ at end
                        if (pattern.len >= 3) {
                            const last = pattern[pattern.len - 1];
                            const second_last = pattern[pattern.len - 2];
                            const third_last = pattern[pattern.len - 3];
                            // +?$ or *?$ or ??$
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
                        // Check for lazy at very end of pattern
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
