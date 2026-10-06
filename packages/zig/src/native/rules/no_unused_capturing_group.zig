//! `regexp/no-unused-capturing-group` - port of packages/pickier/src/rules/regexp/no-unused-capturing-group.ts
//!
//! A character scan that skips comments and string literals and reads a `/`
//! as a regex literal by the character (or keyword) before it. A literal
//! with capturing groups and no backreference is reported at its first
//! capturing `(` unless the rule's context heuristics say the captures are
//! used: `.exec` on the literal, an argument to `.match`/`.replace`/...,
//! or a `const`/`let`/`var` whose later uses go through such methods.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const re = @import("re_text.zig");

const rule_id = "regexp/no-unused-capturing-group";
const message = "Unused capturing group in regular expression; use non-capturing group (?:...) instead";

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const s = ctx.content;
    var lines: re.Lines = .{ .content = s };
    var usages = std.StringHashMap(Usage).init(ctx.allocator);
    var idx: usize = 0;
    while (idx < s.len) {
        const ch = s[idx];

        if (ch == '/' and idx + 1 < s.len and s[idx + 1] == '/') {
            idx = std.mem.indexOfScalarPos(u8, s, idx, '\n') orelse s.len;
            continue;
        }
        if (ch == '/' and idx + 1 < s.len and s[idx + 1] == '*') {
            idx += 2;
            while (idx + 1 < s.len and !(s[idx] == '*' and s[idx + 1] == '/')) idx += 1;
            idx += 2;
            continue;
        }
        if (ch == '\'' or ch == '"' or ch == '`') {
            idx += 1;
            while (idx < s.len) {
                if (s[idx] == '\\') {
                    idx += 2;
                    continue;
                }
                if (s[idx] == ch) {
                    idx += 1;
                    break;
                }
                idx += 1;
            }
            continue;
        }
        if (ch == '/') {
            if (!isRegexStart(s, idx)) {
                idx += 1;
                continue;
            }
            const closed = scanLiteral(s, idx) orelse {
                idx += 1;
                continue;
            };
            var flag_end = closed + 1;
            while (flag_end < s.len and isFlag(s[flag_end])) flag_end += 1;
            const pattern = s[idx + 1 .. closed];
            const first_cap = firstCapture(pattern);
            if (first_cap) |cap| {
                lines.advance(idx);
                if (!try capturesUsed(s, idx, flag_end, lines.line_start, &usages)) {
                    const p = lines.at(idx + 1 + cap);
                    try out.append(ctx.allocator, .{ .line = p.line, .column = p.column, .rule_id = rule_id, .message = message, .severity = .@"error" });
                }
            }
            idx = flag_end;
            continue;
        }
        idx += 1;
    }
}

fn isFlag(c: u8) bool {
    return switch (c) {
        'g', 'i', 'm', 's', 'u', 'v', 'y' => true,
        else => false,
    };
}

/// The rule's regex-or-division test for a `/` at `idx`: the character
/// before it (past spaces and tabs) is one of `=(<>!&|?:;,{[+(~^%*/`, there
/// is none, or the six code units ending there match
/// `/\b(?:return|typeof|void|delete|throw|new|in|of|case)\s*$/`.
fn isRegexStart(s: []const u8, idx: usize) bool {
    var end = idx;
    while (end > 0 and (s[end - 1] == ' ' or s[end - 1] == '\t')) end -= 1;
    if (end == 0) return true;
    if (std.mem.indexOfScalar(u8, "=(<>!&|?:;,{[+(~^%*/", s[end - 1]) != null) return true;
    // `end` is just past the character at prevIdx, unless that character
    // is outside the BMP, where it ends a slice that cannot match anyway
    const window_start = re.unitsBefore(s, end, 6);
    const window = s[window_start..end];
    const t = text.trimEnd(window);
    const keywords = [_][]const u8{ "return", "typeof", "void", "delete", "throw", "new", "in", "of", "case" };
    for (keywords) |kw| {
        if (std.mem.endsWith(u8, t, kw)) {
            const at = t.len - kw.len;
            if (at == 0 or !text.isWordByte(t[at - 1])) return true;
        }
    }
    return false;
}

