//! Linting one file the way the TypeScript `lintFileForRun` does without
//! `--fix`: built-in scan, then each plugin rule in plan order, then the same
//! post-processing - help text, configured severity, disable directives,
//! comment-only lines, and dedupe by line, column and rule.

const std = @import("std");
const types = @import("types.zig");
const registry = @import("registry.zig");
const builtins = @import("builtins.zig");
const directives = @import("directives.zig");
const text = @import("text.zig");

const Issue = types.Issue;
const Allocator = std.mem.Allocator;

/// `/\.(?:ts|js|tsx|jsx|mts|mjs|cts|cjs)$/`: code files, as the TypeScript
/// linter decides which plugin rules and comment-line detection apply.
pub fn isCodePath(path: []const u8) bool {
    const exts = [_][]const u8{ ".ts", ".js", ".tsx", ".jsx", ".mts", ".mjs", ".cts", ".cjs" };
    for (exts) |e| {
        if (std.mem.endsWith(u8, path, e)) return true;
    }
    return false;
}

/// `shouldRunPlannedRule` for the plugins the native engine handles.
fn ruleApplies(rule_id: []const u8, path: []const u8) bool {
    const slash = std.mem.indexOfScalar(u8, rule_id, '/') orelse return true;
    const plugin = rule_id[0..slash];
    const code_only = [_][]const u8{ "node", "ts", "general", "quality", "eslint", "regexp", "unused-imports", "perfectionist" };
    for (code_only) |p| {
        if (std.mem.eql(u8, plugin, p)) return isCodePath(path);
    }
    return true;
}

/// `shouldSkipCommentOnlyPluginIssue`
fn skipOnCommentLine(rule_id: []const u8) bool {
    return !std.mem.eql(u8, rule_id, "spaced-comment") and !std.mem.endsWith(u8, rule_id, "/spaced-comment");
}

/// `ensureHelpText`: the help a rule did not give, from its plan id.
pub fn defaultHelp(allocator: Allocator, rule_id: []const u8) ![]const u8 {
    // `ruleId.split('/')[1]` when there is a slash
    var name = rule_id;
    if (std.mem.indexOfScalar(u8, rule_id, '/')) |first| {
        const rest = rule_id[first + 1 ..];
        name = rest[0 .. std.mem.indexOfScalar(u8, rest, '/') orelse rest.len];
    }
    if (std.mem.startsWith(u8, name, "no-")) {
        const what = try spaced(allocator, name, "no-");
        return std.fmt.allocPrint(allocator, "Remove or refactor this {s}. Check the rule documentation for more details or disable with: // eslint-disable-next-line {s}", .{ what, rule_id });
    }
    if (std.mem.startsWith(u8, name, "prefer-")) {
        const what = try spaced(allocator, name, "prefer-");
        return std.fmt.allocPrint(allocator, "Consider using {s} instead. This is a best practice recommendation. Disable with: // eslint-disable-next-line {s} if needed", .{ what, rule_id });
    }
    if (std.mem.indexOf(u8, name, "sort") != null or std.mem.indexOf(u8, name, "order") != null)
        return std.fmt.allocPrint(allocator, "Reorder these items according to the rule requirements, or use --fix to auto-sort. Disable with: // eslint-disable-next-line {s}", .{rule_id});
    if (std.mem.indexOf(u8, name, "indent") != null or std.mem.indexOf(u8, name, "spacing") != null or std.mem.indexOf(u8, name, "newline") != null)
        return std.fmt.allocPrint(allocator, "Fix the formatting issue. Run with --fix to automatically format. Disable with: // eslint-disable-next-line {s}", .{rule_id});
    return std.fmt.allocPrint(allocator, "Fix this issue or disable the rule with: // eslint-disable-next-line {s}. Check the rule documentation for more details", .{rule_id});
}

/// `name.replace(prefix, '').replace(/-/g, ' ')` - the first occurrence of
/// the prefix, which for these names is the leading one.
fn spaced(allocator: Allocator, name: []const u8, prefix: []const u8) ![]const u8 {
    const at = std.mem.indexOf(u8, name, prefix).?;
    const joined = try std.mem.concat(allocator, u8, &.{ name[0..at], name[at + prefix.len ..] });
    for (joined) |*c| {
        if (c.* == '-') c.* = ' ';
    }
    return joined;
}

const DedupeKey = struct { line: u32, column: u32, rule_id: []const u8 };

const DedupeContext = struct {
    pub fn hash(_: DedupeContext, k: DedupeKey) u64 {
        var h = std.hash.Wyhash.init(k.line);
        h.update(std.mem.asBytes(&k.column));
        h.update(k.rule_id);
        return h.final();
    }
    pub fn eql(_: DedupeContext, a: DedupeKey, b: DedupeKey) bool {
        return a.line == b.line and a.column == b.column and std.mem.eql(u8, a.rule_id, b.rule_id);
    }
};

/// The issues for one file, in the order the TypeScript linter reports them.
pub fn lintFile(allocator: Allocator, path: []const u8, content: []const u8, settings: *const types.Settings) ![]Issue {
    // A shell shebang brings in the shell plugin and changes the built-in
    // checks; the TypeScript linter handles that file instead.
    if (text.hasShellShebang(content)) return error.Declined;
    text.resetLineCache();
    var suppress = try directives.parseDisableDirectives(content, allocator);
    var comment_lines = if (isCodePath(path))
        try directives.getCommentLines(content, allocator)
    else
        std.AutoHashMap(u32, void).init(allocator);
    _ = &comment_lines;

    var issues: std.ArrayList(Issue) = .empty;
    try builtins.scan(allocator, path, content, settings, &suppress, &comment_lines, &issues);

    var raw: std.ArrayList(Issue) = .empty;
    for (settings.rules, 0..) |rule, rule_index| {
        if (!ruleApplies(rule.id, path)) continue;
        const check = registry.lookup(rule.id) orelse return error.UnsupportedRule;
        raw.clearRetainingCapacity();
        const ctx: types.RuleContext = .{
            .file_path = path,
            .content = content,
            .options = rule.options,
            .settings = settings,
            .allocator = allocator,
        };
        try check(&ctx, &raw);
        for (raw.items) |found| {
            var issue = found;
            issue.rule_index = @intCast(rule_index);
            if (issue.help == null or issue.help.?.len == 0)
                issue.help = try defaultHelp(allocator, rule.id);
            if (rule.severity) |sev| issue.severity = sev;
            if (directives.isSuppressed(issue.rule_id, issue.line, &suppress)) continue;
            if (comment_lines.get(issue.line) != null and skipOnCommentLine(issue.rule_id)) continue;
            try issues.append(allocator, issue);
        }
    }

    // Dedupe by line:column:ruleId, keeping the first
    var seen = std.HashMap(DedupeKey, void, DedupeContext, std.hash_map.default_max_load_percentage).init(allocator);
    try seen.ensureTotalCapacity(@intCast(issues.items.len));
    var kept: std.ArrayList(Issue) = .empty;
    try kept.ensureTotalCapacity(allocator, issues.items.len);
    for (issues.items) |issue| {
        const gop = seen.getOrPutAssumeCapacity(.{ .line = issue.line, .column = issue.column, .rule_id = issue.rule_id });
        if (gop.found_existing) continue;
        kept.appendAssumeCapacity(issue);
    }
    return kept.items;
}
