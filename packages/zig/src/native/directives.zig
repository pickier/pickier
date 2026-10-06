//! Disable directives and comment-only lines, as the TypeScript linter
//! computes them: `parseDisableDirectives`, `isSuppressed` (with
//! `matchesRule`) and `getCommentLines` in packages/pickier/src/linter.ts.
//!
//! Each directive regex is matched by hand; the comments give the regex and
//! the reasoning where backtracking decides the result.

const std = @import("std");
const text = @import("text.zig");
const lex = @import("builtin_lex.zig");

const Allocator = std.mem.Allocator;

/// A set of rule patterns as written in a directive. Order and duplicates do
/// not matter to `matchesRule`.
pub const RuleList = []const []const u8;

const wildcard: RuleList = &.{"*"};

const LineRules = struct { line: u32, rules: RuleList };
const Range = struct { line: u32, enable: bool, rules: RuleList };

pub const DisableDirectives = struct {
    /// disable-next-line targets, by ascending line
    next_line: []const LineRules = &.{},
    /// Rules disabled for the whole file (a block disable on line 1)
    file_level: RuleList = &.{},
    /// Range disables and enables, by ascending line (at most one per line)
    ranges: []const Range = &.{},
};

/// `\s*` then `eslint` or `pickier`: the rest after the tool name.
fn afterToolName(s: []const u8) ?[]const u8 {
    var i: usize = 0;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) break;
        i += n;
    }
    const rest = s[i..];
    if (std.mem.startsWith(u8, rest, "eslint")) return rest[6..];
    if (std.mem.startsWith(u8, rest, "pickier")) return rest[7..];
    return null;
}

/// A JavaScript line terminator - what `.` does not match - at `s[i]`.
fn isLineTerminatorAt(s: []const u8, i: usize) bool {
    const c = s[i];
    if (c == '\n' or c == '\r') return true;
    // U+2028 and U+2029: E2 80 A8 / E2 80 A9
    return c == 0xE2 and i + 2 < s.len and s[i + 1] == 0x80 and (s[i + 2] == 0xA8 or s[i + 2] == 0xA9);
}

fn hasLineTerminator(s: []const u8) bool {
    for (0..s.len) |i| {
        if (isLineTerminatorAt(s, i)) return true;
    }
    return false;
}

const Match = union(enum) { none, no_group, group: []const u8 };

/// `(?:\s+(\S.*))?$` at the start of `tail`.
///
/// `\s+` can only end where the whitespace run ends (`\S` must follow), so
/// the group is everything after the leading whitespace, and `.*$` needs it
/// free of line terminators.
fn matchRestOfLine(tail: []const u8) Match {
    if (tail.len == 0) return .no_group;
    var w: usize = 0;
    while (w < tail.len) {
        const n = text.whitespaceLenAt(tail, w);
        if (n == 0) break;
        w += n;
    }
    if (w == 0 or w == tail.len) return .none;
    const group = tail[w..];
    if (hasLineTerminator(group)) return .none;
    return .{ .group = group };
}

/// `(?:\s+([^*]+))?\s*\*\/` at the start of `tail`.
///
/// With S the first `*`: either alternative needs `*/` at S (no other `*`
/// is reachable). Then whitespace-only text before S matches with an empty
/// or absent group - both mean "all rules" - and other text matches with the
/// group only when it starts with whitespace. The trimmed group is the
/// trimmed text before S either way.
fn matchBlockRest(tail: []const u8) Match {
    const star = std.mem.indexOfScalar(u8, tail, '*') orelse return .none;
    if (star + 1 >= tail.len or tail[star + 1] != '/') return .none;
    const before = tail[0..star];
    const trimmed = text.trim(before);
    if (trimmed.len == 0) return .no_group;
    if (text.whitespaceLenAt(tail, 0) == 0) return .none;
    return .{ .group = trimmed };
}

