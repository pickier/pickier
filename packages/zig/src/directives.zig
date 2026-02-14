const std = @import("std");
const Allocator = std.mem.Allocator;

// ---------------------------------------------------------------------------
// ESLint-style disable directives parser
// Supports: eslint-disable-next-line, eslint-disable/enable, pickier- prefix
// ---------------------------------------------------------------------------

pub const DisableDirectives = struct {
    /// disable-next-line: target_line -> list of rule IDs
    next_line: std.AutoHashMap(u32, RuleSet),
    /// Rules disabled for the entire file (from line 1 directives)
    file_level: RuleSet,
    /// Range disables: line -> rules disabled from that line
    range_disable: std.AutoHashMap(u32, RuleSet),
    /// Range enables: line -> rules re-enabled at that line
    range_enable: std.AutoHashMap(u32, RuleSet),
    /// Pre-sorted disable line numbers for binary search
    sorted_disable_lines: []u32,
    /// Pre-sorted enable line numbers for binary search
    sorted_enable_lines: []u32,

    pub fn deinit(self: *DisableDirectives, allocator: Allocator) void {
        var it = self.next_line.iterator();
        while (it.next()) |entry| entry.value_ptr.deinit(allocator);
        self.next_line.deinit();

        self.file_level.deinit(allocator);

        var dit = self.range_disable.iterator();
        while (dit.next()) |entry| entry.value_ptr.deinit(allocator);
        self.range_disable.deinit();

        var eit = self.range_enable.iterator();
        while (eit.next()) |entry| entry.value_ptr.deinit(allocator);
        self.range_enable.deinit();

        allocator.free(self.sorted_disable_lines);
        allocator.free(self.sorted_enable_lines);
    }
};

/// A set of rule IDs (stored as slices into the original content)
pub const RuleSet = struct {
    rules: std.ArrayList([]const u8),
    has_wildcard: bool = false,

    pub fn init() RuleSet {
        return .{ .rules = .{} };
    }

    pub fn deinit(self: *RuleSet, allocator: Allocator) void {
        self.rules.deinit(allocator);
    }

    pub fn add(self: *RuleSet, allocator: Allocator, rule: []const u8) !void {
        if (std.mem.eql(u8, rule, "*")) {
            self.has_wildcard = true;
            return;
        }
        // Avoid duplicates
        for (self.rules.items) |existing| {
            if (std.mem.eql(u8, existing, rule)) return;
        }
        try self.rules.append(allocator, rule);
    }

    pub fn contains(self: *const RuleSet, rule_id: []const u8) bool {
        if (self.has_wildcard) return true;
        for (self.rules.items) |r| {
            if (std.mem.eql(u8, r, rule_id)) return true;
        }
        return false;
    }

    pub fn isEmpty(self: *const RuleSet) bool {
        return !self.has_wildcard and self.rules.items.len == 0;
    }
};

// ---------------------------------------------------------------------------
// Parse disable directives from file content
// ---------------------------------------------------------------------------

