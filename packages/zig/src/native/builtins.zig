//! The built-in checks, ported from `scanContentOptimized` in
//! packages/pickier/src/linter.ts: quotes (`detectQuoteIssues`), indent
//! (`indentRuleSeverity`, `hasIndentIssue`), no-debugger, no-console,
//! no-template-curly-in-string and no-cond-assign, with the scan's own
//! template-literal, comment-line and suppression gates.
//!
//! Columns count UTF-16 code units, as the TypeScript ones do. A cheap test
//! skips a line only where the TypeScript check provably finds nothing on it
//! (no offending quote character, no `console.log`, no `${`, no keyword).

const std = @import("std");
const types = @import("types.zig");
const text = @import("text.zig");
const directives = @import("directives.zig");
const lex = @import("builtin_lex.zig");
const quotes = @import("builtin_quotes.zig");
const cond = @import("builtin_cond_assign.zig");

const Allocator = std.mem.Allocator;
const Severity = types.Severity;

/// `filePath.split('.').pop().toLowerCase()` into `buf`; an extension too
/// long for `buf` is none of the ones the checks look for.
fn fileExt(path: []const u8, buf: []u8) []const u8 {
    const dot = std.mem.lastIndexOfScalar(u8, path, '.');
    const ext = if (dot) |d| path[d + 1 ..] else path;
    if (ext.len > buf.len) return "";
    return std.ascii.lowerString(buf[0..ext.len], ext);
}

fn isOneOf(s: []const u8, comptime list: []const []const u8) bool {
    inline for (list) |item| {
        if (std.mem.eql(u8, s, item)) return true;
    }
    return false;
}

/// `/^\s*debugger\b/`
fn isDebuggerStatement(line: []const u8) bool {
    const rest = text.trimStart(line);
    if (!std.mem.startsWith(u8, rest, "debugger")) return false;
    return rest.len == 8 or !text.isWordByte(rest[8]);
}

/// `/\bconsole\.log\s*\(/`
fn hasConsoleLogCall(line: []const u8) bool {
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, line, from, "console.log")) |at| {
        from = at + 1;
        if (at > 0 and text.isWordByte(line[at - 1])) continue;
        var j = at + "console.log".len;
        while (j < line.len) {
            const n = text.whitespaceLenAt(line, j);
            if (n == 0) break;
            j += n;
        }
        if (j < line.len and line[j] == '(') return true;
    }
    return false;
}

/// The no-console column: the first `console.` outside a string literal, as
/// the scan's string walk finds it, or null.
fn consoleColumn(line: []const u8) ?usize {
    // Skip if console appears in a comment
    const comment_idx = std.mem.indexOf(u8, line, "//");
    const console_idx = std.mem.indexOf(u8, line, "console.");
    if (comment_idx) |ci| {
        if (console_idx) |k| {
            if (k > ci) return null;
        }
    }
    var in_string: u8 = 0;
    // Backslashes directly before `k`
    var backslashes: usize = 0;
    for (line, 0..) |ch, k| {
        if (in_string == 0) {
            if (ch == '"' or ch == '\'' or ch == '`') {
                in_string = ch;
            } else if (std.mem.startsWith(u8, line[k..], "console.")) {
                return k;
            }
        } else if (ch == in_string) {
            // Only an odd number of preceding backslashes escapes the quote
            if (backslashes % 2 == 0) in_string = 0;
        }
        backslashes = if (ch == '\\') backslashes + 1 else 0;
    }
    return null;
}

/// The no-template-curly-in-string column: the first `${` inside a `'` or
/// `"` string, as the scan's walk finds it, or null.
fn templateCurlyColumn(line: []const u8) ?usize {
    var in_str: u8 = 0;
    var in_regex = false;
    var in_regex_class = false;
    var last_sig: lex.Sig = lex.sig_none;
    // The previous character; only ever compared with a backslash
    var prev: u8 = 0;
    var k: usize = 0;
    while (k < line.len) : (k += 1) {
        const ch = line[k];
        if (in_regex) {
            if (prev == '\\') {
                prev = ch;
                continue;
            }
            if (in_regex_class) {
                if (ch == ']') in_regex_class = false;
            } else if (ch == '[') {
                in_regex_class = true;
            } else if (ch == '/') {
                in_regex = false;
                // consume flags
                while (k + 1 < line.len and std.ascii.isAlphabetic(line[k + 1])) k += 1;
                last_sig = '/';
            }
            prev = ch;
            continue;
        }
        if (in_str == 0) {
            if (ch == '"' or ch == '\'' or ch == '`') {
                in_str = ch;
                prev = ch;
                continue;
            }
            if (ch == '/') {
                const next: u8 = if (k + 1 < line.len) line[k + 1] else 0;
                if (next != '/' and next != '*' and lex.isRegexStart(last_sig, line, k)) {
                    in_regex = true;
                    in_regex_class = false;
                    prev = ch;
                    continue;
                }
            }
            if (ch != ' ' and ch != '\t') last_sig = lex.sigOf(ch);
        } else {
            if (ch == in_str) {
                if (prev != '\\') in_str = 0;
            } else if (ch == '$' and k + 1 < line.len and line[k + 1] == '{' and prev != '\\' and in_str != '`') {
                return k;
            }
        }
        prev = ch;
    }
    return null;
}

