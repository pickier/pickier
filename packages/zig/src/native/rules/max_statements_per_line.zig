//! `style/max-statements-per-line` - port of
//! packages/pickier/src/rules/style/max-statements-per-line.ts
//!
//! Counts `;` outside strings, regex literals, `for (...)` headers and a
//! trailing `//` comment, one line at a time, as the TypeScript scanner does.
//! The rule reports under the bare id `max-statements-per-line`.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

/// `lastSignificant` when it holds a non-ASCII UTF-16 unit; null is `''`.
const other: u8 = 0x80;

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const max = maxOption(ctx.options);
    const lines = try text.splitLines(a, ctx.content);

    for (lines, 0..) |line, i| {
        // `/^\s*$/`
        if (text.trimStart(line).len == 0) continue;
        // Without a `;` the count is 1 however the line scans
        const num = if (std.mem.indexOfScalar(u8, line, ';') == null) 1 else countStatementsOnLine(line);
        if (@as(f64, @floatFromInt(num)) > max) {
            try out.append(a, .{
                .line = @intCast(i + 1),
                .column = 1,
                .rule_id = "max-statements-per-line",
                .message = try std.fmt.allocPrint(a, "This line has {d} statements. Maximum allowed is {f}", .{ num, JsNumber{ .value = max } }),
                .severity = .warning,
            });
        }
    }
}

/// `typeof options.max === 'number' ? options.max : 1`
fn maxOption(options: ?std.json.Value) f64 {
    const opts = options orelse return 1;
    if (opts != .object) return 1;
    const v = opts.object.get("max") orelse return 1;
    return switch (v) {
        .integer => |n| @floatFromInt(n),
        .float => |f| f,
        .number_string => |s| std.fmt.parseFloat(f64, s) catch 1,
        else => 1,
    };
}

/// A number as JavaScript's `${n}` prints it, for the values a config holds.
const JsNumber = struct {
    value: f64,

    pub fn format(self: JsNumber, w: *std.Io.Writer) std.Io.Writer.Error!void {
        const v = self.value;
        if (v == @trunc(v) and @abs(v) < 1e21) {
            try w.print("{d}", .{@as(i128, @intFromFloat(v))});
        } else {
            try w.print("{d}", .{v});
        }
    }
};

/// One UTF-16-aware step: the byte length of the character at `i`, and
/// whether it is two UTF-16 units (a surrogate pair).
const Unit = struct { len: usize, pair: bool };

fn unitAt(s: []const u8, i: usize) Unit {
    const b = s[i];
    if (b < 0x80) return .{ .len = 1, .pair = false };
    const len = std.unicode.utf8ByteSequenceLength(b) catch return .{ .len = 1, .pair = false };
    if (i + len > s.len) return .{ .len = 1, .pair = false };
    _ = std.unicode.utf8Decode(s[i .. i + len]) catch return .{ .len = 1, .pair = false };
    return .{ .len = len, .pair = len == 4 };
}

/// The character the scanners look at: the ASCII byte, or `other`.
/// After a backslash only the first UTF-16 unit is skipped, so an escaped
/// surrogate pair leaves its low half to be read as an ordinary character.
const Step = struct { ch: ?u8, next: usize };

fn step(s: []const u8, i: usize, escape: *bool) Step {
    const u = unitAt(s, i);
    const ch: u8 = if (s[i] < 0x80) s[i] else other;
    if (escape.*) {
        escape.* = false;
        return .{ .ch = if (u.pair) other else null, .next = i + u.len };
    }
    return .{ .ch = ch, .next = i + u.len };
}

