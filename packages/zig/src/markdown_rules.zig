const std = @import("std");
const Allocator = std.mem.Allocator;
const cfg_mod = @import("config.zig");
const scanner = @import("scanner.zig");
const directives_mod = @import("directives.zig");

const LintIssue = scanner.LintIssue;
const Severity = LintIssue.Severity;

fn mapSeverity(sev: cfg_mod.RuleSeverity) ?Severity {
    return switch (sev) {
        .@"error" => .@"error",
        .warn => .warning,
        .off => null,
    };
}

/// Run all markdown rules on file content
pub fn runMarkdownRules(
    file_path: []const u8,
    content: []const u8,
    cfg: *const cfg_mod.PickierConfig,
    suppress: *const directives_mod.DisableDirectives,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const md = skipFrontmatter(content);
    const fm_lines = countNewlines(content[0 .. content.len - md.len]);

    // ATX heading rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-multiple-space-atx"))) |sev|
        try checkNoMultipleSpaceAtx(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-missing-space-closed-atx"))) |sev|
        try checkNoMissingSpaceClosedAtx(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-multiple-space-closed-atx"))) |sev|
        try checkNoMultipleSpaceClosedAtx(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/heading-style"))) |sev|
        try checkHeadingStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Heading organization rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/blanks-around-headings"))) |sev|
        try checkBlanksAroundHeadings(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/heading-start-left"))) |sev|
        try checkHeadingStartLeft(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-duplicate-heading"))) |sev|
        try checkNoDuplicateHeading(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/single-title"))) |sev|
        try checkSingleTitle(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-trailing-punctuation"))) |sev|
        try checkNoTrailingPunctuation(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // List rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/ul-style"))) |sev|
        try checkUlStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/list-indent"))) |sev|
        try checkListIndent(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/list-marker-space"))) |sev|
        try checkListMarkerSpace(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Whitespace rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-hard-tabs"))) |sev|
        try checkNoHardTabs(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-multiple-blanks"))) |sev|
        try checkNoMultipleBlanks(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/single-trailing-newline"))) |sev|
        try checkSingleTrailingNewline(file_path, content, sev, suppress, issues, allocator);

    // Blockquote rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-multiple-space-blockquote"))) |sev|
        try checkNoMultipleSpaceBlockquote(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Link rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-reversed-links"))) |sev|
        try checkNoReversedLinks(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-space-in-links"))) |sev|
        try checkNoSpaceInLinks(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-empty-links"))) |sev|
        try checkNoEmptyLinks(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-bare-urls"))) |sev|
        try checkNoBareUrls(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Code block rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/fenced-code-language"))) |sev|
        try checkFencedCodeLanguage(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/code-block-style"))) |sev|
        try checkCodeBlockStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/blanks-around-fences"))) |sev|
        try checkBlanksAroundFences(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-space-in-code"))) |sev|
        try checkNoSpaceInCode(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Emphasis rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-emphasis-as-heading"))) |sev|
        try checkNoEmphasisAsHeading(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-space-in-emphasis"))) |sev|
        try checkNoSpaceInEmphasis(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/emphasis-style"))) |sev|
        try checkEmphasisStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Inline HTML
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-inline-html"))) |sev|
        try checkNoInlineHtml(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Table rules
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/table-pipe-style"))) |sev|
        try checkTablePipeStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/blanks-around-tables"))) |sev|
        try checkBlanksAroundTables(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/table-column-count"))) |sev|
        try checkTableColumnCount(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // List rules (additional)
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/ul-indent"))) |sev|
        try checkUlIndent(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/blanks-around-lists"))) |sev|
        try checkBlanksAroundLists(file_path, md, fm_lines, sev, suppress, issues, allocator);

    // Link/image rules (additional)
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/reference-links-images"))) |sev|
        try checkReferenceLinksImages(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/link-image-style"))) |sev|
        try checkLinkImageStyle(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/descriptive-link-text"))) |sev|
        try checkDescriptiveLinkText(file_path, md, fm_lines, sev, suppress, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("markdown/no-alt-text"))) |sev|
        try checkNoAltText(file_path, md, fm_lines, sev, suppress, issues, allocator);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn skipFrontmatter(content: []const u8) []const u8 {
    if (!std.mem.startsWith(u8, content, "---")) return content;
    if (std.mem.indexOf(u8, content[3..], "\n---")) |end| {
        const close = 3 + end + 4;
        const next_nl = std.mem.indexOfScalarPos(u8, content, close, '\n') orelse content.len;
        if (next_nl < content.len) return content[next_nl + 1 ..];
        return content[content.len..];
    }
    return content;
}

fn countNewlines(s: []const u8) u32 {
    var n: u32 = 0;
    for (s) |ch| if (ch == '\n') {
        n += 1;
    };
    return n;
}

fn isHeadingLine(trimmed: []const u8) bool {
    if (trimmed.len == 0 or trimmed[0] != '#') return false;
    var hashes: usize = 0;
    while (hashes < trimmed.len and trimmed[hashes] == '#') hashes += 1;
    if (hashes > 6) return false;
    if (hashes >= trimmed.len) return true; // line is just ###
    return trimmed[hashes] == ' ' or trimmed[hashes] == '\t';
}

fn headingLevel(trimmed: []const u8) u32 {
    var h: u32 = 0;
    for (trimmed) |ch| {
        if (ch == '#') {
            h += 1;
        } else break;
    }
    return h;
}

fn headingText(trimmed: []const u8) []const u8 {
    var i: usize = 0;
    while (i < trimmed.len and trimmed[i] == '#') i += 1;
    return std.mem.trim(u8, trimmed[i..], " \t#");
}

const LineIter = struct {
    content: []const u8,
    pos: usize = 0,
    fn next(self: *LineIter) ?[]const u8 {
        if (self.pos >= self.content.len) return null;
        const end = std.mem.indexOfScalarPos(u8, self.content, self.pos, '\n') orelse self.content.len;
        const line = self.content[self.pos..end];
        self.pos = if (end < self.content.len) end + 1 else self.content.len;
        return line;
    }
};

fn isFenceStart(trimmed: []const u8) bool {
    return (trimmed.len >= 3 and trimmed[0] == '`' and trimmed[1] == '`' and trimmed[2] == '`') or
        (trimmed.len >= 3 and trimmed[0] == '~' and trimmed[1] == '~' and trimmed[2] == '~');
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

fn checkNoMultipleSpaceAtx(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (t.len > 1 and t[0] == '#') {
            var h: usize = 0;
            while (h < t.len and t[h] == '#') h += 1;
            if (h <= 6 and h < t.len and t[h] == ' ') {
                // Check for multiple spaces after #
                if (h + 1 < t.len and t[h + 1] == ' ') {
                    if (!directives_mod.isSuppressed("markdown/no-multiple-space-atx", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-multiple-space-atx", .message = "Multiple spaces after hash on atx style heading", .severity = sev });
                    }
                }
            }
        }
    }
}

fn checkNoMissingSpaceClosedAtx(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        // Closed ATX: ## Heading ##
        if (isHeadingLine(t) and std.mem.endsWith(u8, std.mem.trimEnd(u8, t, " \t"), "#")) {
            const trimmed_end = std.mem.trimEnd(u8, t, " \t");
            if (trimmed_end.len > 1 and trimmed_end[trimmed_end.len - 1] == '#') {
                // Check for space before closing #
                var j = trimmed_end.len - 1;
                while (j > 0 and trimmed_end[j] == '#') j -= 1;
                if (j > 0 and trimmed_end[j] != ' ') {
                    if (!directives_mod.isSuppressed("markdown/no-missing-space-closed-atx", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-missing-space-closed-atx", .message = "No space before closing hash on closed atx style heading", .severity = sev });
                    }
                }
            }
        }
    }
}

fn checkNoMultipleSpaceClosedAtx(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isHeadingLine(t) and std.mem.endsWith(u8, std.mem.trimEnd(u8, t, " \t"), "#")) {
            const trimmed_end = std.mem.trimEnd(u8, t, " \t");
            var j = trimmed_end.len - 1;
            while (j > 0 and trimmed_end[j] == '#') j -= 1;
            if (j > 1 and trimmed_end[j] == ' ' and trimmed_end[j - 1] == ' ') {
                if (!directives_mod.isSuppressed("markdown/no-multiple-space-closed-atx", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-multiple-space-closed-atx", .message = "Multiple spaces before closing hash on closed atx style heading", .severity = sev });
                }
            }
        }
    }
}

fn checkHeadingStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // Enforce ATX style (# Heading) — flag setext-style (underline with === or ---)
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var prev_line: []const u8 = "";
    var in_fence = false;
    while (it.next()) |line| {
        defer {
            line_no += 1;
            prev_line = line;
        }
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        // Setext h1: line of === under text
        if (t.len >= 1 and (t[0] == '=' or t[0] == '-')) {
            const ch = t[0];
            var all_same = true;
            for (t) |c| {
                if (c != ch and c != ' ' and c != '\t') {
                    all_same = false;
                    break;
                }
            }
            if (all_same and prev_line.len > 0 and std.mem.trim(u8, prev_line, " \t").len > 0) {
                if (!directives_mod.isSuppressed("markdown/heading-style", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/heading-style", .message = "Heading style should be ATX (# Heading)", .severity = sev });
                }
            }
        }
    }
}

fn checkBlanksAroundHeadings(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var prev_blank = true; // treat start of file as blank
    var in_fence = false;
    var prev_was_heading = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) {
            prev_blank = false;
            prev_was_heading = false;
            continue;
        }
        const is_blank = t.len == 0;
        const is_heading = isHeadingLine(t);

        if (is_heading and !prev_blank and line_no > fm + 1) {
            if (!directives_mod.isSuppressed("markdown/blanks-around-headings", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-headings", .message = "Headings should be surrounded by blank lines", .severity = sev });
            }
        }
        if (prev_was_heading and !is_blank and !is_heading) {
            if (!directives_mod.isSuppressed("markdown/blanks-around-headings", line_no - 1, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no - 1, .column = 1, .rule_id = "markdown/blanks-around-headings", .message = "Headings should be surrounded by blank lines", .severity = sev });
            }
        }

        prev_blank = is_blank;
        prev_was_heading = is_heading;
    }
}

fn checkHeadingStartLeft(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isHeadingLine(t) and line.len > 0 and (line[0] == ' ' or line[0] == '\t')) {
            if (!directives_mod.isSuppressed("markdown/heading-start-left", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/heading-start-left", .message = "Heading should start at the beginning of the line", .severity = sev });
            }
        }
    }
}

fn checkNoDuplicateHeading(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    // Track seen headings (up to 256)
    var seen: [256][]const u8 = undefined;
    var seen_count: usize = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isHeadingLine(t)) {
            const text = headingText(t);
            if (text.len > 0) {
                for (seen[0..seen_count]) |s| {
                    if (std.mem.eql(u8, s, text)) {
                        if (!directives_mod.isSuppressed("markdown/no-duplicate-heading", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-duplicate-heading", .message = "Duplicate heading text", .severity = sev });
                        }
                        break;
                    }
                }
                if (seen_count < 256) {
                    seen[seen_count] = text;
                    seen_count += 1;
                }
            }
        }
    }
}

fn checkSingleTitle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var h1_count: u32 = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isHeadingLine(t) and headingLevel(t) == 1) {
            h1_count += 1;
            if (h1_count > 1) {
                if (!directives_mod.isSuppressed("markdown/single-title", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/single-title", .message = "Multiple top-level headings in the same document", .severity = sev });
                }
            }
        }
    }
}

fn checkNoTrailingPunctuation(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isHeadingLine(t)) {
            const text = std.mem.trimEnd(u8, headingText(t), " \t");
            if (text.len > 0) {
                const last = text[text.len - 1];
                if (last == '.' or last == ',' or last == ';' or last == ':') {
                    if (!directives_mod.isSuppressed("markdown/no-trailing-punctuation", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-trailing-punctuation", .message = "Trailing punctuation in heading", .severity = sev });
                    }
                }
            }
        }
    }
}

fn checkUlStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // Enforce consistent unordered list style: - (dash)
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (t.len >= 2 and (t[0] == '*' or t[0] == '+') and t[1] == ' ') {
            if (!directives_mod.isSuppressed("markdown/ul-style", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/ul-style", .message = "Unordered list style should use '-'", .severity = sev });
            }
        }
    }
}

fn checkListIndent(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // MD005: List items at the same level should have consistent indentation
    // Track the first-seen indentation for each level and flag mismatches
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var in_list = false;

    // Track expected indentation per level (up to 10 levels)
    var level_indents: [10]i32 = .{ -1, -1, -1, -1, -1, -1, -1, -1, -1, -1 };

    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        if (isListItem(t)) {
            in_list = true;
            // Count leading spaces
            var spaces: usize = 0;
            for (line) |ch| {
                if (ch == ' ') {
                    spaces += 1;
                } else if (ch == '\t') {
                    spaces += 4;
                } else break;
            }
            const level = spaces / 2; // Assume 2-space per level
            if (level < 10) {
                if (level_indents[level] < 0) {
                    // First item at this level — record expected indent
                    level_indents[level] = @intCast(spaces);
                } else if (level_indents[level] != @as(i32, @intCast(spaces))) {
                    if (!directives_mod.isSuppressed("markdown/list-indent", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/list-indent", .message = "Inconsistent list indentation", .severity = sev });
                    }
                }
            }
        } else if (std.mem.trim(u8, line, " \t\r").len == 0 and in_list) {
            // Blank line — check if list continues
            // Simple heuristic: reset if the list seems done
            // (next non-blank line is not a list item)
            // For simplicity, just continue tracking
        }
    }
}

fn checkListMarkerSpace(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        // Check for list marker without exactly 1 space after
        if (t.len >= 2 and (t[0] == '-' or t[0] == '*' or t[0] == '+')) {
            if (t[1] != ' ') {
                // Marker with no space (e.g., "-text" — skip if it's a horizontal rule)
                if (t[0] == '-' and t.len >= 3 and t[1] == '-') continue;
            } else if (t.len >= 3 and t[2] == ' ') {
                // Multiple spaces after marker
                if (!directives_mod.isSuppressed("markdown/list-marker-space", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/list-marker-space", .message = "Expected 1 space after list marker", .severity = sev });
                }
            }
        }
        // Ordered list: 1. text
        if (t.len >= 3 and t[0] >= '0' and t[0] <= '9') {
            if (std.mem.indexOfScalar(u8, t[0..@min(t.len, 10)], '.')) |dot| {
                if (dot + 1 < t.len and t[dot + 1] == ' ' and dot + 2 < t.len and t[dot + 2] == ' ') {
                    if (!directives_mod.isSuppressed("markdown/list-marker-space", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/list-marker-space", .message = "Expected 1 space after list marker", .severity = sev });
                    }
                }
            }
        }
    }
}

fn checkNoHardTabs(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " ");
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;
        _ = t;
        if (std.mem.indexOfScalar(u8, line, '\t') != null) {
            if (!directives_mod.isSuppressed("markdown/no-hard-tabs", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-hard-tabs", .message = "Hard tabs found", .severity = sev });
            }
        }
    }
}

fn checkNoMultipleBlanks(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var consecutive_blanks: u32 = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trim(u8, line, " \t\r");
        if (t.len == 0) {
            consecutive_blanks += 1;
            if (consecutive_blanks > 1) {
                if (!directives_mod.isSuppressed("markdown/no-multiple-blanks", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-multiple-blanks", .message = "Multiple consecutive blank lines", .severity = sev });
                }
            }
        } else {
            consecutive_blanks = 0;
        }
    }
}

fn checkSingleTrailingNewline(fp: []const u8, content: []const u8, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    if (content.len == 0) return;
    const line_no = countNewlines(content) + 1;
    if (!std.mem.endsWith(u8, content, "\n")) {
        if (!directives_mod.isSuppressed("markdown/single-trailing-newline", line_no, sup)) {
            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/single-trailing-newline", .message = "File should end with a single trailing newline", .severity = sev });
        }
    } else if (std.mem.endsWith(u8, content, "\n\n")) {
        if (!directives_mod.isSuppressed("markdown/single-trailing-newline", line_no, sup)) {
            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/single-trailing-newline", .message = "File should end with a single trailing newline", .severity = sev });
        }
    }
}

fn checkNoMultipleSpaceBlockquote(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (t.len >= 3 and t[0] == '>' and t[1] == ' ' and t[2] == ' ') {
            if (!directives_mod.isSuppressed("markdown/no-multiple-space-blockquote", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-multiple-space-blockquote", .message = "Multiple spaces after blockquote symbol", .severity = sev });
            }
        }
    }
}

fn checkNoReversedLinks(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) in_fence = !in_fence;
        if (in_fence) continue;
        // Check for (text)[url] instead of [text](url)
        if (std.mem.indexOf(u8, line, ")(") != null or std.mem.indexOf(u8, line, ")[") != null) {
            // Look for pattern: (text)[url]
            var i: usize = 0;
            while (i < line.len) : (i += 1) {
                if (line[i] == '(' and i > 0) {
                    if (std.mem.indexOfScalarPos(u8, line, i + 1, ')')) |close_paren| {
                        if (close_paren + 1 < line.len and line[close_paren + 1] == '[') {
                            if (!directives_mod.isSuppressed("markdown/no-reversed-links", line_no, sup)) {
                                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/no-reversed-links", .message = "Reversed link syntax (should be [text](url))", .severity = sev });
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
}

fn checkNoSpaceInLinks(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;
        // Look for [text]( url ) with spaces inside parens
        var i: usize = 0;
        while (i < line.len) : (i += 1) {
            if (line[i] == ']' and i + 1 < line.len and line[i + 1] == '(') {
                if (std.mem.indexOfScalarPos(u8, line, i + 2, ')')) |close| {
                    const url = line[i + 2 .. close];
                    if (url.len > 0 and (url[0] == ' ' or url[url.len - 1] == ' ')) {
                        if (!directives_mod.isSuppressed("markdown/no-space-in-links", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/no-space-in-links", .message = "Spaces inside link URL", .severity = sev });
                        }
                    }
                    i = close;
                }
            }
        }
    }
}

fn checkNoEmptyLinks(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;
        // Look for [text]() or [text]( )
        var i: usize = 0;
        while (i < line.len) : (i += 1) {
            if (line[i] == ']' and i + 1 < line.len and line[i + 1] == '(') {
                if (std.mem.indexOfScalarPos(u8, line, i + 2, ')')) |close| {
                    const url = std.mem.trim(u8, line[i + 2 .. close], " \t");
                    if (url.len == 0) {
                        if (!directives_mod.isSuppressed("markdown/no-empty-links", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/no-empty-links", .message = "Empty link", .severity = sev });
                        }
                    }
                    i = close;
                }
            }
        }
    }
}

fn checkNoBareUrls(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var in_html_comment = false;
    while (it.next()) |line| {
        defer line_no += 1;
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;

        // Track HTML comments
        if (std.mem.indexOf(u8, line, "<!--") != null) in_html_comment = true;
        if (std.mem.indexOf(u8, line, "-->") != null) {
            in_html_comment = false;
            continue;
        }
        if (in_html_comment) continue;

        // Skip reference link definitions: [label]: url
        const trimmed = std.mem.trimStart(u8, line, " \t");
        if (trimmed.len > 0 and trimmed[0] == '[' and std.mem.indexOf(u8, trimmed, "]:") != null) continue;

        // Find all URL occurrences on the line
        var search_start: usize = 0;
        while (search_start < line.len) {
            const http_pos = std.mem.indexOfPos(u8, line, search_start, "http://") orelse
                std.mem.indexOfPos(u8, line, search_start, "https://") orelse break;

            // Check if inside inline code span
            var in_code = false;
            var bi: usize = 0;
            while (bi < http_pos) : (bi += 1) {
                if (line[bi] == '`') in_code = !in_code;
            }
            if (in_code) {
                search_start = http_pos + 7;
                continue;
            }

            // Check if it's already in a link or auto-link
            if (http_pos > 0 and (line[http_pos - 1] == '(' or line[http_pos - 1] == '<' or
                line[http_pos - 1] == '"' or line[http_pos - 1] == '\''))
            {
                search_start = http_pos + 7;
                continue;
            }

            if (!directives_mod.isSuppressed("markdown/no-bare-urls", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(http_pos + 1), .rule_id = "markdown/no-bare-urls", .message = "Bare URL used, should be wrapped in angle brackets or a link", .severity = sev });
            }
            // Only report once per line
            break;
        }
    }
}

fn checkFencedCodeLanguage(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            if (in_fence) {
                // Closing fence — skip
                in_fence = false;
                continue;
            }
            // Opening fence — check for language
            in_fence = true;
            // Extract what comes after the fence markers
            var fence_len: usize = 0;
            const fence_char = t[0];
            while (fence_len < t.len and t[fence_len] == fence_char) fence_len += 1;
            const after = std.mem.trim(u8, t[fence_len..], " \t");
            if (after.len == 0) {
                if (!directives_mod.isSuppressed("markdown/fenced-code-language", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/fenced-code-language", .message = "Fenced code block should have a language specified", .severity = sev });
                }
            }
        }
    }
}

fn checkNoEmphasisAsHeading(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var prev_blank = true;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trim(u8, line, " \t\r");
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) {
            prev_blank = false;
            continue;
        }
        // Bold text used as heading: **text** or __text__ on its own line after blank
        if (prev_blank and t.len > 4) {
            if ((std.mem.startsWith(u8, t, "**") and std.mem.endsWith(u8, t, "**")) or
                (std.mem.startsWith(u8, t, "__") and std.mem.endsWith(u8, t, "__")))
            {
                if (!directives_mod.isSuppressed("markdown/no-emphasis-as-heading", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/no-emphasis-as-heading", .message = "Emphasis used instead of a heading", .severity = sev });
                }
            }
        }
        prev_blank = t.len == 0;
    }
}

fn checkNoSpaceInEmphasis(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;
        // Check for * text * or _ text _
        var i: usize = 0;
        while (i < line.len) : (i += 1) {
            if ((line[i] == '*' or line[i] == '_') and i + 2 < line.len and line[i + 1] == ' ') {
                // Look for closing marker
                const marker = line[i];
                if (std.mem.indexOfScalarPos(u8, line, i + 2, marker)) |close| {
                    if (close > 0 and line[close - 1] == ' ') {
                        if (!directives_mod.isSuppressed("markdown/no-space-in-emphasis", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/no-space-in-emphasis", .message = "Spaces inside emphasis markers", .severity = sev });
                        }
                        i = close;
                    }
                }
            }
        }
    }
}

fn checkNoInlineHtml(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        if (isFenceStart(std.mem.trimStart(u8, line, " \t"))) in_fence = !in_fence;
        if (in_fence) continue;
        // Strip inline code spans before checking
        // We scan without actually modifying the line — just skip backtick regions
        var search_pos: usize = 0;
        while (search_pos < line.len) {
            // Skip inline code spans
            if (line[search_pos] == '`') {
                const code_start = search_pos + 1;
                if (std.mem.indexOfScalarPos(u8, line, code_start, '`')) |code_end| {
                    search_pos = code_end + 1;
                    continue;
                }
            }
            // Look for < that could be an HTML tag
            if (line[search_pos] == '<') {
                const lt = search_pos;
                // Allow <!-- comments -->
                if (lt + 3 < line.len and std.mem.startsWith(u8, line[lt..], "<!--")) {
                    search_pos = lt + 4;
                    continue;
                }
                // Check for valid HTML tag: <tagname or </tagname
                var tag_start = lt + 1;
                if (tag_start < line.len and line[tag_start] == '/') tag_start += 1;
                // Tag name must start with a-z (case insensitive)
                if (tag_start < line.len and ((line[tag_start] >= 'a' and line[tag_start] <= 'z') or (line[tag_start] >= 'A' and line[tag_start] <= 'Z'))) {
                    // Tag name: [a-zA-Z][a-zA-Z0-9]*
                    var tag_end = tag_start + 1;
                    while (tag_end < line.len and (
                        (line[tag_end] >= 'a' and line[tag_end] <= 'z') or
                        (line[tag_end] >= 'A' and line[tag_end] <= 'Z') or
                        (line[tag_end] >= '0' and line[tag_end] <= '9'))) tag_end += 1;
                    // After tag name, must hit a word boundary (non-alphanumeric char)
                    // Then allow any chars until closing >
                    if (tag_end < line.len and !isTagNameChar(line[tag_end])) {
                        // Find the closing >
                        if (std.mem.indexOfScalarPos(u8, line, tag_end, '>')) |_| {
                            if (!directives_mod.isSuppressed("markdown/no-inline-html", line_no, sup)) {
                                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(lt + 1), .rule_id = "markdown/no-inline-html", .message = "Inline HTML", .severity = sev });
                            }
                        }
                    }
                }
            }
            search_pos += 1;
        }
    }
}

// ---------------------------------------------------------------------------
// markdown/code-block-style — enforce fenced code block style
// ---------------------------------------------------------------------------
fn checkCodeBlockStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // MD046 — consistent code block style (default: consistent)
    // Detect first style used, then flag any blocks of the other style
    const Style = enum { fenced, indented };
    var detected_style: ?Style = null;

    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var prev_blank = false;

    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        const is_blank = std.mem.trim(u8, line, " \t\r").len == 0;

        // Check for fenced code block
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            if (detected_style == null) {
                detected_style = .fenced;
            } else if (detected_style == .indented) {
                if (!directives_mod.isSuppressed("markdown/code-block-style", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/code-block-style", .message = "Code block style should be consistent throughout document", .severity = sev });
                }
            }
            prev_blank = false;
            continue;
        }
        if (in_fence) {
            prev_blank = false;
            continue;
        }

        // Check for indented code block (4 spaces or tab, after blank line, non-empty)
        const is_indented = (line.len >= 4 and std.mem.startsWith(u8, line, "    ")) or
            (line.len >= 1 and line[0] == '\t');
        if (is_indented and !is_blank and prev_blank) {
            if (detected_style == null) {
                detected_style = .indented;
            } else if (detected_style == .fenced) {
                if (!directives_mod.isSuppressed("markdown/code-block-style", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/code-block-style", .message = "Expected fenced code block style", .severity = sev });
                }
            }
        }
        prev_blank = is_blank;
    }
}

// ---------------------------------------------------------------------------
// markdown/blanks-around-fences — blank lines around fenced code blocks
// ---------------------------------------------------------------------------
fn checkBlanksAroundFences(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var prev_blank = true; // Treat start-of-file as blank
    var fence_close_line: u32 = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        const is_blank = t.len == 0;
        if (isFenceStart(t)) {
            if (!in_fence) {
                // Opening fence — check previous line is blank
                if (!prev_blank and line_no > fm + 1) {
                    if (!directives_mod.isSuppressed("markdown/blanks-around-fences", line_no, sup)) {
                        try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-fences", .message = "Expected blank line before fenced code block", .severity = sev });
                    }
                }
                in_fence = true;
            } else {
                // Closing fence
                in_fence = false;
                fence_close_line = line_no;
            }
        } else if (fence_close_line > 0 and fence_close_line == line_no - 1 and !is_blank) {
            if (!directives_mod.isSuppressed("markdown/blanks-around-fences", fence_close_line, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = fence_close_line, .column = 1, .rule_id = "markdown/blanks-around-fences", .message = "Expected blank line after fenced code block", .severity = sev });
            }
        }
        prev_blank = is_blank;
    }
}

// ---------------------------------------------------------------------------
// markdown/no-space-in-code — spaces inside code spans
// ---------------------------------------------------------------------------
fn checkNoSpaceInCode(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Find code spans: `...`
        var i: usize = 0;
        while (i < line.len) {
            if (line[i] == '`') {
                // Count backticks
                var bt_count: usize = 0;
                const bt_start = i;
                while (i < line.len and line[i] == '`') {
                    bt_count += 1;
                    i += 1;
                }
                // Find matching closing backticks
                if (findClosingBackticks(line, i, bt_count)) |close_start| {
                    const inner = line[i..close_start];
                    // Check for leading and trailing space
                    if (inner.len > 0 and inner[0] == ' ' and inner[inner.len - 1] == ' ') {
                        if (!directives_mod.isSuppressed("markdown/no-space-in-code", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(bt_start + 1), .rule_id = "markdown/no-space-in-code", .message = "Spaces inside code span", .severity = sev });
                        }
                    }
                    i = close_start + bt_count;
                }
            } else {
                i += 1;
            }
        }
    }
}

fn findClosingBackticks(line: []const u8, start: usize, count: usize) ?usize {
    var i = start;
    while (i < line.len) {
        if (line[i] == '`') {
            var bt: usize = 0;
            const bt_start = i;
            while (i < line.len and line[i] == '`') {
                bt += 1;
                i += 1;
            }
            if (bt == count) return bt_start;
        } else {
            i += 1;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// markdown/emphasis-style — enforce asterisk or underscore emphasis
// ---------------------------------------------------------------------------
fn checkEmphasisStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // Default: asterisk style. Flag _text_ emphasis (not __text__).
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Skip lines in inline code
        if (std.mem.indexOf(u8, line, "`") != null) continue;
        // Look for underscore emphasis: _text_ (not __text__ or snake_case)
        var i: usize = 0;
        while (i < line.len) {
            if (line[i] == '_') {
                // Skip __ (strong emphasis)
                if (i + 1 < line.len and line[i + 1] == '_') {
                    i += 2;
                    while (i + 1 < line.len) {
                        if (line[i] == '_' and line[i + 1] == '_') {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                    continue;
                }
                // Must not have word char before (to exclude snake_case)
                if (i > 0 and isIdentCharMd(line[i - 1])) {
                    i += 1;
                    continue;
                }
                // Must have non-space after opening _
                if (i + 1 >= line.len or line[i + 1] == ' ' or line[i + 1] == '_') {
                    i += 1;
                    continue;
                }
                // Find closing _ that is not preceded by space and not followed by word char
                var j = i + 2; // at least 1 char between
                while (j < line.len) {
                    if (line[j] == '_') {
                        // Closing _ must not be preceded by space
                        if (line[j - 1] == ' ') {
                            j += 1;
                            continue;
                        }
                        // Must not be followed by word char (snake_case)
                        if (j + 1 < line.len and isIdentCharMd(line[j + 1])) {
                            j += 1;
                            continue;
                        }
                        // Must not be __ (strong)
                        if (j + 1 < line.len and line[j + 1] == '_') {
                            j += 2;
                            continue;
                        }
                        // Valid underscore emphasis found
                        // But skip if content contains special chars (URLs, emails, code)
                        const inner = line[i + 1 .. j];
                        const has_special = std.mem.indexOf(u8, inner, "<") != null or
                            std.mem.indexOf(u8, inner, ">") != null or
                            std.mem.indexOf(u8, inner, "@") != null or
                            std.mem.indexOf(u8, inner, "://") != null or
                            std.mem.indexOf(u8, inner, "(") != null;
                        if (!has_special) {
                            if (!directives_mod.isSuppressed("markdown/emphasis-style", line_no, sup)) {
                                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/emphasis-style", .message = "Expected asterisk emphasis, found underscore", .severity = sev });
                            }
                        }
                        i = j + 1;
                        break;
                    }
                    j += 1;
                }
                if (j >= line.len) i = j;
            } else {
                i += 1;
            }
        }
    }
}

fn isIdentCharMd(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9') or ch == '_';
}

// ---------------------------------------------------------------------------
// markdown/table-pipe-style — leading and trailing pipes
// ---------------------------------------------------------------------------
fn checkTablePipeStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Detect table rows: must contain | and not be a horizontal rule
        if (!isTableRow(t)) continue;
        const trimmed_end = std.mem.trimEnd(u8, t, " \t\r");
        // Default style: leading_and_trailing
        const has_leading = trimmed_end.len > 0 and trimmed_end[0] == '|';
        const has_trailing = trimmed_end.len > 0 and trimmed_end[trimmed_end.len - 1] == '|';
        if (!has_leading or !has_trailing) {
            if (!directives_mod.isSuppressed("markdown/table-pipe-style", line_no, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/table-pipe-style", .message = "Table row should have leading and trailing pipes", .severity = sev });
            }
        }
    }
}

fn isTableRow(t: []const u8) bool {
    // A line is a table row if it contains | and is not a thematic break
    if (std.mem.indexOf(u8, t, "|") == null) return false;
    // Exclude horizontal rules like |---|---|
    // A table row must have content cells separated by |
    var pipe_count: usize = 0;
    for (t) |ch| {
        if (ch == '|') pipe_count += 1;
    }
    return pipe_count >= 1;
}

// ---------------------------------------------------------------------------
// markdown/blanks-around-tables — blank lines before/after tables
// ---------------------------------------------------------------------------
fn checkBlanksAroundTables(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var in_table = false;
    var prev_blank = true;
    var table_end_line: u32 = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        const is_blank = std.mem.trim(u8, line, " \t\r").len == 0;
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            if (in_table) {
                in_table = false;
                table_end_line = line_no - 1;
            }
            prev_blank = false;
            continue;
        }
        if (in_fence) {
            prev_blank = false;
            continue;
        }
        const is_table_row = isTableRow(t);
        if (is_table_row and !in_table) {
            // Table start
            in_table = true;
            if (!prev_blank and line_no > fm + 1) {
                if (!directives_mod.isSuppressed("markdown/blanks-around-tables", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-tables", .message = "Expected blank line before table", .severity = sev });
                }
            }
        } else if (!is_table_row and in_table) {
            // Table end
            in_table = false;
            table_end_line = line_no - 1;
            if (!is_blank) {
                if (!directives_mod.isSuppressed("markdown/blanks-around-tables", table_end_line, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-tables", .message = "Expected blank line after table", .severity = sev });
                }
            }
        }
        prev_blank = is_blank;
    }
}

// ---------------------------------------------------------------------------
// markdown/table-column-count — consistent column counts in tables
// ---------------------------------------------------------------------------
fn checkTableColumnCount(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var in_table = false;
    var expected_cols: usize = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        if (isTableRow(t)) {
            const cols = countTableColumns(t);
            if (!in_table) {
                in_table = true;
                expected_cols = cols;
            } else if (cols != expected_cols) {
                if (!directives_mod.isSuppressed("markdown/table-column-count", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/table-column-count", .message = "Inconsistent table column count", .severity = sev });
                }
            }
        } else {
            in_table = false;
            expected_cols = 0;
        }
    }
}

fn countTableColumns(row: []const u8) usize {
    const trimmed = std.mem.trim(u8, row, " \t\r|");
    if (trimmed.len == 0) return 0;
    var cols: usize = 1;
    for (trimmed) |ch| {
        if (ch == '|') cols += 1;
    }
    return cols;
}

// ---------------------------------------------------------------------------
// markdown/ul-indent — unordered list indentation
// ---------------------------------------------------------------------------
fn checkUlIndent(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Check unordered list items
        if (t.len >= 2 and (t[0] == '-' or t[0] == '*' or t[0] == '+') and t[1] == ' ') {
            const indent = line.len - t.len;
            if (indent > 0 and indent % 2 != 0) {
                if (!directives_mod.isSuppressed("markdown/ul-indent", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/ul-indent", .message = "Unexpected unordered list indentation (expected multiple of 2)", .severity = sev });
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// markdown/blanks-around-lists — blank lines before/after lists
// ---------------------------------------------------------------------------
fn checkBlanksAroundLists(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    var in_list = false;
    var prev_blank = true;
    var list_end_line: u32 = 0;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        const is_blank = std.mem.trim(u8, line, " \t\r").len == 0;
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            in_list = false;
            prev_blank = false;
            continue;
        }
        if (in_fence) {
            prev_blank = false;
            continue;
        }
        const is_list = isListItem(t);
        // Also consider indented continuation lines as part of list
        const is_list_content = is_list or (in_list and !is_blank and (std.mem.startsWith(u8, line, "  ") or std.mem.startsWith(u8, line, "\t")));
        if (is_list_content and !in_list) {
            // List start
            in_list = true;
            if (!prev_blank and line_no > fm + 1) {
                if (!directives_mod.isSuppressed("markdown/blanks-around-lists", line_no, sup)) {
                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-lists", .message = "Expected blank line before list", .severity = sev });
                }
            }
        } else if (!is_list_content and in_list and !is_blank) {
            // List ended at previous non-blank, and this line follows without blank
            in_list = false;
            list_end_line = line_no - 1;
            if (!directives_mod.isSuppressed("markdown/blanks-around-lists", list_end_line, sup)) {
                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = 1, .rule_id = "markdown/blanks-around-lists", .message = "Expected blank line after list", .severity = sev });
            }
        } else if (is_blank and in_list) {
            in_list = false;
        }
        prev_blank = is_blank;
    }
}

// ---------------------------------------------------------------------------
// markdown/reference-links-images — undefined reference links
// ---------------------------------------------------------------------------
fn checkReferenceLinksImages(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // First pass: collect all reference definitions
    var definitions: [512][]const u8 = undefined;
    var def_count: usize = 0;

    var it = LineIter{ .content = md };
    var in_fence = false;
    while (it.next()) |line| {
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Match [label]: url
        if (t.len > 2 and t[0] == '[') {
            if (std.mem.indexOf(u8, t, "]:")) |close| {
                if (close > 1 and def_count < 512) {
                    definitions[def_count] = toLowerAscii(t[1..close]);
                    def_count += 1;
                }
            }
        }
    }

    // Second pass: find reference links and check definitions
    it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    in_fence = false;
    var in_html_comment = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;

        // Track HTML comments (multi-line)
        if (std.mem.indexOf(u8, line, "<!--") != null) in_html_comment = true;
        if (std.mem.indexOf(u8, line, "-->") != null) {
            in_html_comment = false;
            continue;
        }
        if (in_html_comment) continue;

        // Skip reference definitions themselves
        if (t.len > 2 and t[0] == '[' and std.mem.indexOf(u8, t, "]:") != null) continue;

        // Find reference links: [text][label] or [text] (shortcut)
        var i: usize = 0;
        while (i < line.len) {
            // Skip inline code spans
            if (line[i] == '`') {
                const cs = i + 1;
                if (std.mem.indexOfScalarPos(u8, line, cs, '`')) |ce| {
                    i = ce + 1;
                    continue;
                }
            }
            if (line[i] == '[') {
                // Find closing ]
                if (std.mem.indexOfScalarPos(u8, line, i + 1, ']')) |close1| {
                    // Check for [text][label]
                    if (close1 + 1 < line.len and line[close1 + 1] == '[') {
                        if (std.mem.indexOfScalarPos(u8, line, close1 + 2, ']')) |close2| {
                            const label = toLowerAscii(line[close1 + 2 .. close2]);
                            if (label.len > 0 and !isDefinedRef(label, definitions[0..def_count])) {
                                if (!directives_mod.isSuppressed("markdown/reference-links-images", line_no, sup)) {
                                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/reference-links-images", .message = "Undefined reference link/image", .severity = sev });
                                }
                            }
                            i = close2 + 1;
                            continue;
                        }
                    }

                    // Not followed by ( (inline link) — check as reference
                    if (close1 + 1 >= line.len or line[close1 + 1] != '(') {
                        const label_text = line[i + 1 .. close1];
                        const label = toLowerAscii(label_text);

                        // Skip checkbox patterns: [x], [ ], [X]
                        if (label.len == 1 and (label[0] == 'x' or label[0] == ' ')) {
                            i = close1 + 1;
                            continue;
                        }

                        if (label.len > 0 and !isDefinedRef(label, definitions[0..def_count])) {
                            if (!directives_mod.isSuppressed("markdown/reference-links-images", line_no, sup)) {
                                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/reference-links-images", .message = "Undefined reference link/image", .severity = sev });
                            }
                        }
                    }
                    i = close1 + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
    }
}

fn toLowerAscii(s: []const u8) []const u8 {
    // Note: we can't modify const slices in-place, but for comparison
    // we just do case-insensitive comparison in isDefinedRef
    return s;
}

fn isDefinedRef(label: []const u8, defs: []const []const u8) bool {
    for (defs) |def| {
        if (eqlIgnoreCase(label, def)) return true;
    }
    return false;
}

fn eqlIgnoreCase(a: []const u8, b: []const u8) bool {
    if (a.len != b.len) return false;
    for (a, b) |ca, cb| {
        const la = if (ca >= 'A' and ca <= 'Z') ca + 32 else ca;
        const lb = if (cb >= 'A' and cb <= 'Z') cb + 32 else cb;
        if (la != lb) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// markdown/link-image-style — enforce inline link style
// ---------------------------------------------------------------------------
fn checkLinkImageStyle(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    // Default: inline style. Flag reference-style links.
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Skip reference definitions
        if (t.len > 2 and t[0] == '[' and std.mem.indexOf(u8, t, "]:") != null) continue;
        // Find reference-style links: [text][label]
        var i: usize = 0;
        while (i < line.len) {
            if (line[i] == '[') {
                if (std.mem.indexOfScalarPos(u8, line, i + 1, ']')) |close1| {
                    if (close1 + 1 < line.len and line[close1 + 1] == '[') {
                        if (std.mem.indexOfScalarPos(u8, line, close1 + 2, ']')) |_| {
                            if (!directives_mod.isSuppressed("markdown/link-image-style", line_no, sup)) {
                                try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/link-image-style", .message = "Expected inline link style, found reference style", .severity = sev });
                            }
                        }
                    }
                    i = close1 + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// markdown/descriptive-link-text — avoid generic link text
// ---------------------------------------------------------------------------
fn checkDescriptiveLinkText(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    const non_descriptive = [_][]const u8{ "click here", "here", "link", "read more", "more", "this" };
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Find inline links: [text](url)
        var i: usize = 0;
        while (i < line.len) {
            // Skip images
            if (i + 1 < line.len and line[i] == '!' and line[i + 1] == '[') {
                i += 1;
                continue;
            }
            if (line[i] == '[') {
                if (std.mem.indexOfScalarPos(u8, line, i + 1, ']')) |close| {
                    if (close + 1 < line.len and line[close + 1] == '(') {
                        const text = std.mem.trim(u8, line[i + 1 .. close], " \t");
                        for (non_descriptive) |nd| {
                            if (eqlIgnoreCase(text, nd)) {
                                if (!directives_mod.isSuppressed("markdown/descriptive-link-text", line_no, sup)) {
                                    try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/descriptive-link-text", .message = "Non-descriptive link text", .severity = sev });
                                }
                                break;
                            }
                        }
                    }
                    i = close + 1;
                } else {
                    i += 1;
                }
            } else {
                i += 1;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// markdown/no-alt-text — images must have alt text
// ---------------------------------------------------------------------------
fn checkNoAltText(fp: []const u8, md: []const u8, fm: u32, sev: Severity, sup: *const directives_mod.DisableDirectives, issues: *std.ArrayList(LintIssue), alloc: Allocator) !void {
    var it = LineIter{ .content = md };
    var line_no: u32 = fm + 1;
    var in_fence = false;
    while (it.next()) |line| {
        defer line_no += 1;
        const t = std.mem.trimStart(u8, line, " \t");
        if (isFenceStart(t)) {
            in_fence = !in_fence;
            continue;
        }
        if (in_fence) continue;
        // Find images: ![alt](url)
        var i: usize = 0;
        while (i + 1 < line.len) {
            if (line[i] == '!' and line[i + 1] == '[') {
                if (std.mem.indexOfScalarPos(u8, line, i + 2, ']')) |close| {
                    const alt = std.mem.trim(u8, line[i + 2 .. close], " \t");
                    if (alt.len == 0) {
                        if (!directives_mod.isSuppressed("markdown/no-alt-text", line_no, sup)) {
                            try issues.append(alloc, .{ .file_path = fp, .line = line_no, .column = @intCast(i + 1), .rule_id = "markdown/no-alt-text", .message = "Image should have alternate text (alt text)", .severity = sev });
                        }
                    }
                    i = close + 1;
                } else {
                    i += 2;
                }
            } else {
                i += 1;
            }
        }
    }
}

fn isTagNameChar(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9');
}

fn isListItem(t: []const u8) bool {
    if (t.len >= 2) {
        if ((t[0] == '-' or t[0] == '*' or t[0] == '+') and t[1] == ' ') return true;
        // Ordered: 1. text
        if (t[0] >= '0' and t[0] <= '9') {
            if (std.mem.indexOfScalar(u8, t[0..@min(t.len, 10)], '.')) |dot| {
                if (dot + 1 < t.len and t[dot + 1] == ' ') return true;
            }
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "no-multiple-space-atx" {
    const alloc = std.testing.allocator;
    var issues = std.ArrayList(LintIssue){};
    defer issues.deinit(alloc);
    var sup = try directives_mod.parseDisableDirectives("", alloc);
    defer sup.deinit(alloc);
    try checkNoMultipleSpaceAtx("test.md", "##  Bad heading\n# Good heading\n", 0, .@"error", &sup, &issues, alloc);
    try std.testing.expect(issues.items.len == 1);
}

test "no-empty-links" {
    const alloc = std.testing.allocator;
    var issues = std.ArrayList(LintIssue){};
    defer issues.deinit(alloc);
    var sup = try directives_mod.parseDisableDirectives("", alloc);
    defer sup.deinit(alloc);
    try checkNoEmptyLinks("test.md", "[text]()\n[text](url)\n", 0, .@"error", &sup, &issues, alloc);
    try std.testing.expect(issues.items.len == 1);
}