/// `s.replace(/\s+--\s.*$/, '')`: cut at the first whitespace run followed
/// by `--`, one whitespace character and no line terminator after it.
fn stripDashComment(s: []const u8) []const u8 {
    var i: usize = 0;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) {
            i += 1;
            continue;
        }
        const run_start = i;
        var q = i;
        while (q < s.len) {
            const m = text.whitespaceLenAt(s, q);
            if (m == 0) break;
            q += m;
        }
        if (std.mem.startsWith(u8, s[q..], "--") and q + 2 < s.len) {
            const ws = text.whitespaceLenAt(s, q + 2);
            if (ws > 0 and !hasLineTerminator(s[q + 2 + ws ..])) return s[0..run_start];
        }
        i = q;
    }
    return s;
}

/// `list.split(',').map(s => s.trim()).filter(Boolean)`
fn splitRules(allocator: Allocator, list: []const u8) !RuleList {
    var out: std.ArrayList([]const u8) = .empty;
    var it = std.mem.splitScalar(u8, list, ',');
    while (it.next()) |part| {
        const t = text.trim(part);
        if (t.len > 0) try out.append(allocator, t);
    }
    return out.items;
}

/// `parseDisableDirectives`. The rule names are slices of `content`.
pub fn parseDisableDirectives(content: []const u8, allocator: Allocator) !DisableDirectives {
    // Every directive names `-disable` or `-enable`
    if (std.mem.indexOf(u8, content, "-disable") == null and std.mem.indexOf(u8, content, "-enable") == null) return .{};

    var next_line: std.ArrayList(LineRules) = .empty;
    var ranges: std.ArrayList(Range) = .empty;
    var file_level: RuleList = &.{};

    var it = lex.lines(content);
    var line_no: u32 = 0;
    while (it.next()) |line| {
        line_no += 1;
        const t = text.trim(line);
        if (t.len < 2 or t[0] != '/') continue;

        if (t[1] == '/') {
            const rest = afterToolName(t[2..]) orelse continue;
            // /^\/\/\s*(?:eslint|pickier)-disable-next-line(?:\s+(\S.*))?$/
            if (std.mem.startsWith(u8, rest, "-disable-next-line")) {
                switch (matchRestOfLine(rest["-disable-next-line".len..])) {
                    .none => {},
                    .no_group => {
                        try next_line.append(allocator, .{ .line = line_no + 1, .rules = wildcard });
                        continue;
                    },
                    .group => |g| {
                        const rule_text = stripDashComment(g);
                        const list = if (rule_text.len > 0) try splitRules(allocator, rule_text) else wildcard;
                        if (list.len > 0) try next_line.append(allocator, .{ .line = line_no + 1, .rules = list });
                        continue;
                    },
                }
            }
            // /^\/\/\s*(?:eslint|pickier)-disable(?:\s+(\S.*))?$/
            if (std.mem.startsWith(u8, rest, "-disable")) {
                const m = matchRestOfLine(rest["-disable".len..]);
                if (m != .none) {
                    const rule_list = if (m == .group) stripDashComment(text.trim(m.group)) else "";
                    const list = if (rule_list.len == 0) wildcard else try splitRules(allocator, rule_list);
                    try ranges.append(allocator, .{ .line = line_no, .enable = false, .rules = list });
                    continue;
                }
            }
            // /^\/\/\s*(?:eslint|pickier)-enable(?:\s+(\S.*))?$/
            if (std.mem.startsWith(u8, rest, "-enable")) {
                const m = matchRestOfLine(rest["-enable".len..]);
                if (m != .none) {
                    const rule_list = if (m == .group) text.trim(m.group) else "";
                    const list = if (rule_list.len == 0) wildcard else try splitRules(allocator, rule_list);
                    try ranges.append(allocator, .{ .line = line_no, .enable = true, .rules = list });
                    continue;
                }
            }
        } else if (t[1] == '*') {
            const rest = afterToolName(t[2..]) orelse continue;
            // /^\/\*\s*(?:eslint|pickier)-disable(?:\s+([^*]+))?\s*\*\//
            if (std.mem.startsWith(u8, rest, "-disable")) {
                const m = matchBlockRest(rest["-disable".len..]);
                if (m != .none) {
                    const rule_list = if (m == .group) stripDashComment(m.group) else "";
                    const list = if (rule_list.len == 0) wildcard else try splitRules(allocator, rule_list);
                    try ranges.append(allocator, .{ .line = line_no, .enable = false, .rules = list });
                    // On line 1 it is also file-level
                    if (line_no == 1) file_level = list;
                    continue;
                }
            }
            // /^\/\*\s*(?:eslint|pickier)-enable(?:\s+([^*]+))?\s*\*\//
            if (std.mem.startsWith(u8, rest, "-enable")) {
                const m = matchBlockRest(rest["-enable".len..]);
                if (m != .none) {
                    const list = if (m == .group) try splitRules(allocator, m.group) else wildcard;
                    try ranges.append(allocator, .{ .line = line_no, .enable = true, .rules = list });
                    continue;
                }
            }
        }
    }
    return .{ .next_line = next_line.items, .file_level = file_level, .ranges = ranges.items };
}

