const std = @import("std");
const Allocator = std.mem.Allocator;
const cfg_mod = @import("config.zig");
const format = @import("format.zig");
const directives = @import("directives.zig");

// ---------------------------------------------------------------------------
// Content scanner — built-in lint rules matching TS scanContentOptimized
// ---------------------------------------------------------------------------

pub const LintIssue = struct {
    file_path: []const u8,
    line: u32,
    column: u32,
    rule_id: []const u8,
    message: []const u8,
    severity: Severity,
    help: ?[]const u8 = null,

    pub const Severity = enum {
        @"error",
        warning,

        pub fn toString(self: Severity) []const u8 {
            return switch (self) {
                .@"error" => "error",
                .warning => "warning",
            };
        }
    };
};

/// Scan file content for lint issues using built-in rules
/// Matches TS `scanContentOptimized` from linter.ts
pub fn scanContent(
    file_path: []const u8,
    content: []const u8,
    cfg: *const cfg_mod.PickierConfig,
    suppress: *const directives.DisableDirectives,
    comment_lines: *const std.AutoHashMap(u32, void),
    allocator: Allocator,
) ![]LintIssue {
    var issues = std.ArrayList(LintIssue){};

    const is_code = format.isCodeFile(file_path);
    const is_md = std.mem.endsWith(u8, file_path, ".md");

    // Determine what to skip
    const skip_quotes = isQuoteSkipExtension(file_path);

    // Get severity for each rule
    const want_debugger = mapSeverity(cfg.rules.no_debugger);
    const want_console = mapSeverity(cfg.rules.no_console);
    const want_template_curly = mapSeverity(cfg.rules.no_template_curly_in_string);
    const want_cond_assign = mapSeverity(cfg.rules.no_cond_assign);

    // Pre-compute fenced code block lines (for markdown)
    var fenced_lines: ?std.AutoHashMap(u32, void) = null;
    if (is_md) {
        fenced_lines = try computeFencedCodeBlockLines(content, allocator);
    }
    defer if (fenced_lines) |*fl| fl.deinit();

    // Pre-compute template literal lines
    var template_lines = try computeTemplateLiteralLines(content, allocator);
    defer template_lines.deinit();

    // Scan line by line
    var quotes_reported = false;
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        // Skip comment-only lines
        if (comment_lines.get(line_no) != null) {
            pos = if (line_end < content.len) line_end + 1 else content.len;
            line_no += 1;
            continue;
        }

        const in_template = template_lines.get(line_no) != null;

        // Rule: indent (runs for ALL file types, matching TS behavior)
        {
            const leading = getLeadingWhitespace(line);
            if (leading.len > 0) {
                const in_fenced = if (fenced_lines) |fl| fl.get(line_no) != null else false;
                if (!in_fenced) {
                    if (hasIndentIssue(leading, cfg.format.indent, cfg.format.indent_style, line)) {
                        if (!directives.isSuppressed("indent", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = 1,
                                .rule_id = "indent",
                                .message = if (cfg.format.indent_style == .tabs)
                                    "Expected tab indentation"
                                else
                                    "Expected consistent indentation",
                                .severity = .warning,
                            });
                        }
                    }
                }
            }
        }

        if (is_code) {
            // Rule: quotes
            if (!skip_quotes and !in_template and !quotes_reported) {
                if (detectQuoteIssue(line, cfg.format.quotes)) |col| {
                    if (!directives.isSuppressed("quotes", line_no, suppress)) {
                        try issues.append(allocator, .{
                            .file_path = file_path,
                            .line = line_no,
                            .column = col + 1,
                            .rule_id = "quotes",
                            .message = if (cfg.format.quotes == .single)
                                "Strings must use singlequote"
                            else
                                "Strings must use doublequote",
                            .severity = .warning,
                        });
                        quotes_reported = true;
                    }
                }
            }

            // Rule: no-debugger
            if (want_debugger) |severity| {
                if (isDebuggerStatement(line)) {
                    if (!directives.isSuppressed("no-debugger", line_no, suppress)) {
                        try issues.append(allocator, .{
                            .file_path = file_path,
                            .line = line_no,
                            .column = 1,
                            .rule_id = "no-debugger",
                            .message = "Unexpected 'debugger' statement",
                            .severity = severity,
                            .help = "Remove the debugger statement",
                        });
                    }
                }
            }

            // Rule: no-console
            if (want_console) |severity| {
                if (!in_template) {
                    if (findConsoleCall(line)) |col| {
                        if (!directives.isSuppressed("no-console", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = col + 1,
                                .rule_id = "no-console",
                                .message = "Unexpected 'console' usage",
                                .severity = severity,
                            });
                        }
                    }
                }
            }

            // Rule: no-template-curly-in-string
            if (want_template_curly) |severity| {
                if (!in_template) {
                    if (findTemplateCurlyInString(line)) |col| {
                        if (!directives.isSuppressed("no-template-curly-in-string", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = col + 1,
                                .rule_id = "no-template-curly-in-string",
                                .message = "Unexpected template literal expression in string",
                                .severity = severity,
                                .help = "Use template literal instead of string concatenation",
                            });
                        }
                    }
                }
            }

            // Rule: no-cond-assign
            if (want_cond_assign) |severity| {
                if (!in_template) {
                    if (findCondAssign(line)) |col| {
                        if (!directives.isSuppressed("no-cond-assign", line_no, suppress)) {
                            try issues.append(allocator, .{
                                .file_path = file_path,
                                .line = line_no,
                                .column = col + 1,
                                .rule_id = "no-cond-assign",
                                .message = "Assignment in conditional expression",
                                .severity = severity,
                                .help = "Use comparison operator (== or ===) instead",
                            });
                        }
                    }
                }
            }
        }

        // (Markdown indent check removed — now handled by the unified indent check above)

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }

    return try issues.toOwnedSlice(allocator);
}