/// `hasIndentIssue(leading, indentSize, indentStyle, line)`; `leading` is
/// the line's run of spaces and tabs.
fn hasIndentIssue(leading: []const u8, indent: u8, style: types.IndentStyle, line: []const u8) bool {
    if (style == .tabs) return std.mem.indexOfNone(u8, leading, "\t") != null;
    if (std.mem.indexOfScalar(u8, leading, '\t') != null) return true;
    // `spaces % 0` is NaN in TypeScript: never 1, never 0
    if (indent == 0) return true;
    const rem = leading.len % indent;
    // Block comment continuation lines ( * ...) and closing ( */)
    if (rem == 1) {
        const trimmed = text.trimStart(line);
        if (std.mem.startsWith(u8, trimmed, "* ") or std.mem.startsWith(u8, trimmed, "*/") or std.mem.eql(u8, trimmed, "*")) return false;
    }
    return rem != 0;
}

/// `/^(?:`{3,}|~{3,})/` on the trimmed line
fn isFence(line: []const u8) bool {
    const t = text.trim(line);
    return std.mem.startsWith(u8, t, "```") or std.mem.startsWith(u8, t, "~~~");
}

/// A sorted line set read in ascending line order.
const LineCursor = struct {
    lines: []const u32,
    at: usize = 0,

    fn has(self: *LineCursor, line: u32) bool {
        while (self.at < self.lines.len and self.lines[self.at] < line) self.at += 1;
        return self.at < self.lines.len and self.lines[self.at] == line;
    }
};

const quotes_help_single = "Use single quotes consistently throughout your code. You can change the preferred quote style in your config with format.quotes: 'double'";
const quotes_help_double = "Use double quotes consistently throughout your code. You can change the preferred quote style in your config with format.quotes: 'single'";
const indent_help_tabs = "Use tabs for indentation. Configure with format.indent and format.indentStyle in your config";
const debugger_help = "Remove debugger statements before committing code. Use breakpoints in your IDE instead, or run with --fix to auto-remove";
const console_help = "Remove console statements before committing. Use a proper logging library or disable this rule if console output is intentional";
const curly_help = "Change the string quotes from ' or \" to backticks (`) to use template literal interpolation, or escape the $ if you meant to use it literally";
const cond_help = "Use === or == for comparison instead of = (assignment). Wrap intentional assignments in extra parentheses.";