/// The index of the closing `/` of the literal opened at `idx`, or null when
/// a newline or the end comes first. A backslash escapes the next code unit,
/// a newline included.
fn scanLiteral(s: []const u8, idx: usize) ?usize {
    var i = idx + 1;
    var in_class = false;
    var escaped = false;
    while (i < s.len) : (i += 1) {
        const c = s[i];
        if (escaped) {
            escaped = false;
        } else if (c == '\\') {
            escaped = true;
        } else if (c == '[') {
            in_class = true;
        } else if (c == ']') {
            in_class = false;
        } else if (c == '/' and !in_class) {
            return i;
        } else if (c == '\n') {
            return null;
        }
    }
    return null;
}

/// The offset of the first capturing `(` in `pattern`, or null when there is
/// none or the pattern has a backreference (`/\\[1-9]/`, on the raw text).
fn firstCapture(pattern: []const u8) ?usize {
    var k: usize = 0;
    while (std.mem.indexOfScalarPos(u8, pattern, k, '\\')) |b| : (k = b + 1) {
        if (b + 1 < pattern.len and pattern[b + 1] >= '1' and pattern[b + 1] <= '9') return null;
    }
    var in_class = false;
    var j: usize = 0;
    while (j < pattern.len) : (j += 1) {
        const c = pattern[j];
        if (c == '\\') {
            j += 1;
            continue;
        }
        if (c == '[' and !in_class) {
            in_class = true;
            continue;
        }
        if (c == ']' and in_class) {
            in_class = false;
            continue;
        }
        if (in_class) continue;
        if (c == '(') {
            const rest = pattern[j + 1 ..];
            const non_capturing = std.mem.startsWith(u8, rest, "?:") or std.mem.startsWith(u8, rest, "?=") or
                std.mem.startsWith(u8, rest, "?!") or std.mem.startsWith(u8, rest, "?<=") or std.mem.startsWith(u8, rest, "?<!");
            if (!non_capturing) return j;
        }
    }
    return null;
}

/// `areCapturesUsed`: whether the captures of the literal at `start..end`
/// (end past the flags, on the line from `line_start`) look used; true
/// when unsure.
fn capturesUsed(s: []const u8, start: usize, end: usize, line_start: usize, usages: *std.StringHashMap(Usage)) !bool {
    // A method called on the literal: `/re/.test(` or `/re/.exec(`
    var after = end;
    while (after < s.len and (s[after] == ' ' or s[after] == '\t')) after += 1;
    if (after < s.len and s[after] == '.') {
        // `content.slice(afterIdx + 1, afterIdx + 20)`
        const rest = s[after + 1 .. re.unitsAfter(s, after + 1, 19)];
        if (isCall(rest, "test")) return false;
        if (isCall(rest, "exec")) return true;
    }

    // An argument to a method: `str.match(/re/)`
    var before = start;
    while (before > 0 and (s[before - 1] == ' ' or s[before - 1] == '\t')) before -= 1;
    if (before > 0 and s[before - 1] == '(') {
        var method_end = before - 1;
        while (method_end > 0 and (s[method_end - 1] == ' ' or s[method_end - 1] == '\t')) method_end -= 1;
        // `content.slice(Math.max(0, methodStart - 20), methodStart + 1)`
        if (method_end > 0) {
            const window = s[re.unitsBefore(s, method_end, 21)..method_end];
            const t = text.trimEnd(window);
            for ([_][]const u8{ ".match", ".matchAll", ".exec", ".replace", ".replaceAll", ".split" }) |m| {
                if (std.mem.endsWith(u8, t, m)) return true;
            }
            if (std.mem.endsWith(u8, t, ".search") or std.mem.endsWith(u8, t, ".test")) return false;
        }
    }

    // `const re = /.../`: how the variable is used in `content.slice(end)`
    const name = assignedName(text.trim(s[line_start..start])) orelse return true;
    const gop = try usages.getOrPut(name);
    if (!gop.found_existing) gop.value_ptr.* = Usage.of(s, name);
    const u = gop.value_ptr.*;
    // `\b` holds at the start of the slice even after a word character (a
    // flag letter), where it does not in the whole text
    const cut = end > 0 and text.isWordByte(s[end - 1]);
    const has_exec = startsFrom(u.exec, end) or (cut and methodCallAt(s, end, name, ".exec"));
    if (has_exec or startsFrom(u.match, end) or startsFrom(u.replace, end)) return true;
    if (startsFrom(u.@"test", end) or (cut and methodCallAt(s, end, name, ".test"))) return false;
    return true;
}