// ---------------------------------------------------------------------------
// Rule detection helpers
// ---------------------------------------------------------------------------

fn mapSeverity(sev: cfg_mod.RuleSeverity) ?LintIssue.Severity {
    return switch (sev) {
        .off => null,
        .warn => .warning,
        .@"error" => .@"error",
    };
}

fn isQuoteSkipExtension(path: []const u8) bool {
    const skip_exts = [_][]const u8{ ".json", ".jsonc", ".lock", ".md", ".yaml", ".yml" };
    for (skip_exts) |ext| {
        if (std.mem.endsWith(u8, path, ext)) return true;
    }
    if (std.mem.endsWith(u8, path, "bun.lock")) return true;
    return false;
}

fn isDebuggerStatement(line: []const u8) bool {
    const trimmed = std.mem.trimStart(u8, line, " \t");
    return std.mem.startsWith(u8, trimmed, "debugger");
}

/// Find console.log( in line, checking it's not in a comment or string.
/// Only matches console.log(...) to match TS scanner behavior.
/// Returns the 0-based column of "console." or null.
fn findConsoleCall(line: []const u8) ?u32 {
    // Match TS regex: /\bconsole\.log\s*\(/
    // Find "console.log" followed by optional whitespace and "("
    var search_start: usize = 0;
    while (search_start < line.len) {
        const idx = std.mem.indexOfPos(u8, line, search_start, "console.log") orelse return null;

        // Check word boundary before "console"
        if (idx > 0) {
            const prev_ch = line[idx - 1];
            if (std.ascii.isAlphanumeric(prev_ch) or prev_ch == '_' or prev_ch == '.') {
                search_start = idx + 11;
                continue;
            }
        }

        // Check that "log" is followed by optional whitespace then "("
        var j = idx + 11; // after "console.log"
        while (j < line.len and (line[j] == ' ' or line[j] == '\t')) : (j += 1) {}
        if (j >= line.len or line[j] != '(') {
            search_start = idx + 11;
            continue;
        }

        // Now verify it's not inside a string or comment using state machine
        const State = enum { code, single, double, template };
        var state: State = .code;
        var prev: u8 = 0;

        for (line[0..idx]) |ch| {
            switch (state) {
                .code => {
                    if (ch == '/' and prev == '/') return null; // rest is comment
                    if (ch == '\'') {
                        state = .single;
                    } else if (ch == '"') {
                        state = .double;
                    } else if (ch == '`') {
                        state = .template;
                    }
                },
                .single => {
                    if (ch == '\'' and prev != '\\') state = .code;
                },
                .double => {
                    if (ch == '"' and prev != '\\') state = .code;
                },
                .template => {
                    if (ch == '`' and prev != '\\') state = .code;
                },
            }
            prev = ch;
        }

        // If we're in code context at the match position, it's a real console.log call
        if (state == .code) return @intCast(idx);

        search_start = idx + 11;
    }
    return null;
}