fn isAsciiAlpha(c: u8) bool {
    return (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z');
}

/// Index after the regex flags that follow a closing `/` at `i`.
fn skipFlags(s: []const u8, i: usize) usize {
    var j = i + 1;
    while (j < s.len and isAsciiAlpha(s[j])) j += 1;
    return j;
}

fn countStatementsOnLine(line: []const u8) usize {
    const effective = if (findLineCommentStart(line)) |c| line[0..c] else line;
    var count_semis: usize = 0;
    var in_single = false;
    var in_double = false;
    var in_backtick = false;
    var in_regex = false;
    var in_regex_class = false;
    var escape = false;
    var in_for_header = false;
    var paren_depth: i64 = 0;
    var last: ?u8 = null;

    var i: usize = 0;
    while (i < effective.len) {
        const st = step(effective, i, &escape);
        i = st.next;
        const ch = st.ch orelse continue;
        if (ch == '\\') {
            escape = true;
            continue;
        }
        if (in_regex) {
            if (in_regex_class) {
                if (ch == ']') in_regex_class = false;
                continue;
            }
            if (ch == '[') {
                in_regex_class = true;
                continue;
            }
            if (ch == '/') {
                in_regex = false;
                i = skipFlags(effective, i - 1);
                last = '/';
            }
            continue;
        }
        if (!in_double and !in_backtick and ch == '\'') {
            in_single = !in_single;
            last = if (in_single) '\'' else 'x';
            continue;
        }
        if (!in_single and !in_backtick and ch == '"') {
            in_double = !in_double;
            last = if (in_double) '"' else 'x';
            continue;
        }
        if (!in_single and !in_double and ch == '`') {
            in_backtick = !in_backtick;
            last = if (in_backtick) '`' else 'x';
            continue;
        }
        if (in_single or in_double or in_backtick) continue;
        if (ch == '/' and isRegexContext(last, effective, i - 1)) {
            in_regex = true;
            continue;
        }
        if (!in_for_header) {
            const at = i - 1;
            if (ch == 'f' and std.mem.startsWith(u8, effective[at..], "for") and
                (at + 3 == effective.len or !text.isWordByte(effective[at + 3])))
            {
                const rest = text.trimStart(effective[at + 3 ..]);
                const offset = effective.len - rest.len;
                if (offset < effective.len and effective[offset] == '(') {
                    in_for_header = true;
                    paren_depth = 1;
                    i = offset + 1;
                    last = '(';
                    continue;
                }
            }
        } else {
            if (ch == '(') {
                paren_depth += 1;
            } else if (ch == ')') {
                paren_depth -= 1;
                if (paren_depth <= 0) in_for_header = false;
            } else if (ch == ';') {
                last = ch;
                continue;
            }
        }
        if (ch == ';') count_semis += 1;
        if (ch != ' ' and ch != '\t') last = ch;
    }
    if (count_semis == 0) return 1;
    const trimmed = text.trimEnd(effective);
    return if (std.mem.endsWith(u8, trimmed, ";")) count_semis else count_semis + 1;
}

/// The byte index of a `//` outside string and regex literals, if any.
fn findLineCommentStart(line: []const u8) ?usize {
    var in_single = false;
    var in_double = false;
    var in_backtick = false;
    var in_regex = false;
    var in_regex_class = false;
    var escape = false;
    var last: ?u8 = null;

    var i: usize = 0;
    while (i < line.len) {
        const at = i;
        const st = step(line, i, &escape);
        i = st.next;
        const ch = st.ch orelse continue;
        if (ch == '\\') {
            escape = true;
            continue;
        }
        if (in_regex) {
            if (in_regex_class) {
                if (ch == ']') in_regex_class = false;
                continue;
            }
            if (ch == '[') {
                in_regex_class = true;
                continue;
            }
            if (ch == '/') {
                in_regex = false;
                i = skipFlags(line, at);
                last = '/';
            }
            continue;
        }
        if (!in_double and !in_backtick and ch == '\'') {
            in_single = !in_single;
            last = ch;
            continue;
        }
        if (!in_single and !in_backtick and ch == '"') {
            in_double = !in_double;
            last = ch;
            continue;
        }
        if (!in_single and !in_double and ch == '`') {
            in_backtick = !in_backtick;
            last = ch;
            continue;
        }
        if (in_single or in_double or in_backtick) continue;
        if (ch == '/' and at + 1 < line.len and line[at + 1] == '/') return at;
        if (ch == '/' and isRegexContext(last, line, at)) {
            in_regex = true;
            continue;
        }
        if (ch != ' ' and ch != '\t') last = ch;
    }
    return null;
}

const expression_keywords = [_][]const u8{ "return", "typeof", "instanceof", "new", "delete", "void", "in", "of", "yield", "await", "throw", "case" };

fn isIdentStart(c: u8) bool {
    return isAsciiAlpha(c) or c == '_' or c == '$';
}

/// Whether a `/` at `idx` starts a regex literal, judged by the last
/// significant character before it.
fn isRegexContext(last: ?u8, effective: []const u8, idx: usize) bool {
    const c = last orelse return true;
    if (std.mem.indexOfScalar(u8, "([{,:;!?&|=<>~^+*%-", c) != null) return true;
    if (isIdentStart(c)) {
        // `/(?:^|[^A-Za-z0-9_$])(return|typeof|...|case)$/` on the trimmed prefix
        const prefix = text.trimEnd(effective[0..idx]);
        for (expression_keywords) |kw| {
            if (!std.mem.endsWith(u8, prefix, kw)) continue;
            const before = prefix.len - kw.len;
            if (before == 0 or !text.isIdentByte(prefix[before - 1])) return true;
        }
    }
    return false;
}