/// Where each of the rule's usage patterns for one variable name last
/// starts in the whole text: the pattern matches in `content.slice(end)`
/// when that is at or past `end`. Computed once per name, so a file full
/// of `const re = /(...)/` is not searched again for each.
const Usage = struct {
    exec: ?usize,
    match: ?usize,
    replace: ?usize,
    @"test": ?usize,

    fn of(s: []const u8, name: []const u8) Usage {
        return .{
            .exec = lastMethodCall(s, name, ".exec"),
            .match = lastCallWith(s, name, true),
            .replace = lastCallWith(s, name, false),
            .@"test" = lastMethodCall(s, name, ".test"),
        };
    }
};

fn startsFrom(last: ?usize, end: usize) bool {
    return if (last) |at| at >= end else false;
}

/// `/^name\s*\(/` against `rest`
fn isCall(rest: []const u8, name: []const u8) bool {
    if (!std.mem.startsWith(u8, rest, name)) return false;
    const j = re.skipSpaces(rest, name.len);
    return j < rest.len and rest[j] == '(';
}

/// The `(\w+)` of `/(?:const|let|var)\s+(\w+)\s*=\s*$/` in a trimmed string.
fn assignedName(t: []const u8) ?[]const u8 {
    if (t.len == 0 or t[t.len - 1] != '=') return null;
    const head = text.trimEnd(t[0 .. t.len - 1]);
    var w = head.len;
    while (w > 0 and text.isWordByte(head[w - 1])) w -= 1;
    if (w == head.len) return null;
    const keyword_part = text.trimEnd(head[0..w]);
    if (keyword_part.len == w) return null;
    for ([_][]const u8{ "const", "let", "var" }) |kw| {
        if (std.mem.endsWith(u8, keyword_part, kw)) return head[w..];
    }
    return null;
}

/// The last start of `new RegExp(`\\b${name}${method}\\s*\\(`)` in `s`.
fn lastMethodCall(s: []const u8, name: []const u8, method: []const u8) ?usize {
    var last: ?usize = null;
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, s, from, name)) |at| : (from = at + 1) {
        if (at > 0 and text.isWordByte(s[at - 1])) continue;
        if (methodCallAt(s, at, name, method)) last = at;
    }
    return last;
}

/// `${name}${method}\s*\(` at `at`, leaving out the `\b` before it.
fn methodCallAt(s: []const u8, at: usize, name: []const u8, method: []const u8) bool {
    if (!std.mem.startsWith(u8, s[at..], name)) return false;
    const m = at + name.len;
    if (!std.mem.startsWith(u8, s[m..], method)) return false;
    const j = re.skipSpaces(s, m + method.len);
    return j < s.len and s[j] == '(';
}

/// The last start in `s` of `/\.match(?:All)?\s*\(\s*name\s*\)/` (with
/// `closed`) or `/\.replace(?:All)?\s*\(\s*name/` (without; nothing bounds
/// the name, so `re` is found in `.replace(reFoo`).
fn lastCallWith(s: []const u8, name: []const u8, closed: bool) ?usize {
    const method = if (closed) ".match" else ".replace";
    var last: ?usize = null;
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, s, from, method)) |at| : (from = at + 1) {
        var j = at + method.len;
        if (std.mem.startsWith(u8, s[j..], "All")) j += 3;
        j = re.skipSpaces(s, j);
        if (j >= s.len or s[j] != '(') continue;
        j = re.skipSpaces(s, j + 1);
        if (!std.mem.startsWith(u8, s[j..], name)) continue;
        if (closed) {
            j = re.skipSpaces(s, j + name.len);
            if (j >= s.len or s[j] != ')') continue;
        }
        last = at;
    }
    return last;
}