/// `camelToKebab(id) === pat`: `id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()`
fn eqCamelToKebab(pat: []const u8, id: []const u8) bool {
    var p: usize = 0;
    var i: usize = 0;
    while (i < id.len) {
        if (i + 1 < id.len and std.ascii.isLower(id[i]) and std.ascii.isUpper(id[i + 1])) {
            if (p + 3 > pat.len) return false;
            if (pat[p] != id[i] or pat[p + 1] != '-' or pat[p + 2] != std.ascii.toLower(id[i + 1])) return false;
            p += 3;
            i += 2;
            continue;
        }
        if (p >= pat.len or pat[p] != std.ascii.toLower(id[i])) return false;
        p += 1;
        i += 1;
    }
    return p == pat.len;
}

/// `kebabToCamel(id) === pat`: `id.replace(/-([a-z])/g, c => c.toUpperCase())`
fn eqKebabToCamel(pat: []const u8, id: []const u8) bool {
    var p: usize = 0;
    var i: usize = 0;
    while (i < id.len) {
        if (id[i] == '-' and i + 1 < id.len and std.ascii.isLower(id[i + 1])) {
            if (p >= pat.len or pat[p] != std.ascii.toUpper(id[i + 1])) return false;
            p += 1;
            i += 2;
            continue;
        }
        if (p >= pat.len or pat[p] != id[i]) return false;
        p += 1;
        i += 1;
    }
    return p == pat.len;
}

/// `matchesRule`
pub fn matchesRule(rule_id: []const u8, rules: RuleList) bool {
    if (rules.len == 0) return false;
    for (rules) |pat| {
        if (std.mem.eql(u8, pat, "*")) return true;
    }
    for (rules) |pat| {
        if (std.mem.eql(u8, pat, rule_id)) return true;
    }
    for (rules) |pat| {
        if (eqCamelToKebab(pat, rule_id) or eqKebabToCamel(pat, rule_id)) return true;
    }
    // A bare plugin rule name matches the id's suffix after '/'
    for (rules) |pat| {
        if (std.mem.indexOfScalar(u8, pat, '/') != null) continue;
        if (rule_id.len > pat.len and std.mem.endsWith(u8, rule_id, pat) and rule_id[rule_id.len - pat.len - 1] == '/') return true;
    }
    // And the other way round: a bare id matches a plugin-prefixed name for it
    if (std.mem.indexOfScalar(u8, rule_id, '/') == null) {
        for (rules) |pat| {
            if (pat.len > rule_id.len and std.mem.endsWith(u8, pat, rule_id) and pat[pat.len - rule_id.len - 1] == '/') return true;
        }
    }
    return false;
}

/// `isSuppressed`
pub fn isSuppressed(rule_id: []const u8, line: u32, d: *const DisableDirectives) bool {
    if (d.file_level.len > 0 and matchesRule(rule_id, d.file_level)) return true;

    if (d.next_line.len > 0) {
        var lo: usize = 0;
        var hi: usize = d.next_line.len;
        while (lo < hi) {
            const mid = (lo + hi) / 2;
            if (d.next_line[mid].line < line) lo = mid + 1 else hi = mid;
        }
        if (lo < d.next_line.len and d.next_line[lo].line == line and matchesRule(rule_id, d.next_line[lo].rules)) return true;
    }

    // Ranges evaluated per rule, in line order, up to the line before
    var disabled = false;
    for (d.ranges) |r| {
        if (r.line >= line) break;
        if (matchesRule(rule_id, r.rules)) disabled = !r.enable;
    }
    return disabled;
}