/// Find ${...} inside single or double quoted strings (not template literals)
fn findTemplateCurlyInString(line: []const u8) ?u32 {
    const State = enum { code, single, double, template };
    var state: State = .code;
    var prev: u8 = 0;

    for (line, 0..) |ch, i| {
        switch (state) {
            .code => {
                if (ch == '\'') state = .single else if (ch == '"') state = .double else if (ch == '`') state = .template;
            },
            .single, .double => {
                if ((state == .single and ch == '\'') or (state == .double and ch == '"')) {
                    if (prev != '\\') state = .code;
                } else if (ch == '$' and i + 1 < line.len and line[i + 1] == '{' and prev != '\\') {
                    return @intCast(i);
                }
            },
            .template => {
                if (ch == '`' and prev != '\\') state = .code;
            },
        }
        prev = ch;
    }
    return null;
}

/// Detect assignment (=) inside if/while/for conditions
fn findCondAssign(line: []const u8) ?u32 {
    const trimmed = std.mem.trimStart(u8, line, " \t");

    // Check for if/while (
    if (findConditionParen(trimmed, "if") orelse findConditionParen(trimmed, "while")) |paren_start| {
        if (findMatchingParen(trimmed, paren_start)) |paren_end| {
            const condition = trimmed[paren_start + 1 .. paren_end];
            if (hasAssignmentInCondition(condition)) {
                // Calculate column relative to the original line
                const offset = @as(u32, @intCast(line.len - trimmed.len));
                return offset + @as(u32, @intCast(paren_start));
            }
        }
    }

    // Check for-loop condition (second part of for(init; cond; update))
    if (findConditionParen(trimmed, "for")) |paren_start| {
        if (findMatchingParen(trimmed, paren_start)) |paren_end| {
            const for_content = trimmed[paren_start + 1 .. paren_end];
            // Find the second part (after first semicolon, before second)
            if (std.mem.indexOfScalar(u8, for_content, ';')) |first_semi| {
                const after_first = for_content[first_semi + 1 ..];
                const second_part = if (std.mem.indexOfScalar(u8, after_first, ';')) |second_semi|
                    after_first[0..second_semi]
                else
                    after_first;

                if (hasAssignmentInCondition(second_part)) {
                    const offset = @as(u32, @intCast(line.len - trimmed.len));
                    return offset + @as(u32, @intCast(paren_start));
                }
            }
        }
    }

    return null;
}

/// Find the start of a condition parenthesis after a keyword
fn findConditionParen(line: []const u8, keyword: []const u8) ?usize {
    var search_pos: usize = 0;
    while (search_pos < line.len) {
        const idx = std.mem.indexOfPos(u8, line, search_pos, keyword) orelse return null;
        const after = idx + keyword.len;

        // Make sure it's a word boundary
        if (idx > 0 and isIdentChar(line[idx - 1])) {
            search_pos = after;
            continue;
        }
        if (after < line.len and isIdentChar(line[after])) {
            search_pos = after;
            continue;
        }

        // Skip whitespace to find (
        var i = after;
        while (i < line.len and (line[i] == ' ' or line[i] == '\t')) i += 1;
        if (i < line.len and line[i] == '(') return i;

        search_pos = after;
    }
    return null;
}

fn findMatchingParen(line: []const u8, start: usize) ?usize {
    if (start >= line.len or line[start] != '(') return null;
    var depth: u32 = 0;
    for (line[start..], start..) |ch, i| {
        if (ch == '(') depth += 1 else if (ch == ')') {
            depth -= 1;
            if (depth == 0) return i;
        }
    }
    return null;
}

fn isIdentChar(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9') or ch == '_' or ch == '$';
}