pub fn parseDisableDirectives(content: []const u8, allocator: Allocator) !DisableDirectives {
    var directives = DisableDirectives{
        .next_line = std.AutoHashMap(u32, RuleSet).init(allocator),
        .file_level = RuleSet.init(),
        .range_disable = std.AutoHashMap(u32, RuleSet).init(allocator),
        .range_enable = std.AutoHashMap(u32, RuleSet).init(allocator),
        .sorted_disable_lines = &.{},
        .sorted_enable_lines = &.{},
    };

    var line_no: u32 = 1;
    var pos: usize = 0;

    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = std.mem.trim(u8, content[pos..line_end], " \t\r");

        if (line.len > 2) {
            // Check for // eslint-disable-next-line or // pickier-disable-next-line
            if (parseLineComment(line, "disable-next-line")) |rule_list| {
                var set = RuleSet.init();
                try parseRuleList(rule_list, &set, allocator);
                try directives.next_line.put(line_no + 1, set);
            }
            // // eslint-disable or // pickier-disable (without -next-line)
            else if (parseLineComment(line, "disable")) |rule_list| {
                var set = RuleSet.init();
                if (rule_list.len > 0) {
                    try parseRuleList(rule_list, &set, allocator);
                } else {
                    set.has_wildcard = true;
                }
                try directives.range_disable.put(line_no, set);
                if (line_no == 1) {
                    // File-level disable
                    var file_set = RuleSet.init();
                    if (rule_list.len > 0) {
                        try parseRuleList(rule_list, &file_set, allocator);
                    } else {
                        file_set.has_wildcard = true;
                    }
                    directives.file_level = file_set;
                }
            }
            // // eslint-enable or // pickier-enable
            else if (parseLineComment(line, "enable")) |rule_list| {
                var set = RuleSet.init();
                if (rule_list.len > 0) {
                    try parseRuleList(rule_list, &set, allocator);
                } else {
                    set.has_wildcard = true;
                }
                try directives.range_enable.put(line_no, set);
            }
            // /* eslint-disable ... */
            else if (parseBlockComment(line, "disable")) |rule_list| {
                var set = RuleSet.init();
                if (rule_list.len > 0) {
                    try parseRuleList(rule_list, &set, allocator);
                } else {
                    set.has_wildcard = true;
                }
                try directives.range_disable.put(line_no, set);
                if (line_no == 1) {
                    var file_set = RuleSet.init();
                    if (rule_list.len > 0) {
                        try parseRuleList(rule_list, &file_set, allocator);
                    } else {
                        file_set.has_wildcard = true;
                    }
                    directives.file_level = file_set;
                }
            }
            // /* eslint-enable ... */
            else if (parseBlockComment(line, "enable")) |rule_list| {
                var set = RuleSet.init();
                if (rule_list.len > 0) {
                    try parseRuleList(rule_list, &set, allocator);
                } else {
                    set.has_wildcard = true;
                }
                try directives.range_enable.put(line_no, set);
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }

    // Sort disable/enable line numbers for binary search
    directives.sorted_disable_lines = try sortedKeys(&directives.range_disable, allocator);
    directives.sorted_enable_lines = try sortedKeys(&directives.range_enable, allocator);

    return directives;
}

/// Parse a line comment directive: // eslint-<action> or // pickier-<action>
fn parseLineComment(line: []const u8, comptime action: []const u8) ?[]const u8 {
    if (!std.mem.startsWith(u8, line, "//")) return null;
    const after_slashes = std.mem.trimStart(u8, line[2..], " ");

    // Try eslint- prefix
    const eslint_prefix = "eslint-" ++ action;
    const pickier_prefix = "pickier-" ++ action;

    if (std.mem.startsWith(u8, after_slashes, eslint_prefix)) {
        const rest = after_slashes[eslint_prefix.len..];
        if (rest.len == 0) return "";
        if (rest[0] == ' ') return std.mem.trimStart(u8, rest, " ");
        return null; // Must be followed by space or end
    }
    if (std.mem.startsWith(u8, after_slashes, pickier_prefix)) {
        const rest = after_slashes[pickier_prefix.len..];
        if (rest.len == 0) return "";
        if (rest[0] == ' ') return std.mem.trimStart(u8, rest, " ");
        return null;
    }
    return null;
}

/// Parse a block comment directive: /* eslint-<action> ... */
fn parseBlockComment(line: []const u8, comptime action: []const u8) ?[]const u8 {
    if (!std.mem.startsWith(u8, line, "/*")) return null;
    if (!std.mem.endsWith(u8, line, "*/")) return null;

    const inner = std.mem.trim(u8, line[2 .. line.len - 2], " ");

    const eslint_prefix = "eslint-" ++ action;
    const pickier_prefix = "pickier-" ++ action;

    if (std.mem.startsWith(u8, inner, eslint_prefix)) {
        const rest = inner[eslint_prefix.len..];
        if (rest.len == 0) return "";
        if (rest[0] == ' ') return std.mem.trim(u8, rest, " ");
        return null;
    }
    if (std.mem.startsWith(u8, inner, pickier_prefix)) {
        const rest = inner[pickier_prefix.len..];
        if (rest.len == 0) return "";
        if (rest[0] == ' ') return std.mem.trim(u8, rest, " ");
        return null;
    }
    return null;
}

/// Parse comma-separated rule list into a RuleSet
fn parseRuleList(rule_list: []const u8, set: *RuleSet, allocator: Allocator) !void {
    var iter = std.mem.splitScalar(u8, rule_list, ',');
    while (iter.next()) |raw| {
        const trimmed = std.mem.trim(u8, raw, " \t");
        if (trimmed.len > 0) {
            try set.add(allocator, trimmed);
        }
    }
}

/// Extract and sort keys from a HashMap
fn sortedKeys(map: *const std.AutoHashMap(u32, RuleSet), allocator: Allocator) ![]u32 {
    var keys = std.ArrayList(u32){};
    defer keys.deinit(allocator);

    var it = map.iterator();
    while (it.next()) |entry| {
        try keys.append(allocator, entry.key_ptr.*);
    }

    const slice = try keys.toOwnedSlice(allocator);
    std.mem.sort(u32, slice, {}, std.sort.asc(u32));
    return slice;
}

// ---------------------------------------------------------------------------
// Suppression check
// ---------------------------------------------------------------------------

/// Check if a rule is suppressed for a given line
pub fn isSuppressed(rule_id: []const u8, line: u32, d: *const DisableDirectives) bool {
    // 1. disable-next-line (highest priority)
    if (d.next_line.get(line)) |set| {
        if (matchesRule(rule_id, &set)) return true;
    }

    // 2. Range-based (binary search) — use <= by searching for values < line+1
    const last_disable = binarySearchLargestLessThan(d.sorted_disable_lines, line + 1);
    const last_enable = binarySearchLargestLessThan(d.sorted_enable_lines, line + 1);

    // If there's a disable and it's more recent than any enable, rule is suppressed
    if (last_disable != 0) {
        if (last_disable > last_enable) {
            if (d.range_disable.get(last_disable)) |set| {
                if (matchesRule(rule_id, &set)) return true;
            }
        }
    }

    // 3. File-level disable (only if no range enable has cancelled it)
    if (!d.file_level.isEmpty()) {
        if (matchesRule(rule_id, &d.file_level)) {
            // File-level disable is cancelled if a range-enable exists before this line
            if (last_enable == 0) return true;
            if (d.range_enable.get(last_enable)) |enable_set| {
                if (!matchesRule(rule_id, &enable_set)) return true;
            } else {
                return true;
            }
        }
    }

    return false;
}

/// Check if a rule matches any entry in a RuleSet
/// Supports exact match, camelCase<->kebab-case, and bare rule name matching
fn matchesRule(rule_id: []const u8, set: *const RuleSet) bool {
    if (set.has_wildcard) return true;

    for (set.rules.items) |pattern| {
        // Exact match
        if (std.mem.eql(u8, pattern, rule_id)) return true;

        // Check if pattern matches the bare rule name (after the plugin prefix)
        // e.g. pattern "no-debugger" matches rule_id "pickier/no-debugger"
        if (std.mem.indexOf(u8, pattern, "/") == null) {
            // Pattern has no slash — try matching as bare name
            if (std.mem.indexOf(u8, rule_id, "/")) |slash_pos| {
                if (std.mem.eql(u8, rule_id[slash_pos + 1 ..], pattern)) return true;
            }
        }

        // camelCase -> kebab-case equivalence
        // Simple heuristic: check if they're the same after normalization
        if (eqlCaseInsensitive(pattern, rule_id)) return true;
    }

    return false;
}

/// Check if two rule IDs are equivalent after camelCase<->kebab-case normalization
fn eqlCaseInsensitive(a: []const u8, b: []const u8) bool {
    // Convert both to a canonical form: lowercase with hyphens
    // "noDebugger" and "no-debugger" should match
    var ai: usize = 0;
    var bi: usize = 0;

    while (ai < a.len and bi < b.len) {
        var ac = a[ai];
        var bc = b[bi];

        // Skip hyphens in either
        if (ac == '-') {
            ai += 1;
            continue;
        }
        if (bc == '-') {
            bi += 1;
            continue;
        }

        // Lowercase both
        if (ac >= 'A' and ac <= 'Z') ac = ac + 32;
        if (bc >= 'A' and bc <= 'Z') bc = bc + 32;

        if (ac != bc) return false;
        ai += 1;
        bi += 1;
    }

    // Skip trailing hyphens
    while (ai < a.len and a[ai] == '-') ai += 1;
    while (bi < b.len and b[bi] == '-') bi += 1;

    return ai == a.len and bi == b.len;
}

/// Binary search for the largest value strictly less than target
/// Returns 0 if none found
fn binarySearchLargestLessThan(arr: []const u32, target: u32) u32 {
    if (arr.len == 0) return 0;

    var left: usize = 0;
    var right: usize = arr.len;
    var result: u32 = 0;

    while (left < right) {
        const mid = left + (right - left) / 2;
        if (arr[mid] < target) {
            result = arr[mid];
            left = mid + 1;
        } else {
            right = mid;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Comment line detection
// ---------------------------------------------------------------------------

/// Compute set of line numbers that are comment-only lines
pub fn getCommentLines(content: []const u8, allocator: Allocator) !std.AutoHashMap(u32, void) {
    var comment_lines = std.AutoHashMap(u32, void).init(allocator);

    const State = enum { code, string_single, string_double, string_template, line_comment, block_comment };
    var state: State = .code;
    var line_no: u32 = 1;
    var line_has_code = false;
    var line_had_comment = false;
    var line_started_in_block = false;
    var prev: u8 = 0;

    var i: usize = 0;
    while (i < content.len) : (i += 1) {
        const ch = content[i];

        if (ch == '\n') {
            // End of line — determine if comment-only
            const is_comment_only = !line_has_code and
                (state == .line_comment or state == .block_comment or
                line_started_in_block or line_had_comment);
            if (is_comment_only) {
                try comment_lines.put(line_no, {});
            }

            line_no += 1;
            line_has_code = false;
            line_had_comment = false;
            line_started_in_block = (state == .block_comment);
            if (state == .line_comment) state = .code;
            prev = ch;
            continue;
        }

        switch (state) {
            .code => {
                if (ch == '/' and i + 1 < content.len and content[i + 1] == '/') {
                    state = .line_comment;
                    line_had_comment = true;
                    i += 1; // skip next /
                } else if (ch == '/' and i + 1 < content.len and content[i + 1] == '*') {
                    state = .block_comment;
                    line_had_comment = true;
                    i += 1; // skip next *
                } else if (ch == '\'') {
                    state = .string_single;
                    line_has_code = true;
                } else if (ch == '"') {
                    state = .string_double;
                    line_has_code = true;
                } else if (ch == '`') {
                    state = .string_template;
                    line_has_code = true;
                } else if (ch != ' ' and ch != '\t' and ch != '\r') {
                    line_has_code = true;
                }
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
            .line_comment => {
                // Keep consuming until newline (handled above)
            },
            .block_comment => {
                if (ch == '/' and prev == '*') {
                    state = .code;
                }
            },
        }
        prev = ch;
    }

    // Handle last line
    const is_comment_only = !line_has_code and
        (state == .line_comment or state == .block_comment or
        line_started_in_block or line_had_comment);
    if (is_comment_only) {
        try comment_lines.put(line_no, {});
    }

    return comment_lines;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "parseDisableDirectives - next line" {
    const allocator = std.testing.allocator;
    const content = "// eslint-disable-next-line no-debugger\ndebugger\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(directives.next_line.get(2) != null);
    const set = directives.next_line.get(2).?;
    try std.testing.expect(set.contains("no-debugger"));
}

test "parseDisableDirectives - pickier prefix" {
    const allocator = std.testing.allocator;
    const content = "// pickier-disable-next-line no-console\nconsole.log('hi')\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(directives.next_line.get(2) != null);
    const set = directives.next_line.get(2).?;
    try std.testing.expect(set.contains("no-console"));
}

test "parseDisableDirectives - block disable/enable" {
    const allocator = std.testing.allocator;
    const content = "/* eslint-disable no-console */\nconsole.log('a')\n/* eslint-enable no-console */\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(directives.range_disable.get(1) != null);
    try std.testing.expect(directives.range_enable.get(3) != null);
}

test "isSuppressed - next line" {
    const allocator = std.testing.allocator;
    const content = "// eslint-disable-next-line no-debugger\ndebugger\nfoo\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(isSuppressed("no-debugger", 2, &directives));
    try std.testing.expect(!isSuppressed("no-debugger", 3, &directives));
    try std.testing.expect(!isSuppressed("no-console", 2, &directives));
}

test "isSuppressed - range" {
    const allocator = std.testing.allocator;
    const content = "/* eslint-disable no-console */\nconsole.log('a')\nconsole.log('b')\n/* eslint-enable no-console */\nconsole.log('c')\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(isSuppressed("no-console", 2, &directives));
    try std.testing.expect(isSuppressed("no-console", 3, &directives));
    try std.testing.expect(!isSuppressed("no-console", 5, &directives));
}

test "isSuppressed - wildcard" {
    const allocator = std.testing.allocator;
    const content = "/* eslint-disable */\nfoo\n/* eslint-enable */\n";
    var directives = try parseDisableDirectives(content, allocator);
    defer directives.deinit(allocator);

    try std.testing.expect(isSuppressed("any-rule", 2, &directives));
    try std.testing.expect(!isSuppressed("any-rule", 4, &directives));
}

test "matchesRule - bare name" {
    var set = RuleSet.init();
    defer set.deinit(std.testing.allocator);
    try set.add(std.testing.allocator, "no-debugger");

    try std.testing.expect(matchesRule("no-debugger", &set));
    try std.testing.expect(matchesRule("pickier/no-debugger", &set));
    try std.testing.expect(!matchesRule("no-console", &set));
}

test "eqlCaseInsensitive - camelCase vs kebab" {
    try std.testing.expect(eqlCaseInsensitive("noDebugger", "no-debugger"));
    try std.testing.expect(eqlCaseInsensitive("no-debugger", "noDebugger"));
    try std.testing.expect(eqlCaseInsensitive("noCondAssign", "no-cond-assign"));
    try std.testing.expect(!eqlCaseInsensitive("noDebugger", "no-console"));
}

test "getCommentLines" {
    const allocator = std.testing.allocator;
    const content = "// this is a comment\nconst x = 1\n/* block */\ncode()\n";
    var comment_lines = try getCommentLines(content, allocator);
    defer comment_lines.deinit();

    try std.testing.expect(comment_lines.get(1) != null); // line 1 is a comment
    try std.testing.expect(comment_lines.get(2) == null); // line 2 is code
    try std.testing.expect(comment_lines.get(3) != null); // line 3 is a block comment
    try std.testing.expect(comment_lines.get(4) == null); // line 4 is code
}

test "binarySearchLargestLessThan" {
    const arr = [_]u32{ 1, 5, 10, 15 };
    try std.testing.expect(binarySearchLargestLessThan(&arr, 7) == 5);
    try std.testing.expect(binarySearchLargestLessThan(&arr, 1) == 0);
    try std.testing.expect(binarySearchLargestLessThan(&arr, 20) == 15);
    try std.testing.expect(binarySearchLargestLessThan(&arr, 10) == 5);
}