/// `/\b(?:return|case|typeof|void|in|of|new|throw|delete)$/` on the text
/// ending at `end`. TypeScript tests a 7-character window, which always
/// holds the character before a keyword of at most 6, so a full lookbehind
/// gives the same answer.
fn endsWithCommentKeyword(content: []const u8, end: usize) bool {
    const s = content[0..end];
    const keywords = [_][]const u8{ "return", "case", "typeof", "void", "in", "of", "new", "throw", "delete" };
    for (keywords) |kw| {
        if (std.mem.endsWith(u8, s, kw)) {
            const at = s.len - kw.len;
            if (at == 0 or !text.isWordByte(s[at - 1])) return true;
        }
    }
    return false;
}

/// `/[gimsuy]/`
fn isCommentRegexFlag(c: u8) bool {
    return switch (c) {
        'g', 'i', 'm', 's', 'u', 'y' => true,
        else => false,
    };
}

const CommentState = enum { code, string_single, string_double, string_template, line_comment, block_comment };

/// `getCommentLines`: the 1-based lines that hold only comments.
pub fn getCommentLines(content: []const u8, allocator: Allocator) !std.AutoHashMap(u32, void) {
    var comment_lines = std.AutoHashMap(u32, void).init(allocator);
    if (std.mem.indexOfScalar(u8, content, '/') == null) return comment_lines;

    var state: CommentState = .code;
    var line_no: u32 = 1;
    var line_has_code = false;
    var line_saw_comment = false;
    var line_started_in_block = false;
    // Brace depth inside each open `${ ... }` interpolation
    var interp: std.ArrayList(u32) = .empty;
    const len = content.len;

    var i: usize = 0;
    while (i < len) : (i += 1) {
        const ch = content[i];
        const next: ?u8 = if (i + 1 < len) content[i + 1] else null;

        if (ch == '\n') {
            if (isCommentLine(line_started_in_block, line_has_code, line_saw_comment, state))
                try comment_lines.put(line_no, {});
            line_no += 1;
            line_has_code = false;
            line_saw_comment = false;
            line_started_in_block = state == .block_comment;
            if (state == .line_comment) state = .code;
            continue;
        }

        switch (state) {
            .code => {
                if (ch == '/' and next == '/') {
                    state = .line_comment;
                    line_saw_comment = true;
                    i += 1;
                } else if (ch == '/' and next == '*') {
                    // A `/*` after an operator starts a regex such as /*/
                    var is_regex = false;
                    if (i > 0) {
                        var k = i - 1;
                        while (k > 0 and (content[k] == ' ' or content[k] == '\t')) k -= 1;
                        const bc = content[k];
                        if (std.mem.indexOfScalar(u8, "=([{,;!&|?:~^%+-", bc) != null) {
                            is_regex = true;
                        } else if (bc >= 'a' and bc <= 'z') {
                            if (endsWithCommentKeyword(content, k + 1)) is_regex = true;
                        }
                    }
                    if (is_regex) {
                        line_has_code = true;
                        i = skipRegex(content, i + 1);
                    } else {
                        line_saw_comment = true;
                        state = .block_comment;
                        i += 1;
                    }
                } else if (ch == '/' and next != null) {
                    var is_regex = false;
                    if (i > 0) {
                        var k = i - 1;
                        while (k > 0 and (content[k] == ' ' or content[k] == '\t')) k -= 1;
                        const bc = content[k];
                        if (std.mem.indexOfScalar(u8, "=([{,;!&|?:~^%+-", bc) != null or bc == '\n') {
                            is_regex = true;
                        } else if (bc >= 'a' and bc <= 'z') {
                            if (endsWithCommentKeyword(content, k + 1)) is_regex = true;
                        }
                    }
                    line_has_code = true;
                    if (is_regex) i = skipRegex(content, i + 1);
                } else if (ch == '\'') {
                    state = .string_single;
                    line_has_code = true;
                } else if (ch == '"') {
                    state = .string_double;
                    line_has_code = true;
                } else if (ch == '`') {
                    state = .string_template;
                    line_has_code = true;
                } else if (ch == '{') {
                    if (interp.items.len > 0) interp.items[interp.items.len - 1] += 1;
                    line_has_code = true;
                } else if (ch == '}') {
                    // At depth 0 it closes the interpolation
                    if (interp.items.len > 0) {
                        if (interp.items[interp.items.len - 1] == 0) {
                            _ = interp.pop();
                            state = .string_template;
                        } else {
                            interp.items[interp.items.len - 1] -= 1;
                        }
                    }
                    line_has_code = true;
                } else if (ch < 0x80) {
                    if (!text.isAsciiSpace(ch)) line_has_code = true;
                } else {
                    // Not whitespace as `/\s/` has it, a whole character at a time
                    if (text.whitespaceLenAt(content, i) == 0) line_has_code = true;
                    i += lex.charLen(content, i) - 1;
                }
            },
            .string_single => {
                if (ch == '\\') {
                    i += 1;
                } else if (ch == '\'') {
                    state = .code;
                }
            },
            .string_double => {
                if (ch == '\\') {
                    i += 1;
                } else if (ch == '"') {
                    state = .code;
                }
            },
            .string_template => {
                if (ch == '\\') {
                    i += 1;
                } else if (ch == '$' and next == '{') {
                    // Its contents are code
                    try interp.append(allocator, 0);
                    state = .code;
                    i += 1;
                } else if (ch == '`') {
                    state = .code;
                }
            },
            .line_comment => {},
            .block_comment => {
                if (ch == '*' and next == '/') {
                    state = .code;
                    i += 1;
                }
            },
        }
    }

    if (isCommentLine(line_started_in_block, line_has_code, line_saw_comment, state))
        try comment_lines.put(line_no, {});
    return comment_lines;
}