/// Check if a condition expression contains an assignment operator
/// Matches TS: /\b(\w+)\s*=\s*(?!=)/ with string/regex awareness
fn hasAssignmentInCondition(condition: []const u8) bool {
    var in_single = false;
    var in_double = false;
    var in_regex = false;
    var in_template = false;
    var escaped = false;

    for (condition, 0..) |ch, i| {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\' and (in_single or in_double or in_regex or in_template)) {
            escaped = true;
            continue;
        }

        // Track string/regex state
        if (in_single) {
            if (ch == '\'') in_single = false;
            continue;
        }
        if (in_double) {
            if (ch == '"') in_double = false;
            continue;
        }
        if (in_template) {
            if (ch == '`') in_template = false;
            continue;
        }
        if (in_regex) {
            if (ch == '/') in_regex = false;
            continue;
        }

        if (ch == '\'') {
            in_single = true;
            continue;
        }
        if (ch == '"') {
            in_double = true;
            continue;
        }
        if (ch == '`') {
            in_template = true;
            continue;
        }
        // Detect regex start: / not preceded by identifier or )
        if (ch == '/' and i + 1 < condition.len and condition[i + 1] != '/' and condition[i + 1] != '*') {
            if (i == 0 or (!isIdentChar(condition[i - 1]) and condition[i - 1] != ')')) {
                in_regex = true;
                continue;
            }
        }

        if (ch == '=') {
            // Check preceding char — skip ==, ===, !=, !==, <=, >=, =>
            if (i > 0) {
                const prev = condition[i - 1];
                if (prev == '=' or prev == '!' or prev == '<' or prev == '>') continue;
            }
            // Check following char
            if (i + 1 < condition.len) {
                const next = condition[i + 1];
                if (next == '=' or next == '>') continue;
            }
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Quote detection
// ---------------------------------------------------------------------------

/// Returns the column of the first wrong-style quote on the line, or null.
fn detectQuoteIssue(line: []const u8, preferred: format.Config.QuoteStyle) ?u32 {
    // Skip TypeScript triple-slash directives
    if (std.mem.startsWith(u8, std.mem.trimStart(u8, line, " \t"), "/// <reference")) {
        return null;
    }

    const State = enum { code, single, double, template, regex };
    var state: State = .code;
    var escaped = false;

    for (line, 0..) |ch, i| {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch == '\\') {
            if (state != .code) {
                escaped = true;
                continue;
            }
        }
        switch (state) {
            .code => {
                if (ch == '\'') {
                    if (preferred == .double) return @intCast(i);
                    state = .single;
                } else if (ch == '"') {
                    if (preferred == .single) return @intCast(i);
                    state = .double;
                } else if (ch == '`') {
                    state = .template;
                } else if (ch == '/' and i + 1 < line.len and line[i + 1] == '/') {
                    break; // rest is comment
                } else if (ch == '/') {
                    // Check if this is a regex literal by looking at preceding context
                    // Regex can appear after: = ( [ { , : ; ! & | ? or at line start
                    if (i == 0) {
                        state = .regex;
                    } else {
                        // Walk back skipping whitespace to find the preceding token
                        var k = i;
                        while (k > 0 and (line[k - 1] == ' ' or line[k - 1] == '\t')) k -= 1;
                        if (k == 0) {
                            state = .regex;
                        } else {
                            const prev = line[k - 1];
                            if (prev == '=' or prev == '(' or prev == '[' or prev == '{' or
                                prev == ',' or prev == ':' or prev == ';' or prev == '!' or
                                prev == '&' or prev == '|' or prev == '?')
                            {
                                state = .regex;
                            }
                            // Check for keywords like 'return' before the regex
                            else if (prev == 'n' and k >= 6 and std.mem.eql(u8, line[k - 6 .. k], "return")) {
                                state = .regex;
                            }
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
            .regex => {
                if (ch == '/') state = .code;
            },
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Indentation check
// ---------------------------------------------------------------------------

fn getLeadingWhitespace(line: []const u8) []const u8 {
    var i: usize = 0;
    while (i < line.len and (line[i] == ' ' or line[i] == '\t')) i += 1;
    return line[0..i];
}

fn hasIndentIssue(leading: []const u8, indent_size: u8, indent_style: format.Config.IndentStyle, line: []const u8) bool {
    if (indent_style == .tabs) {
        // In tab mode, check for non-tab characters
        for (leading) |ch| {
            if (ch != '\t') return true;
        }
        return false;
    }

    // Space mode — check for tabs
    for (leading) |ch| {
        if (ch == '\t') return true;
    }

    const spaces = leading.len;
    // Block comment exception: spaces % indent_size == 1 for * alignment
    if (spaces % indent_size == 1) {
        const trimmed = std.mem.trimStart(u8, line, " \t");
        if (std.mem.startsWith(u8, trimmed, "* ") or
            std.mem.startsWith(u8, trimmed, "*/") or
            std.mem.eql(u8, trimmed, "*"))
        {
            return false;
        }
    }

    return spaces % indent_size != 0;
}

// ---------------------------------------------------------------------------
// Pre-computation passes
// ---------------------------------------------------------------------------

/// Compute lines inside markdown fenced code blocks
fn computeFencedCodeBlockLines(content: []const u8, allocator: Allocator) !std.AutoHashMap(u32, void) {
    var result = std.AutoHashMap(u32, void).init(allocator);
    var in_fence = false;
    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = std.mem.trimStart(u8, content[pos..line_end], " \t");

        // Check for ``` or ~~~ (3+)
        if (line.len >= 3) {
            if ((line[0] == '`' and line[1] == '`' and line[2] == '`') or
                (line[0] == '~' and line[1] == '~' and line[2] == '~'))
            {
                in_fence = !in_fence;
                // Don't add fence lines themselves to the set (match TS continue behavior)
                pos = if (line_end < content.len) line_end + 1 else content.len;
                line_no += 1;
                continue;
            }
        }

        if (in_fence) {
            try result.put(line_no, {});
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }

    return result;
}

/// Compute lines that are part of template literals
fn computeTemplateLiteralLines(content: []const u8, allocator: Allocator) !std.AutoHashMap(u32, void) {
    var result = std.AutoHashMap(u32, void).init(allocator);
    var in_template = false;
    var escaped = false;
    var current_line: u32 = 1;

    for (content) |ch| {
        if (escaped) {
            escaped = false;
            if (ch == '\n') current_line += 1;
            continue;
        }
        if (ch == '\\') {
            escaped = true;
            continue;
        }
        if (ch == '\n') {
            current_line += 1;
            continue;
        }
        if (ch == '`') {
            in_template = !in_template;
        }
        if (in_template) {
            try result.put(current_line, {});
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "isDebuggerStatement" {
    try std.testing.expect(isDebuggerStatement("  debugger"));
    try std.testing.expect(isDebuggerStatement("debugger"));
    try std.testing.expect(isDebuggerStatement("\tdebugger;"));
    try std.testing.expect(!isDebuggerStatement("  // debugger"));
    try std.testing.expect(!isDebuggerStatement("  const debuggerMode = true"));
}

test "findConsoleCall" {
    try std.testing.expect(findConsoleCall("console.log('hi')") != null);
    try std.testing.expect(findConsoleCall("  console.log('hi')") != null);
    try std.testing.expect(findConsoleCall("// console.log('hi')") == null);
    try std.testing.expect(findConsoleCall("'console.log()'") == null);
}

test "findTemplateCurlyInString" {
    try std.testing.expect(findTemplateCurlyInString("'hello ${name}'") != null);
    try std.testing.expect(findTemplateCurlyInString("\"hello ${name}\"") != null);
    try std.testing.expect(findTemplateCurlyInString("`hello ${name}`") == null); // template literal is fine
    try std.testing.expect(findTemplateCurlyInString("const x = 'no template'") == null);
}

test "hasAssignmentInCondition" {
    try std.testing.expect(hasAssignmentInCondition("x = 5"));
    try std.testing.expect(!hasAssignmentInCondition("x == 5"));
    try std.testing.expect(!hasAssignmentInCondition("x === 5"));
    try std.testing.expect(!hasAssignmentInCondition("x != 5"));
    try std.testing.expect(!hasAssignmentInCondition("x >= 5"));
    try std.testing.expect(!hasAssignmentInCondition("x <= 5"));
    try std.testing.expect(!hasAssignmentInCondition("() => 5"));
}

test "hasIndentIssue" {
    // 2-space indent
    try std.testing.expect(!hasIndentIssue("  ", 2, .spaces, "  foo"));
    try std.testing.expect(!hasIndentIssue("    ", 2, .spaces, "    foo"));
    try std.testing.expect(hasIndentIssue("   ", 2, .spaces, "   foo")); // 3 spaces
    try std.testing.expect(hasIndentIssue("\t", 2, .spaces, "\tfoo")); // tab in space mode

    // Block comment exception
    try std.testing.expect(!hasIndentIssue("   ", 2, .spaces, "   * comment")); // 3 spaces + * alignment
}

test "computeTemplateLiteralLines" {
    const allocator = std.testing.allocator;
    const content = "const x = `\nhello\nworld\n`\nconst y = 1\n";
    var tl = try computeTemplateLiteralLines(content, allocator);
    defer tl.deinit();

    try std.testing.expect(tl.get(1) != null); // backtick opens on line 1
    try std.testing.expect(tl.get(2) != null); // hello
    try std.testing.expect(tl.get(3) != null); // world
    try std.testing.expect(tl.get(5) == null); // const y = 1
}

test "computeFencedCodeBlockLines" {
    const allocator = std.testing.allocator;
    const content = "some text\n```js\nconst x = 1\n```\nnormal text\n";
    var fl = try computeFencedCodeBlockLines(content, allocator);
    defer fl.deinit();

    try std.testing.expect(fl.get(1) == null); // before fence
    try std.testing.expect(fl.get(3) != null); // inside fence
    try std.testing.expect(fl.get(5) == null); // after fence
}

test "findCondAssign" {
    try std.testing.expect(findCondAssign("if (x = 5) {}") != null);
    try std.testing.expect(findCondAssign("if (x == 5) {}") == null);
    try std.testing.expect(findCondAssign("while (x = getNext()) {}") != null);
    try std.testing.expect(findCondAssign("const x = 5") == null); // no condition
}