pub fn scan(
    allocator: Allocator,
    path: []const u8,
    content: []const u8,
    settings: *const types.Settings,
    suppress: *const directives.DisableDirectives,
    comment_lines: *const std.AutoHashMap(u32, void),
    out: *std.ArrayList(types.Issue),
) !void {
    const b = settings.builtins;
    var ext_buf: [8]u8 = undefined;
    const ext = fileExt(path, &ext_buf);
    const is_md = std.mem.eql(u8, ext, "md");
    const is_shell = isOneOf(ext, &.{ "sh", "bash", "zsh", "ksh", "dash" }) or text.hasShellShebang(content);
    const quotes_sev: ?Severity = if (b.quotes == null or
        isOneOf(ext, &.{ "json", "jsonc", "lock", "md", "yaml", "yml", "stx", "html", "htm", "vue" }) or
        is_shell or std.mem.endsWith(u8, path, "bun.lock")) null else b.quotes;
    // Code-level rules are off for non-code files
    const skip_code = is_md or isOneOf(ext, &.{ "yaml", "yml", "json", "jsonc" }) or is_shell;
    // `indentRuleSeverity`
    const indent_sev: ?Severity = if (is_md or isOneOf(ext, &.{ "stx", "html", "htm", "vue", "yaml", "yml" }) or is_shell) null else b.indent;
    const debugger_sev = if (skip_code) null else b.no_debugger;
    const console_sev = if (skip_code) null else b.no_console;
    const curly_sev = b.no_template_curly_in_string;
    const cond_sev = if (skip_code) null else b.no_cond_assign;
    if (quotes_sev == null and indent_sev == null and debugger_sev == null and console_sev == null and curly_sev == null and cond_sev == null) return;

    // Lines inside fenced code blocks, for markdown
    var fenced: std.ArrayList(u32) = .empty;
    if (is_md) {
        var in_fence = false;
        var it = lex.lines(content);
        var n: u32 = 0;
        while (it.next()) |line| {
            n += 1;
            if (isFence(line)) {
                in_fence = !in_fence;
                continue;
            }
            if (in_fence) try fenced.append(allocator, n);
        }
    }
    var in_fenced: LineCursor = .{ .lines = fenced.items };
    var in_template: LineCursor = .{ .lines = try lex.templateLiteralLines(allocator, content) };

    const bad_quote: u8 = if (settings.quotes == .single) '"' else '\'';
    var quotes_reported = false;
    var regex_buf: std.ArrayList(u8) = .empty;
    var comment_buf: std.ArrayList(u8) = .empty;
    var blank_buf: std.ArrayList(u8) = .empty;
    var indent_help: ?[]const u8 = null;

    var it = lex.lines(content);
    var line_no: u32 = 0;
    while (it.next()) |line| {
        line_no += 1;
        if (comment_lines.contains(line_no)) continue;
        const templ = in_template.has(line_no);
        // `stripComments(stripRegexLiterals(line))`, once per line
        var stripped: ?[]const u8 = null;

        if (quotes_sev) |sev| {
            if (!templ and !quotes_reported and std.mem.indexOfScalar(u8, line, bad_quote) != null) {
                stripped = try lex.stripComments(allocator, try lex.stripRegexLiterals(allocator, line, &regex_buf), &comment_buf);
                if (quotes.firstQuoteIssue(stripped.?, settings.quotes)) |idx| {
                    if (!directives.isSuppressed("quotes", line_no, suppress)) try out.append(allocator, .{
                        .line = line_no,
                        .column = @intCast(text.utf16Index(stripped.?, idx) + 1),
                        .rule_id = "quotes",
                        .message = "Inconsistent quote style",
                        .severity = sev,
                        .help = if (settings.quotes == .single) quotes_help_single else quotes_help_double,
                    });
                    quotes_reported = true;
                }
            }
        }

        if (indent_sev) |sev| {
            var ws_end: usize = 0;
            while (ws_end < line.len and (line[ws_end] == ' ' or line[ws_end] == '\t')) ws_end += 1;
            if (ws_end > 0 and !in_fenced.has(line_no) and !templ and hasIndentIssue(line[0..ws_end], settings.indent, settings.indent_style, line)) {
                if (!directives.isSuppressed("indent", line_no, suppress)) {
                    if (indent_help == null) indent_help = if (settings.indent_style == .spaces)
                        try std.fmt.allocPrint(allocator, "Use {d} spaces for indentation. Configure with format.indent and format.indentStyle in your config", .{settings.indent})
                    else
                        indent_help_tabs;
                    try out.append(allocator, .{
                        .line = line_no,
                        .column = 1,
                        .rule_id = "indent",
                        .message = "Incorrect indentation detected",
                        .severity = sev,
                        .help = indent_help,
                    });
                }
            }
        }

        if (templ) continue;

        if (debugger_sev) |sev| {
            if (isDebuggerStatement(line) and !directives.isSuppressed("no-debugger", line_no, suppress)) try out.append(allocator, .{
                .line = line_no,
                .column = 1,
                .rule_id = "no-debugger",
                .message = "Unexpected debugger statement",
                .severity = sev,
                .help = debugger_help,
            });
        }

        if (console_sev) |sev| {
            if (hasConsoleLogCall(line)) {
                if (consoleColumn(line)) |k| {
                    if (!directives.isSuppressed("no-console", line_no, suppress)) try out.append(allocator, .{
                        .line = line_no,
                        .column = @intCast(text.utf16Index(line, k) + 1),
                        .rule_id = "no-console",
                        .message = "Unexpected console call",
                        .severity = sev,
                        .help = console_help,
                    });
                }
            }
        }

        if (curly_sev) |sev| {
            if (std.mem.indexOf(u8, line, "${") != null) {
                if (templateCurlyColumn(line)) |k| {
                    if (!directives.isSuppressed("no-template-curly-in-string", line_no, suppress)) try out.append(allocator, .{
                        .line = line_no,
                        .column = @intCast(text.utf16Index(line, k) + 1),
                        .rule_id = "no-template-curly-in-string",
                        .message = "Unexpected template string expression in normal string",
                        .severity = sev,
                        .help = curly_help,
                    });
                }
            }
        }

        if (cond_sev) |sev| {
            // Only a line naming one of the keywords can have a condition
            const if_while = std.mem.indexOf(u8, line, "if") != null or std.mem.indexOf(u8, line, "while") != null;
            const for_kw = std.mem.indexOf(u8, line, "for") != null;
            if (if_while or for_kw) {
                if (stripped == null) stripped = try lex.stripComments(allocator, try lex.stripRegexLiterals(allocator, line, &regex_buf), &comment_buf);
                const cond_line = try cond.blankStrings(allocator, stripped.?, &blank_buf);
                const kws = [_]cond.Keyword{ .if_while, .@"for" };
                for (kws) |kw| {
                    if (kw == .if_while and !if_while) continue;
                    if (kw == .@"for" and !for_kw) continue;
                    if (!cond.conditionAssigns(cond_line, kw)) continue;
                    if (directives.isSuppressed("no-cond-assign", line_no, suppress)) continue;
                    try out.append(allocator, .{
                        .line = line_no,
                        .column = cond.parenColumn(line, kw),
                        .rule_id = "no-cond-assign",
                        .message = "Unexpected assignment within a conditional expression",
                        .severity = sev,
                        .help = cond_help,
                    });
                }
            }
        }
    }
}