fn isCommentLine(started_in_block: bool, has_code: bool, saw_comment: bool, state: CommentState) bool {
    if (started_in_block and state == .block_comment) return true;
    if (!has_code and saw_comment and state != .block_comment) return true;
    return !has_code and state == .block_comment;
}

/// The regex skip of `getCommentLines`, from `i` (the character after the
/// opening `/`): to just past the closing `/` and its flags, or to the
/// newline of an unterminated one. Returns the index before the next
/// character to look at, for the caller's loop increment.
fn skipRegex(content: []const u8, start: usize) usize {
    var i = start;
    while (i < content.len) {
        const c = content[i];
        if (c == '\\') {
            i += 2;
            continue;
        }
        if (c == '/') {
            i += 1;
            break;
        }
        if (c == '\n') break;
        i += 1;
    }
    while (i < content.len and isCommentRegexFlag(content[i])) i += 1;
    return i - 1;
}

test "directives" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const src =
        \\/* eslint-disable no-console */
        \\// eslint-disable-next-line quotes, style/indent -- why
        \\x
        \\// pickier-disable prefer-const
        \\y
        \\// eslint-enable
        \\z
    ;
    const d = try parseDisableDirectives(src, a);
    try std.testing.expect(isSuppressed("no-console", 1, &d));
    try std.testing.expect(isSuppressed("noConsole", 7, &d));
    try std.testing.expect(isSuppressed("quotes", 3, &d));
    // A plugin-prefixed name covers the bare id, and a bare name the prefixed one
    try std.testing.expect(isSuppressed("indent", 3, &d));
    try std.testing.expect(isSuppressed("style/indent", 3, &d));
    try std.testing.expect(!isSuppressed("other/indent", 3, &d));
    try std.testing.expect(!isSuppressed("dent", 3, &d));
    try std.testing.expect(isSuppressed("general/prefer-const", 5, &d));
    try std.testing.expect(!isSuppressed("general/prefer-const", 7, &d));
    try std.testing.expect(!isSuppressed("quotes", 4, &d));
}

test "comment lines" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const m = try getCommentLines("// a\nx = 1 // b\n/* c\n d */\n/* e */ y\nconst r = /*/\n", a);
    try std.testing.expect(m.contains(1));
    try std.testing.expect(!m.contains(2));
    try std.testing.expect(m.contains(3));
    // Closing a block comment does not make a comment line (as in TypeScript)
    try std.testing.expect(!m.contains(4));
    try std.testing.expect(!m.contains(5));
    try std.testing.expect(!m.contains(6));
}
