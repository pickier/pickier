//! `general/no-unused-vars` - port of packages/pickier/src/rules/general/no-unused-vars.ts
//!
//! The same textual heuristics, scanner for scanner: `const`/`let`/`var`
//! declarations whose names appear on no other line, and parameters of
//! functions and arrows that their body never mentions. Comments are masked by
//! the shared lexer first; every line scanner keeps the quirks of its
//! TypeScript original. The file is converted to UTF-16 so that indices,
//! lengths and columns are JavaScript's.

const std = @import("std");
const types = @import("../types.zig");
const lexer = @import("../lexer.zig");
const js = @import("../nuv_js.zig");
const Pattern = @import("../nuv_pattern.zig").Pattern;

const Str = js.Str;
const Joined = js.Joined;
const Allocator = std.mem.Allocator;
const Buf = std.ArrayList(u16);

const Quote = enum { none, single, double, template };

fn quoteOf(c: u16) Quote {
    return switch (c) {
        '\'' => .single,
        '"' => .double,
        '`' => .template,
        else => .none,
    };
}

fn closes(q: Quote, c: u16) bool {
    return (q == .single and c == '\'') or (q == .double and c == '"') or (q == .template and c == '`');
}

fn isOpenBracket(c: u16) bool {
    return c == '(' or c == '[' or c == '{';
}

fn isCloseBracket(c: u16) bool {
    return c == ')' or c == ']' or c == '}';
}

/// `/[gimsuvy]/`
fn isRegexFlag(c: u16) bool {
    return switch (c) {
        'g', 'i', 'm', 's', 'u', 'v', 'y' => true,
        else => false,
    };
}

/// `TYPE_CONTINUATION`: `| & : , <`
fn isTypeContinuation(c: u16) bool {
    return c == '|' or c == '&' or c == ':' or c == ',' or c == '<';
}

/// `scannerStartsRegex`: whether a `/` at `at` can open a regex for the line
/// scanners - after nothing, one of `=([{,:;!&|?`, `=>` or `return`.
fn scannerStartsRegex(text: Str, at: usize) bool {
    if (at + 1 < text.len and (text[at + 1] == '/' or text[at + 1] == '*')) return false;
    const before = js.trimEnd(text[0..at]);
    if (before.len == 0) return true;
    switch (before[before.len - 1]) {
        '=', '(', '[', '{', ',', ':', ';', '!', '&', '|', '?' => return true,
        else => {},
    }
    return js.endsWith(before, "=>") or js.endsWith(before, "return");
}

/// `^([$A-Z_][\w$]*)` with the `i` flag: the identifier at the start of `s`.
fn leadingIdentifier(s: Str) ?Str {
    if (s.len == 0 or !js.isIdentStart(s[0])) return null;
    var k: usize = 1;
    while (k < s.len and js.isIdent(s[k])) k += 1;
    return s[0..k];
}

/// The value before a top-level `=`, as the destructuring scanner strips a default.
fn stripFieldDefault(s: Str) Str {
    var depth: i32 = 0;
    for (s, 0..) |ch, ci| {
        if (isOpenBracket(ch)) {
            depth += 1;
        } else if (isCloseBracket(ch)) {
            depth -= 1;
        } else if (ch == '=' and depth == 0) {
            return js.trim(s[0..ci]);
        }
    }
    return s;
}

const Range = struct { from: usize, to: usize };

/// Lines on which a `\w` run occurs: the first, and whether there is another.
const WordLines = struct { first: usize, other: bool };

/// A declared name and its 0-based line.
const Decl = struct { line: usize, name: Str };

const Checker = struct {
    a: Allocator,
    /// The comment-masked text, and its lines (slices of it)
    code: Str,
    lines: []const Str,
    out: *std.ArrayList(types.Issue),
    var_ignore: Pattern,
    arg_ignore: Pattern,
    vars_pattern: []const u8,
    args_pattern: []const u8,

    /// Total length of all lines, for referencedOutsideLineDollar
    lines_len: ?usize = null,

    // Scratch buffers, reused line to line
    part_buf: Buf = .empty,
    defaults_buf: Buf = .empty,
    params_buf: Buf = .empty,
    body_line_buf: Buf = .empty,
    no_regex_buf: Buf = .empty,
    single_buf: Buf = .empty,
    double_buf: Buf = .empty,
    masked_buf: Buf = .empty,
    names: std.ArrayList(Str) = .empty,

    // For long expression and block bodies (see arrowExpressionBody, bodyMentions)
    line_infos: ?[]?LineInfo = null,
    checkpoints: std.AutoHashMapUnmanaged(usize, []Brackets) = .empty,
    scanned_lines: usize = 0,
    walked_lines: usize = 0,
    jumps: ?Jumps = null,
    word_lines: ?std.HashMapUnmanaged(Str, std.ArrayList(u32), js.StrContext, 80) = null,
    tmpl_stack: std.ArrayList(i64) = .empty,

    fn report(self: *Checker, line: usize, name: Str, comptime kind: enum { variable, parameter }) !void {
        const column = if (js.indexOf(self.lines[line], name)) |c| c + 1 else 1;
        const n = try js.asciiToUtf8(self.a, name);
        try self.out.append(self.a, switch (kind) {
            .variable => .{
                .line = @intCast(line + 1),
                .column = @intCast(@max(1, column)),
                .rule_id = "pickier/no-unused-vars",
                .message = try std.fmt.allocPrint(self.a, "'{s}' is assigned a value but never used. Allowed unused vars must match pattern: {s}", .{ n, self.vars_pattern }),
                .severity = .@"error",
                .help = try std.fmt.allocPrint(self.a, "Either use this variable in your code, remove it, or prefix it with an underscore (_{s}) to mark it as intentionally unused", .{n}),
            },
            .parameter => .{
                .line = @intCast(line + 1),
                .column = @intCast(@max(1, column)),
                .rule_id = "pickier/no-unused-vars",
                .message = try std.fmt.allocPrint(self.a, "'{s}' is defined but never used (function parameter). Allowed unused args must match pattern: {s}", .{ n, self.args_pattern }),
                .severity = .@"error",
            },
        });
    }

    // ---- declarations ---------------------------------------------------

    /// `new RegExp('\\b' + name + '\\b')` anywhere in the file but line `i`,
    /// for every declared name at once.
    ///
    /// Without a `$` in the name, a match is a maximal `\w` run equal to the
    /// name, so one pass over the file's runs finds the lines each declared
    /// name occurs on. Names with a `$` go through the TypeScript construction.
    fn resolveReferences(self: *Checker, decls: []const Decl) ![]bool {
        const used = try self.a.alloc(bool, decls.len);
        var map: std.HashMapUnmanaged(Str, WordLines, js.StrContext, 80) = .empty;
        // A cheap filter in front of the map: length, first and last unit
        var filter: [64]u64 = @splat(0);
        for (decls) |d| {
            if (js.contains(d.name, '$')) continue;
            try map.put(self.a, d.name, .{ .first = std.math.maxInt(usize), .other = false });
            const h = filterBit(d.name);
            filter[h >> 6] |= @as(u64, 1) << @intCast(h & 63);
        }
        if (map.count() > 0) {
            // One pass over the whole text; a run never spans a line break,
            // and the lines are slices of the text in order
            const Scan = struct {
                text: Str,
                lines: []const Str,
                k: usize = 0,
                filter: *const [64]u64,
                map: *std.HashMapUnmanaged(Str, WordLines, js.StrContext, 80),

                fn run(sc: *@This(), start: usize, end: usize) anyerror!void {
                    const word = sc.text[start..end];
                    const h = filterBit(word);
                    if (sc.filter[h >> 6] & (@as(u64, 1) << @intCast(h & 63)) == 0) return;
                    const entry = sc.map.getPtr(word) orelse return;
                    // The line holding `start`
                    while (sc.k + 1 < sc.lines.len and (@intFromPtr(sc.lines[sc.k + 1].ptr) - @intFromPtr(sc.text.ptr)) / 2 <= start) sc.k += 1;
                    if (entry.first == std.math.maxInt(usize)) {
                        entry.first = sc.k;
                    } else if (entry.first != sc.k) {
                        entry.other = true;
                    }
                }
            };
            var sc: Scan = .{ .text = self.code, .lines = self.lines, .filter = &filter, .map = &map };
            try js.forEachWordRun(self.code, &sc, Scan.run);
        }
        for (decls, 0..) |d, n| {
            if (js.contains(d.name, '$')) {
                used[n] = try self.referencedOutsideLineDollar(d.name, d.line);
                continue;
            }
            const entry = map.get(d.name).?;
            used[n] = (entry.first != std.math.maxInt(usize) and entry.first != d.line) or entry.other;
        }
        return used;
    }

    fn filterBit(word: Str) usize {
        const h = @as(usize, word[0]) *% 31 +% @as(usize, word[word.len - 1]) *% 131 +% word.len *% 7919;
        return (h ^ (h >> 7)) & 4095;
    }

    /// The `$` case keeps the TypeScript construction: the pattern runs over
    /// `lines.slice(0, i).join('\n') + '\n' + lines.slice(i + 1).join('\n')`,
    /// where `$` anchors at its end. Only the end of that text matters.
    fn referencedOutsideLineDollar(self: *Checker, name: Str, i: usize) !bool {
        const dollar = js.indexOfScalar(name, '$').?;
        for (name[dollar..]) |c| {
            if (c != '$') return false;
        }
        const prefix = name[0..dollar];
        const n = self.lines.len;
        if (self.lines_len == null) {
            var sum: usize = 0;
            for (self.lines) |l| sum += l.len;
            self.lines_len = sum;
        }
        // The text is the join of the lines with line i left out, except that
        // leaving out the first or last line leaves an empty one in its place
        const count = if (n == 1) 2 else if (i == 0 or i == n - 1) n else n - 1;
        const total = self.lines_len.? - self.lines[i].len + count - 1;

        var stack: [256]u16 = undefined;
        const want = @min(total, prefix.len + 1);
        const buf = if (want <= stack.len) stack[0..] else try self.a.alloc(u16, want);
        var w = want;
        var j = count;
        while (w > 0 and j > 0) {
            j -= 1;
            const piece = self.pieceWithout(i, j);
            const take = @min(piece.len, w);
            @memcpy(buf[w - take .. w], piece[piece.len - take ..]);
            w -= take;
            if (w > 0 and j > 0) {
                buf[w - 1] = '\n';
                w -= 1;
            }
        }
        return js.dollarMatch(prefix, buf[w..want], total);
    }

    /// Piece `j` of the lines with line `i` left out (see above).
    fn pieceWithout(self: *Checker, i: usize, j: usize) Str {
        const n = self.lines.len;
        if (n == 1) return &.{};
        if (i == 0) return if (j == 0) &.{} else self.lines[j];
        if (i == n - 1) return if (j == n - 1) &.{} else self.lines[j];
        return if (j < i) self.lines[j] else self.lines[j + 1];
    }

    /// `^\s*(?:const|let|var)\s+(.+?);?\s*$` - the declarators, or null when
    /// the line does not match (or matches with only whitespace, which
    /// declares nothing either).
    fn declarators(line: Str) ?Str {
        const rest = js.trimStart(line);
        const kw: usize = if (js.startsWith(rest, "const")) 5 else if (js.startsWith(rest, "let") or js.startsWith(rest, "var")) 3 else return null;
        const after_kw = rest[kw..];
        const r = js.trimStart(after_kw);
        if (r.len == after_kw.len or r.len == 0) return null;
        // The lazy group ends where `;?\s*$` can take the rest
        const t = js.trimEnd(r).len;
        const l = if (t >= 2 and r[t - 1] == ';') t - 1 else t;
        const group = r[0..l];
        for (group) |c| {
            if (js.isLineTerminator(c)) return null;
        }
        return group;
    }

    fn checkDeclarations(self: *Checker, starts_in_template: []const bool) !void {
        var parts: std.ArrayList([2]usize) = .empty;
        var decls: std.ArrayList(Decl) = .empty;
        for (self.lines, 0..) |line, i| {
            if (starts_in_template[i]) continue;
            const after = declarators(line) orelse continue;

            // Smart comma split: ignore commas inside < >, [ ], { }, ( ), and strings
            self.part_buf.clearRetainingCapacity();
            try self.part_buf.ensureTotalCapacity(self.a, after.len);
            parts.clearRetainingCapacity();
            var part_start: usize = 0;
            var depth: i32 = 0;
            var angle: i32 = 0;
            var in_string: Quote = .none;
            var escaped = false;
            var k: usize = 0;
            while (k < after.len) : (k += 1) {
                const ch = after[k];
                if (escaped) {
                    escaped = false;
                    self.part_buf.appendAssumeCapacity(ch);
                    continue;
                }
                if (ch == '\\' and in_string != .none) {
                    escaped = true;
                    self.part_buf.appendAssumeCapacity(ch);
                    continue;
                }
                if (in_string == .none) {
                    const next: u16 = if (k + 1 < after.len) after[k + 1] else 0;
                    if (ch == '/' and next == '/') break;
                    if (ch == '/' and next == '*') {
                        k += 2;
                        while (k < after.len and !(after[k] == '*' and k + 1 < after.len and after[k + 1] == '/')) k += 1;
                        k += 1;
                        continue;
                    }
                    switch (ch) {
                        '\'', '"', '`' => in_string = quoteOf(ch),
                        '<' => angle += 1,
                        '>' => angle -= 1,
                        '(', '[', '{' => depth += 1,
                        ')', ']', '}' => depth -= 1,
                        ',' => if (depth == 0 and angle == 0) {
                            try parts.append(self.a, .{ part_start, self.part_buf.items.len });
                            part_start = self.part_buf.items.len;
                            continue;
                        },
                        else => {},
                    }
                } else if (closes(in_string, ch)) {
                    in_string = .none;
                }
                self.part_buf.appendAssumeCapacity(ch);
            }
            if (self.part_buf.items.len > part_start) try parts.append(self.a, .{ part_start, self.part_buf.items.len });

            for (parts.items) |range| {
                const part = js.trim(self.part_buf.items[range[0]..range[1]]);
                if (part.len == 0) continue;
                self.names.clearRetainingCapacity();
                if (leadingIdentifier(part)) |name| {
                    try self.names.append(self.a, name);
                } else if (part[0] == '{' or part[0] == '[') {
                    try self.destructuredNames(part);
                }
                for (self.names.items) |name| {
                    if (self.var_ignore.matches(name)) continue;
                    try decls.append(self.a, .{ .line = i, .name = try self.a.dupe(u16, name) });
                }
            }
        }
        if (decls.items.len == 0) return;
        // The whole file except the declaring line, not just what follows it
        const used = try self.resolveReferences(decls.items);
        for (decls.items, used) |d, u| {
            if (!u) try self.report(d.line, d.name, .variable);
        }
    }

    fn destructuredNames(self: *Checker, part: Str) !void {
        const open = part[0];
        const close: u16 = if (open == '{') '}' else ']';
        var d_depth: i32 = 0;
        var end_idx: ?usize = null;
        var d_str: Quote = .none;
        var d_esc = false;
        for (part, 0..) |ch, ci| {
            if (d_esc) {
                d_esc = false;
                continue;
            }
            if (ch == '\\' and d_str != .none) {
                d_esc = true;
                continue;
            }
            if (d_str == .none) {
                if (ch == '\'' or ch == '"' or ch == '`') {
                    d_str = quoteOf(ch);
                } else if (ch == open) {
                    d_depth += 1;
                } else if (ch == close) {
                    d_depth -= 1;
                    if (d_depth == 0) {
                        end_idx = ci;
                        break;
                    }
                }
            } else if (closes(d_str, ch)) d_str = .none;
        }
        const end = end_idx orelse return;
        if (end == 0) return;
        const inner = part[1..end];

        // Fields: split on commas at depth 0, outside strings
        var f_start: usize = 0;
        var f_depth: i32 = 0;
        var f_str: Quote = .none;
        var f_esc = false;
        for (inner, 0..) |ch, ci| {
            if (f_esc) {
                f_esc = false;
                continue;
            }
            if (ch == '\\' and f_str != .none) {
                f_esc = true;
                continue;
            }
            if (f_str == .none) {
                if (ch == '\'' or ch == '"' or ch == '`') {
                    f_str = quoteOf(ch);
                    continue;
                }
                if (isOpenBracket(ch)) f_depth += 1;
                if (isCloseBracket(ch)) f_depth -= 1;
                if (ch == ',' and f_depth == 0) {
                    try self.fieldName(js.trim(inner[f_start..ci]));
                    f_start = ci + 1;
                    continue;
                }
            } else if (closes(f_str, ch)) f_str = .none;
        }
        const last = js.trim(inner[f_start..]);
        if (last.len > 0) try self.fieldName(last);
    }

    fn fieldName(self: *Checker, field: Str) !void {
        if (js.startsWith(field, "...")) {
            if (leadingIdentifier(field[3..])) |n| try self.names.append(self.a, n);
            return;
        }
        // `key: value` binds the value; a default after `=` is dropped
        const value = if (js.indexOfScalar(field, ':')) |colon| stripFieldDefault(js.trim(field[colon + 1 ..])) else stripFieldDefault(field);
        if (leadingIdentifier(value)) |n| try self.names.append(self.a, n);
    }

    // ---- parameters -----------------------------------------------------

    /// `getParamNames`: defaults and type annotations stripped, then the
    /// `[$\w]` runs other than `undefined`.
    fn paramNames(self: *Checker, raw: Str) ![]const Str {
        // stripDefaults: everything before a top-level `=`, string escapes dropped
        self.defaults_buf.clearRetainingCapacity();
        {
            var in_str: Quote = .none;
            var escaped = false;
            var depth: i32 = 0;
            for (raw) |ch| {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch == '\\' and in_str != .none) {
                    escaped = true;
                    continue;
                }
                if (in_str == .none) {
                    if (ch == '\'' or ch == '"' or ch == '`') {
                        in_str = quoteOf(ch);
                    } else if (isOpenBracket(ch)) {
                        depth += 1;
                    } else if (isCloseBracket(ch)) {
                        depth -= 1;
                    } else if (ch == '=' and depth == 0) {
                        break;
                    }
                } else if (closes(in_str, ch)) in_str = .none;
                try self.defaults_buf.append(self.a, ch);
            }
        }

        // stripTypes: skip from each `:` to the end of its type
        const s = self.defaults_buf.items;
        var cleaned: Buf = .empty;
        try cleaned.ensureTotalCapacity(self.a, s.len);
        var i: usize = 0;
        while (i < s.len) {
            const ch = s[i];
            if (ch == ':') {
                i += 1;
                while (i < s.len and js.isWs(s[i])) i += 1;
                var depth: i32 = 0;
                var angle: i32 = 0;
                var in_str: Quote = .none;
                var escaped = false;
                while (i < s.len) : (i += 1) {
                    const c = s[i];
                    if (escaped) {
                        escaped = false;
                        continue;
                    }
                    if (c == '\\' and in_str != .none) {
                        escaped = true;
                        continue;
                    }
                    if (in_str == .none) {
                        if (c == '\'' or c == '"' or c == '`') {
                            in_str = quoteOf(c);
                        } else if (c == '<') {
                            angle += 1;
                        } else if (c == '>') {
                            angle -= 1;
                        } else if (isOpenBracket(c)) {
                            depth += 1;
                        } else if (isCloseBracket(c)) {
                            if (depth > 0) depth -= 1 else break;
                        } else if (c == ',' and depth == 0 and angle == 0) {
                            break;
                        }
                    } else if (closes(in_str, c)) in_str = .none;
                }
                continue;
            }
            cleaned.appendAssumeCapacity(ch);
            i += 1;
        }

        // split(/[^$\w]+/), without empties and `undefined`
        var names: std.ArrayList(Str) = .empty;
        const c = cleaned.items;
        var p: usize = 0;
        while (p < c.len) {
            if (!js.isIdent(c[p])) {
                p += 1;
                continue;
            }
            const start = p;
            while (p < c.len and js.isIdent(c[p])) p += 1;
            const name = c[start..p];
            if (!js.eql(name, "undefined")) try names.append(self.a, name);
        }
        return names.items;
    }

    /// `/^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\b|class\b|const\b|let\b|var\b|interface\b|type\b)/`
    fn startsDeclaration(code: Str) bool {
        var s = js.trimStart(code);
        inline for (.{ "export", "default", "declare", "abstract", "async" }) |word| {
            if (js.startsWith(s, word)) {
                const rest = js.trimStart(s[word.len..]);
                if (rest.len < s.len - word.len) s = rest;
            }
        }
        inline for (.{ "function", "class", "const", "let", "var", "interface", "type" }) |kw| {
            if (js.startsWith(s, kw) and (s.len == kw.len or !js.isWord(s[kw.len]))) return true;
        }
        return false;
    }

    /// `text.replace(/\/\/.*$/, '')`: from the first `//` that no line
    /// terminator follows.
    fn stripLineComment(text: Str) Str {
        var from: usize = 0;
        var k = text.len;
        while (k > 0) {
            k -= 1;
            if (js.isLineTerminator(text[k])) {
                from = k + 1;
                break;
            }
        }
        if (js.indexOfLit(text, from, "//")) |at| return text[0..at];
        return text;
    }

    /// `signatureHasNoBody`: an overload or ambient signature ending at the
    /// `)` at (close_line, close_col).
    fn signatureHasNoBody(self: *Checker, close_line: usize, close_col: usize) bool {
        var ln = close_line;
        while (ln < self.lines.len) : (ln += 1) {
            const text = if (ln == close_line) self.lines[ln][@min(close_col + 1, self.lines[ln].len)..] else self.lines[ln];
            const code = stripLineComment(text);
            if (ln != close_line and startsDeclaration(code)) return true;
            if (js.contains(code, '{')) return false;
            if (js.contains(code, ';')) return true;
        }
        return true;
    }

    /// `stripRegexFromLine` in findBodyRange: regex literals removed,
    /// strings tracked.
    fn stripRegexFromLine(self: *Checker, str: Str) !Str {
        if (!js.contains(str, '/')) return str;
        const buf = &self.body_line_buf;
        buf.clearRetainingCapacity();
        try buf.ensureTotalCapacity(self.a, str.len);
        var i: usize = 0;
        var in_string: Quote = .none;
        var escaped = false;
        while (i < str.len) {
            const ch = str[i];
            if (escaped) {
                escaped = false;
                buf.appendAssumeCapacity(ch);
                i += 1;
                continue;
            }
            if (ch == '\\' and in_string != .none) {
                escaped = true;
                buf.appendAssumeCapacity(ch);
                i += 1;
                continue;
            }
            if (in_string == .none) {
                if (ch == '\'' or ch == '"' or ch == '`') {
                    in_string = quoteOf(ch);
                } else if (ch == '/' and scannerStartsRegex(str, i)) {
                    i = skipRegex(str, i + 1);
                    continue;
                }
            } else if (closes(in_string, ch)) in_string = .none;
            buf.appendAssumeCapacity(ch);
            i += 1;
        }
        return buf.items;
    }

    /// Past a regex body starting at `i` and its flags.
    fn skipRegex(str: Str, start: usize) usize {
        var i = start;
        while (i < str.len) {
            if (str[i] == '\\') {
                i += 2;
                continue;
            }
            if (str[i] == '/') {
                i += 1;
                while (i < str.len and isRegexFlag(str[i])) i += 1;
                break;
            }
            i += 1;
        }
        return i;
    }

    /// `findBodyRange`: the lines from the body's `{` to its matching `}`.
    fn findBodyRange(self: *Checker, start_line_in: usize, start_col_from: usize) !?Range {
        var start_line = start_line_in;
        var open_found = false;
        var depth: i64 = 0;
        // Return type annotation tracking, across lines
        var body_brace_depth: i64 = 0;
        var body_saw_brace_pair = false;
        var body_angle_depth: i64 = 0;
        var body_in_str: Quote = .none;
        var body_esc = false;
        var is_first_search_line = true;
        var last_non_ws: u16 = 0;
        // String/template state of the depth-tracking pass, across lines
        var depth_in_single = false;
        var depth_in_double = false;
        const stack = &self.tmpl_stack;
        stack.clearRetainingCapacity();
        var depth_escaped = false;

        var ln = start_line;
        while (ln < self.lines.len) : (ln += 1) {
            const s = self.lines[ln];
            const in_multi_line_body = stack.items.len > 0 and stack.items[stack.items.len - 1] == -1;
            var line_to_process = s;
            if (!in_multi_line_body and js.contains(s, '/')) {
                // Strip a `//` comment outside strings
                var in_str: Quote = .none;
                var esc = false;
                var i: usize = 0;
                while (i + 1 < s.len) : (i += 1) {
                    const c = s[i];
                    if (esc) {
                        esc = false;
                        continue;
                    }
                    if (c == '\\' and in_str != .none) {
                        esc = true;
                        continue;
                    }
                    if (in_str == .none) {
                        if (c == '\'' or c == '"' or c == '`') {
                            in_str = quoteOf(c);
                        } else if (c == '/' and s[i + 1] == '/') {
                            line_to_process = s[0..i];
                            break;
                        }
                    } else if (closes(in_str, c)) in_str = .none;
                }
                line_to_process = try self.stripRegexFromLine(line_to_process);
            }
            const ltp = line_to_process;

            var start_idx: usize = 0;
            if (!open_found) {
                var found: ?usize = null;
                var search_start = if (is_first_search_line) start_col_from else 0;
                is_first_search_line = false;
                if (search_start >= ltp.len) {
                    search_start = if (js.indexOfLit(ltp, 0, "=>")) |arrow| arrow + 2 else 0;
                }
                var i = search_start;
                while (i < ltp.len) : (i += 1) {
                    const c = ltp[i];
                    if (body_esc) {
                        body_esc = false;
                        continue;
                    }
                    if (c == '\\' and body_in_str != .none) {
                        body_esc = true;
                        continue;
                    }
                    if (body_in_str == .none) {
                        if (c != ' ' and c != '\t' and c != '\n' and c != '\r' and c != '{' and c != '}' and body_brace_depth == 0) last_non_ws = c;
                        if (c == '\'' or c == '"' or c == '`') {
                            body_in_str = quoteOf(c);
                        } else if (c == '<') {
                            body_angle_depth += 1;
                        } else if (c == '>') {
                            body_angle_depth = @max(0, body_angle_depth - 1);
                        } else if (c == '{') {
                            if (body_brace_depth == 0 and body_saw_brace_pair and body_angle_depth == 0 and !isTypeContinuation(last_non_ws)) {
                                found = i;
                                break;
                            }
                            body_brace_depth += 1;
                        } else if (c == '}') {
                            if (body_brace_depth > 0) {
                                body_brace_depth -= 1;
                                if (body_brace_depth == 0) {
                                    body_saw_brace_pair = true;
                                    last_non_ws = '}';
                                }
                            }
                        }
                    } else if (closes(body_in_str, c)) body_in_str = .none;
                }
                if (found == null) {
                    // An unclosed `<` means the return type is still open
                    if (body_angle_depth > 0) continue;
                    if (body_brace_depth > 0 and isTypeContinuation(last_non_ws)) continue;
                    // The first `{` on the line
                    if (body_in_str == .none) {
                        if (js.indexOfScalarFrom(ltp, search_start, '{')) |b| found = b;
                    }
                }
                const f = found orelse continue;
                open_found = true;
                depth = 1;
                start_idx = f + 1;
                start_line = ln;
            }

            var k = start_idx;
            while (k < ltp.len) : (k += 1) {
                // Outside every string and template only quotes, backticks
                // and braces matter
                if (!depth_escaped and !depth_in_single and !depth_in_double and stack.items.len == 0) {
                    k = js.indexOfAny(ltp, k, &.{ '\'', '"', '`', '{', '}' }) orelse break;
                }
                const ch = ltp[k];
                if (depth_escaped) {
                    depth_escaped = false;
                    continue;
                }
                const top: ?i64 = if (stack.items.len > 0) stack.items[stack.items.len - 1] else null;
                const in_body = top != null and top.? == -1;
                const in_expr = top != null and top.? >= 0;
                if (ch == '\\' and (depth_in_single or depth_in_double or in_body)) {
                    depth_escaped = true;
                    continue;
                }
                if (depth_in_single) {
                    if (ch == '\'') depth_in_single = false;
                    continue;
                }
                if (depth_in_double) {
                    if (ch == '"') depth_in_double = false;
                    continue;
                }
                if (in_body) {
                    if (ch == '`') {
                        _ = stack.pop();
                    } else if (ch == '$' and k + 1 < ltp.len and ltp[k + 1] == '{') {
                        stack.items[stack.items.len - 1] = 0;
                        k += 1;
                    }
                    continue;
                }
                if (in_expr) {
                    if (ch == '/' and scannerStartsRegex(ltp, k)) {
                        k += 1;
                        while (k < ltp.len) {
                            if (ltp[k] == '\\') {
                                k += 2;
                                continue;
                            }
                            if (ltp[k] == '/') {
                                while (k + 1 < ltp.len and isRegexFlag(ltp[k + 1])) k += 1;
                                break;
                            }
                            k += 1;
                        }
                        continue;
                    }
                    const t = &stack.items[stack.items.len - 1];
                    switch (ch) {
                        '`' => try stack.append(self.a, -1),
                        '\'' => depth_in_single = true,
                        '"' => depth_in_double = true,
                        '{' => t.* += 1,
                        '}' => if (t.* > 0) {
                            t.* -= 1;
                        } else {
                            t.* = -1;
                        },
                        else => {},
                    }
                    continue;
                }
                switch (ch) {
                    '\'' => depth_in_single = true,
                    '"' => depth_in_double = true,
                    '`' => try stack.append(self.a, -1),
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if (depth == 0) return .{ .from = start_line, .to = ln };
                    },
                    else => {},
                }
            }
        }
        return null;
    }

    /// The text of a body found by findBodyRange: after the `{` at
    /// `brace` on its first line when that line is `first_line`.
    fn bodyText(self: *Checker, range: ?Range, first_line: usize, brace: ?usize) Joined {
        const r = range orelse return .{ .head = &.{} };
        if (r.from == first_line) {
            const start_line = self.lines[r.from];
            const rest: Str = if (brace) |b| start_line[b + 1 ..] else &.{};
            if (r.to > r.from) return .{ .head = rest, .rest = self.lines[r.from + 1 .. r.to + 1] };
            return .{ .head = rest };
        }
        return .{ .head = self.lines[r.from], .rest = self.lines[r.from + 1 .. r.to + 1] };
    }

    /// `collectArrowExpressionBody`: an expression body, continued while
    /// brackets or a template are open or a line continues the expression.
    fn arrowExpressionBody(self: *Checker, start_line: usize, arrow_col: usize) !Joined {
        // `updateState` only adds counts up, and `isOpen` is only asked
        // between lines, so the state is a sum of per-line counts
        const first = self.lines[start_line];
        const head_at = @min(arrow_col + 2, first.len);
        const head = first[head_at..];
        var state = try self.suffixBrackets(start_line, head_at);
        var has_content = js.trim(head).len > 0;
        var next = start_line + 1;
        while (next < self.lines.len) {
            // A run of lines each continuing the last whatever the state (a
            // file whose every line ends in an operator, say) is taken whole
            // once those runs have been walked line by line for long enough
            if (next > start_line + 1 and self.walked_lines > 4 * self.lines.len + 4096) {
                const jumps = try self.continuationJumps();
                const end = jumps.forced_end[next];
                if (end > next) {
                    state.add(jumps.brackets[end].minus(jumps.brackets[next]));
                    has_content = has_content or jumps.content[end] > jumps.content[next];
                    next = end;
                    continue;
                }
            }
            self.walked_lines += 1;
            const info = try self.lineInfo(next);
            const ends_continued = if (next == start_line + 1) endsWithContinuation(head) else (try self.lineInfo(next - 1)).ends_continued;
            const go_on = !has_content or state.isOpen() or ends_continued or info.starts_continued;
            if (!go_on) break;
            has_content = has_content or info.has_content;
            state.add(info.brackets);
            next += 1;
        }
        return .{ .head = head, .rest = self.lines[start_line + 1 .. next] };
    }

    const Jumps = struct {
        /// forced_end[k]: the first line m >= k whose step is not forced -
        /// where line m - 1 does not end with a continuation and line m does
        /// not start with one - or the line count
        forced_end: []u32,
        /// Prefix sums over lines: brackets[k] for lines [0, k)
        brackets: []Brackets,
        /// Lines with content among [0, k)
        content: []u32,
    };

    fn continuationJumps(self: *Checker) !*const Jumps {
        if (self.jumps) |*j| return j;
        const n = self.lines.len;
        const forced_end = try self.a.alloc(u32, n + 1);
        const brackets = try self.a.alloc(Brackets, n + 1);
        const content = try self.a.alloc(u32, n + 1);
        brackets[0] = .{};
        content[0] = 0;
        for (0..n) |k| {
            const info = try self.lineInfo(k);
            brackets[k + 1] = brackets[k];
            brackets[k + 1].add(info.brackets);
            content[k + 1] = content[k] + @intFromBool(info.has_content);
        }
        forced_end[n] = @intCast(n);
        var k = n;
        while (k > 0) {
            k -= 1;
            const forced = k > 0 and ((try self.lineInfo(k - 1)).ends_continued or (try self.lineInfo(k)).starts_continued);
            forced_end[k] = if (forced) forced_end[k + 1] else @intCast(k);
        }
        self.jumps = .{ .forced_end = forced_end, .brackets = brackets, .content = content };
        return &self.jumps.?;
    }

    /// The counts `collectArrowExpressionBody`'s `updateState` keeps.
    const Brackets = struct {
        paren: i32 = 0,
        brace: i32 = 0,
        bracket: i32 = 0,
        /// Odd number of backticks: `inTemplate` flipped
        backticks: u1 = 0,

        fn of(text: Str) Brackets {
            var b: Brackets = .{};
            var i: usize = 0;
            while (js.indexOfAny(text, i, &.{ '`', '(', ')', '{', '}', '[', ']' })) |at| {
                i = at + 1;
                switch (text[at]) {
                    '`' => b.backticks ^= 1,
                    '(' => b.paren += 1,
                    ')' => b.paren -= 1,
                    '{' => b.brace += 1,
                    '}' => b.brace -= 1,
                    '[' => b.bracket += 1,
                    else => b.bracket -= 1,
                }
            }
            return b;
        }

        fn add(b: *Brackets, o: Brackets) void {
            b.paren += o.paren;
            b.brace += o.brace;
            b.bracket += o.bracket;
            b.backticks ^= o.backticks;
        }

        fn minus(b: Brackets, o: Brackets) Brackets {
            return .{ .paren = b.paren - o.paren, .brace = b.brace - o.brace, .bracket = b.bracket - o.bracket, .backticks = b.backticks ^ o.backticks };
        }

        fn isOpen(b: Brackets) bool {
            return b.paren > 0 or b.brace > 0 or b.bracket > 0 or b.backticks == 1;
        }
    };

    const LineInfo = struct {
        brackets: Brackets,
        has_content: bool,
        ends_continued: bool,
        starts_continued: bool,
    };

    fn lineInfo(self: *Checker, k: usize) !LineInfo {
        if (self.line_infos == null) {
            const infos = try self.a.alloc(?LineInfo, self.lines.len);
            @memset(infos, null);
            self.line_infos = infos;
        }
        const slot = &self.line_infos.?[k];
        if (slot.*) |info| return info;
        const line = self.lines[k];
        const info: LineInfo = .{
            .brackets = Brackets.of(line),
            .has_content = js.trim(line).len > 0,
            .ends_continued = endsWithContinuation(line),
            .starts_continued = startsWithContinuation(line),
        };
        slot.* = info;
        return info;
    }

    /// Bracket counts of `lines[k][from..]`. A long line (a minified file has
    /// an arrow every few characters) keeps counts every 64 units so this
    /// does not rescan the rest of the line for each arrow.
    fn suffixBrackets(self: *Checker, k: usize, from: usize) !Brackets {
        const line = self.lines[k];
        if (line.len < 1024) return Brackets.of(line[from..]);
        const gop = try self.checkpoints.getOrPut(self.a, k);
        if (!gop.found_existing) {
            // checkpoint[j] = counts of line[0 .. j * 64]
            const marks = try self.a.alloc(Brackets, line.len / 64 + 1);
            var acc: Brackets = .{};
            for (marks, 0..) |*m, j| {
                if (j > 0) acc.add(Brackets.of(line[(j - 1) * 64 .. j * 64]));
                m.* = acc;
            }
            gop.value_ptr.* = marks;
        }
        const marks = gop.value_ptr.*;
        const total = (try self.lineInfo(k)).brackets;
        var before = marks[from / 64];
        before.add(Brackets.of(line[(from / 64) * 64 .. from]));
        return total.minus(before);
    }

    /// `new RegExp('\\b' + name + '\\b').test(body)`. Bodies are usually
    /// short or use the name early; when the lines scanned this way grow past
    /// a few times the file (a body running to the end of the file for every
    /// arrow, say), long bodies are answered from an index of which lines
    /// each word occurs on instead.
    fn bodyMentions(self: *Checker, name: Str, body: Joined) !bool {
        if (body.rest.len < 64 or js.contains(name, '$')) return js.wordBoundedTest(self.a, name, body);
        if (self.scanned_lines < 8 * self.lines.len + 4096) {
            self.scanned_lines += body.rest.len;
            return js.wordBoundedTest(self.a, name, body);
        }
        if (js.findWordRun(body.head, name)) return true;
        if (self.word_lines == null) try self.buildWordLines();
        const lines = self.word_lines.?.get(name) orelse return false;
        const first = (@intFromPtr(body.rest.ptr) - @intFromPtr(self.lines.ptr)) / @sizeOf(Str);
        // The first line holding the word at or after `first`
        var lo: usize = 0;
        var hi: usize = lines.items.len;
        while (lo < hi) {
            const mid = (lo + hi) / 2;
            if (lines.items[mid] < first) lo = mid + 1 else hi = mid;
        }
        return lo < lines.items.len and lines.items[lo] < first + body.rest.len;
    }

    fn buildWordLines(self: *Checker) !void {
        const Scan = struct {
            checker: *Checker,
            map: std.HashMapUnmanaged(Str, std.ArrayList(u32), js.StrContext, 80) = .empty,
            k: usize = 0,

            fn run(sc: *@This(), start: usize, end: usize) anyerror!void {
                const c = sc.checker;
                while (sc.k + 1 < c.lines.len and (@intFromPtr(c.lines[sc.k + 1].ptr) - @intFromPtr(c.code.ptr)) / 2 <= start) sc.k += 1;
                const gop = try sc.map.getOrPut(c.a, c.code[start..end]);
                if (!gop.found_existing) gop.value_ptr.* = .empty;
                const list = gop.value_ptr;
                if (list.items.len == 0 or list.items[list.items.len - 1] != sc.k) try list.append(c.a, @intCast(sc.k));
            }
        };
        var sc: Scan = .{ .checker = self };
        try js.forEachWordRun(self.code, &sc, Scan.run);
        self.word_lines = sc.map;
    }

    fn isContinuationChar(c: u16) bool {
        return switch (c) {
            '?', ':', '.', ',', '+', '-', '*', '/', '%' => true,
            else => false,
        };
    }

    /// `/(?:\?|:|\.|,|&&|\|\||\?\?|\+|-|\*|\/|%|\*\*)$/` on the trimmed text
    fn endsWithContinuation(text: Str) bool {
        const t = js.trimEnd(text);
        if (t.len == 0) return false;
        return isContinuationChar(t[t.len - 1]) or js.endsWith(t, "&&") or js.endsWith(t, "||");
    }

    /// `/^(?:\?|:|\.|,|&&|\|\||\?\?|\+|-|\*|\/|%|\*\*)/` on the trimmed text
    fn startsWithContinuation(text: Str) bool {
        const t = js.trimStart(text);
        if (t.len == 0) return false;
        return isContinuationChar(t[0]) or js.startsWith(t, "&&") or js.startsWith(t, "||");
    }

    fn checkParams(self: *Checker, line: usize, params: []const Str, body: Joined) !void {
        for (params) |name| {
            if (name.len == 0 or self.arg_ignore.matches(name) or js.eql(name, "undefined")) continue;
            if (!try self.bodyMentions(name, body)) try self.report(line, name, .parameter);
        }
    }

    // ---- the line loop ----------------------------------------------------

    /// The line up to a `//` comment outside strings and regexes.
    fn codeOnly(line: Str) Str {
        if (!js.contains(line, '/')) return line;
        var in_str: Quote = .none;
        var in_regex = false;
        var escaped = false;
        var idx: usize = 0;
        while (idx + 1 < line.len) : (idx += 1) {
            const ch = line[idx];
            const next = line[idx + 1];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch == '\\' and (in_str != .none or in_regex)) {
                escaped = true;
                continue;
            }
            if (in_str == .none and !in_regex) {
                if (ch == '\'' or ch == '"' or ch == '`') {
                    in_str = quoteOf(ch);
                } else if (ch == '/') {
                    if (scannerStartsRegex(line, idx)) {
                        in_regex = true;
                    } else if (next == '/') {
                        return line[0..idx];
                    }
                }
            } else if (in_str != .none) {
                if (closes(in_str, ch)) in_str = .none;
            } else if (in_regex and ch == '/') {
                in_regex = false;
            }
        }
        return line;
    }

    /// `stripRegex` in the main loop: regex literals removed, no string tracking.
    fn stripRegex(self: *Checker, str: Str) !Str {
        if (!js.contains(str, '/')) return str;
        const buf = &self.no_regex_buf;
        buf.clearRetainingCapacity();
        try buf.ensureTotalCapacity(self.a, str.len);
        var i: usize = 0;
        while (i < str.len) {
            if (str[i] == '/' and scannerStartsRegex(str, i)) {
                i = skipRegex(str, i + 1);
                continue;
            }
            buf.appendAssumeCapacity(str[i]);
            i += 1;
        }
        return buf.items;
    }

    /// `s.replace(/'(?:[^'\\]|\\.)*'/g, "''")` (or the `"` version).
    ///
    /// From an opening quote the match is deterministic: each `\` takes the
    /// next unit unless it is a line terminator, and the first bare quote
    /// closes. When no quote closes, no later start inside that stretch can
    /// either, so the scan resumes after it.
    fn replaceQuoted(self: *Checker, buf: *Buf, s: Str, q: u16) !Str {
        if (!js.contains(s, q)) return s;
        buf.clearRetainingCapacity();
        try buf.ensureTotalCapacity(self.a, s.len);
        var i: usize = 0;
        while (i < s.len) {
            if (s[i] != q) {
                const next = js.indexOfScalarFrom(s, i, q) orelse s.len;
                buf.appendSliceAssumeCapacity(s[i..next]);
                i = next;
                continue;
            }
            var j = i + 1;
            const closed = while (j < s.len) {
                const c = s[j];
                if (c == q) break true;
                if (c == '\\') {
                    if (j + 1 < s.len and !js.isLineTerminator(s[j + 1])) {
                        j += 2;
                        continue;
                    }
                    break false;
                }
                j += 1;
            } else false;
            if (closed) {
                buf.appendSliceAssumeCapacity(&.{ q, q });
                i = j + 1;
            } else {
                buf.appendSliceAssumeCapacity(s[i..@min(j, s.len)]);
                i = @min(j, s.len);
            }
        }
        return buf.items;
    }

    /// Which of the characters the line scanners act on occur in a line.
    const LineChars = struct {
        slash: bool = false,
        single: bool = false,
        double: bool = false,
        backtick: bool = false,
        eq: bool = false,
        f: bool = false,

        fn of(s: Str) LineChars {
            const bits = js.charsPresent(s, &.{ '/', '\'', '"', '`', '=', 'f' });
            return .{
                .slash = bits & 1 != 0,
                .single = bits & 2 != 0,
                .double = bits & 4 != 0,
                .backtick = bits & 8 != 0,
                .eq = bits & 16 != 0,
                .f = bits & 32 != 0,
            };
        }
    };

    const MainState = struct {
        in_single: bool = false,
        in_double: bool = false,
        escaped: bool = false,
        stack: std.ArrayList(i64) = .empty,
    };

    /// Template bodies masked, with the string/template state carried from
    /// line to line.
    fn maskTemplates(self: *Checker, st: *MainState, code: Str) !Str {
        const buf = &self.masked_buf;
        buf.clearRetainingCapacity();
        // Never longer than the input: `${` is two spaces, a closing backtick none
        try buf.ensureTotalCapacity(self.a, code.len);
        var ci: usize = 0;
        while (ci < code.len) : (ci += 1) {
            // Runs that pass through unchanged: code outside every string and
            // template up to a quote or backtick, a string's text up to its
            // quote or a backslash
            if (!st.escaped) {
                const run_end: ?usize = if (st.in_single)
                    js.indexOfAny(code, ci, &.{ '\'', '\\' })
                else if (st.in_double)
                    js.indexOfAny(code, ci, &.{ '"', '\\' })
                else if (st.stack.items.len == 0)
                    js.indexOfAny(code, ci, &.{ '\'', '"', '`' })
                else
                    ci;
                const end = run_end orelse code.len;
                if (end > ci) {
                    buf.appendSliceAssumeCapacity(code[ci..end]);
                    ci = end;
                    if (ci >= code.len) break;
                }
            }
            const ch = code[ci];
            const top: ?i64 = if (st.stack.items.len > 0) st.stack.items[st.stack.items.len - 1] else null;
            const in_body = top != null and top.? == -1;
            const in_expr = top != null and top.? >= 0;
            if (st.escaped) {
                st.escaped = false;
                buf.appendAssumeCapacity(if (in_body) ' ' else ch);
                continue;
            }
            if (ch == '\\' and (st.in_single or st.in_double or in_body)) {
                st.escaped = true;
                buf.appendAssumeCapacity(if (in_body) ' ' else ch);
                continue;
            }
            if (st.in_single) {
                if (ch == '\'') st.in_single = false;
                buf.appendAssumeCapacity(ch);
                continue;
            }
            if (st.in_double) {
                if (ch == '"') st.in_double = false;
                buf.appendAssumeCapacity(ch);
                continue;
            }
            if (in_body) {
                if (ch == '`') {
                    // The closing backtick is dropped, not blanked
                    _ = st.stack.pop();
                } else if (ch == '$' and ci + 1 < code.len and code[ci + 1] == '{') {
                    st.stack.items[st.stack.items.len - 1] = 0;
                    buf.appendSliceAssumeCapacity(&.{ ' ', ' ' });
                    ci += 1;
                } else {
                    buf.appendAssumeCapacity(' ');
                }
                continue;
            }
            if (in_expr) {
                const t = &st.stack.items[st.stack.items.len - 1];
                switch (ch) {
                    '`' => {
                        try st.stack.append(self.a, -1);
                        buf.appendAssumeCapacity(' ');
                    },
                    '\'' => {
                        st.in_single = true;
                        buf.appendAssumeCapacity(ch);
                    },
                    '"' => {
                        st.in_double = true;
                        buf.appendAssumeCapacity(ch);
                    },
                    '{' => {
                        t.* += 1;
                        buf.appendAssumeCapacity(ch);
                    },
                    '}' => if (t.* > 0) {
                        t.* -= 1;
                        buf.appendAssumeCapacity(ch);
                    } else {
                        t.* = -1;
                        buf.appendAssumeCapacity(' ');
                    },
                    else => buf.appendAssumeCapacity(ch),
                }
                continue;
            }
            switch (ch) {
                '`' => {
                    try st.stack.append(self.a, -1);
                    buf.appendAssumeCapacity(' ');
                },
                '\'' => {
                    st.in_single = true;
                    buf.appendAssumeCapacity(ch);
                },
                '"' => {
                    st.in_double = true;
                    buf.appendAssumeCapacity(ch);
                },
                else => buf.appendAssumeCapacity(ch),
            }
        }
        return buf.items;
    }

    /// `/\bfunction\b/`
    fn findFunctionKeyword(s: Str) ?usize {
        var from: usize = 0;
        while (js.indexOfLit(s, from, "function")) |p| {
            from = p + 1;
            if (p > 0 and js.isWord(s[p - 1])) continue;
            if (p + 8 < s.len and js.isWord(s[p + 8])) continue;
            return p;
        }
        return null;
    }

    fn checkLines(self: *Checker, starts_in_template: []const bool) !void {
        var st: MainState = .{};
        for (self.lines, 0..) |line, i| {
            // Comment-only lines
            if (js.startsWith(js.trimStart(line), "//")) continue;
            // Lines inside a template body are generated code
            if (starts_in_template[i]) continue;

            // One pass for the characters the scanners below act on; a line
            // without them passes through those scanners unchanged
            var has = LineChars.of(line);
            var code_clean = line;
            if (has.slash or has.single or has.double) {
                const code_no_regex = if (has.slash) try self.stripRegex(codeOnly(line)) else line;
                const single = if (has.single) try self.replaceQuoted(&self.single_buf, code_no_regex, '\'') else code_no_regex;
                code_clean = if (has.double) try self.replaceQuoted(&self.double_buf, single, '"') else single;
                if (code_clean.ptr != line.ptr or code_clean.len != line.len) has = LineChars.of(code_clean);
            }
            const plain_line = !st.escaped and !st.in_single and !st.in_double and st.stack.items.len == 0 and
                !has.backtick and !has.single and !has.double;
            if (!plain_line) code_clean = try self.maskTemplates(&st, code_clean);

            if (has.f) {
                if (findFunctionKeyword(code_clean)) |func_idx| {
                    try self.functionParams(i, line, code_clean, func_idx);
                    continue;
                }
            }

            // Every arrow needs a `=>`
            if (!has.eq) continue;
            if (js.indexOfLit(line, 0, "=>")) |arrow_idx| {
                if (js.indexOfLit(code_clean, 0, "=>") != null) {
                    switch (try self.parenArrow(i, line, arrow_idx)) {
                        .done => continue,
                        .fall_through => {},
                    }
                }
            }

            try self.singleParamArrows(i, line, code_clean);
        }
    }

    fn functionParams(self: *Checker, i: usize, line: Str, code_clean: Str, func_idx: usize) !void {
        // Known complex functions with deep nesting that cause false positives
        if (js.indexOfLit(line, 0, "function scanContent") != null or js.indexOfLit(line, 0, "function findMatching") != null) return;
        // `function` as a property name, or a property access
        if (js.startsWith(js.trimStart(code_clean[func_idx + 8 ..]), ":")) return;
        if (js.endsWith(js.trimEnd(code_clean[0..func_idx]), ".")) return;
        // The `(` is looked up in the line at the index found in the cleaned code
        const open_paren = js.indexOfScalarFrom(line, func_idx, '(') orelse return;

        var depth: i64 = 0;
        var close_idx: ?usize = null;
        var close_line = i;
        var ln = i;
        outer: while (ln < self.lines.len) : (ln += 1) {
            const search_line = self.lines[ln];
            var k: usize = if (ln == i) open_paren else 0;
            while (k < search_line.len) : (k += 1) {
                if (search_line[k] == '(') {
                    depth += 1;
                } else if (search_line[k] == ')') {
                    depth -= 1;
                    if (depth == 0) {
                        close_idx = k;
                        close_line = ln;
                        break :outer;
                    }
                }
            }
        }
        const close = close_idx orelse return;

        // The parameter text, joined with spaces when it spans lines
        const buf = &self.params_buf;
        buf.clearRetainingCapacity();
        if (close_line == i) {
            try buf.appendSlice(self.a, line[open_paren + 1 .. close]);
        } else {
            try buf.appendSlice(self.a, line[open_paren + 1 ..]);
            for (self.lines[i + 1 .. close_line]) |mid| {
                try buf.append(self.a, ' ');
                try buf.appendSlice(self.a, mid);
            }
            try buf.append(self.a, ' ');
            try buf.appendSlice(self.a, self.lines[close_line][0..close]);
        }

        // An overload declaration has no body of its own
        if (self.signatureHasNoBody(close_line, close)) return;

        const params = try self.paramNames(buf.items);
        const range = try self.findBodyRange(close_line, close);
        // The body starts after the LAST `{` on the closing line
        const brace = if (range) |r| (if (r.from == close_line) js.lastIndexOfScalar(self.lines[r.from], '{') else null) else null;
        try self.checkParams(i, params, self.bodyText(range, close_line, brace));
    }

    /// The parenthesized-parameter arrow on this line, if any.
    fn parenArrow(self: *Checker, i: usize, line: Str, arrow_idx: usize) !enum { done, fall_through } {
        // Back from `=>` to the `)` of the parameters, past an annotation
        var close_paren: ?usize = null;
        var k = arrow_idx;
        while (k > 0) {
            k -= 1;
            const ch = line[k];
            if (ch == ')') {
                close_paren = k;
                break;
            }
            if (ch != ' ' and ch != '\t' and ch != '\n' and ch != ':' and ch != '>' and !js.isWord(ch)) break;
        }
        const close = close_paren orelse return .fall_through;

        var open_paren: ?usize = null;
        var depth: i64 = 1;
        k = close;
        while (k > 0) {
            k -= 1;
            if (line[k] == ')') {
                depth += 1;
            } else if (line[k] == '(') {
                depth -= 1;
                if (depth == 0) {
                    open_paren = k;
                    break;
                }
            }
        }
        const open = open_paren orelse return .fall_through;

        if (isTypeSignature(line, open)) return .done;

        const param_text = line[open + 1 .. close];
        if (js.trim(param_text).len == 0 and js.indexOfLit(line[open -| 10..open], 0, "async") != null) return .fall_through;
        const params = try self.paramNames(param_text);
        if (params.len == 0) return .fall_through;

        const body = try self.arrowBody(i, line, arrow_idx);
        try self.checkParams(i, params, body);
        return .done;
    }

    /// A block body after the arrow, or an expression body.
    fn arrowBody(self: *Checker, i: usize, line: Str, arrow_idx: usize) !Joined {
        const after_arrow = js.trimStart(line[@min(arrow_idx + 2, line.len)..]);
        if (js.startsWith(after_arrow, "{")) {
            const range = try self.findBodyRange(i, arrow_idx);
            const brace = if (range) |r| (if (r.from == i) js.indexOfScalarFrom(self.lines[r.from], arrow_idx, '{') else null) else null;
            return self.bodyText(range, i, brace);
        }
        return try self.arrowExpressionBody(i, arrow_idx);
    }

    /// Whether the parens opening at `open` are a function type rather
    /// than an arrow's parameters.
    fn isTypeSignature(line: Str, open: usize) bool {
        var angle: i64 = 0;
        var paren: i64 = 0;
        var k = open;
        while (k > 0) {
            k -= 1;
            const ch = line[k];
            if (ch == '>') {
                angle += 1;
                continue;
            }
            if (ch == '<') {
                if (angle > 0) {
                    angle -= 1;
                    continue;
                }
                if (paren <= 0) return true;
                continue;
            }
            if (ch == ':' and angle == 0 and paren <= 0) return true;
            if (angle > 0) continue;
            if (ch == ',') continue;
            if (ch == ')') {
                paren += 1;
                continue;
            }
            if (ch == '(') {
                paren -= 1;
                continue;
            }
            if (ch == '|' or ch == '&') return true;
            if (ch == '=' or ch == '{' or ch == '[') {
                if (paren >= 0) break;
                continue;
            }
            if (ch != ' ' and ch != '\t' and !js.isWord(ch) and ch != '.') {
                if (paren >= 0) break;
            }
        }
        const before = line[0..open];
        return isTypeAliasPrefix(before) or endsWithAs(before);
    }

    /// `/^\s*(?:export\s+)?(?:declare\s+)?type\s+\w[\w$]*\s*(?:<[^>]*>)?\s*=\s*$/`
    fn isTypeAliasPrefix(s_in: Str) bool {
        var s = js.trimStart(s_in);
        inline for (.{ "export", "declare" }) |word| {
            if (js.startsWith(s, word)) {
                const rest = js.trimStart(s[word.len..]);
                if (rest.len < s.len - word.len) s = rest;
            }
        }
        if (!js.startsWith(s, "type")) return false;
        var rest = js.trimStart(s[4..]);
        if (rest.len == s.len - 4) return false;
        if (rest.len == 0 or !js.isWord(rest[0])) return false;
        var k: usize = 1;
        while (k < rest.len and js.isIdent(rest[k])) k += 1;
        rest = js.trimStart(rest[k..]);
        if (rest.len > 0 and rest[0] == '<') {
            const close = js.indexOfScalar(rest, '>') orelse return false;
            rest = js.trimStart(rest[close + 1 ..]);
        }
        if (rest.len == 0 or rest[0] != '=') return false;
        return js.trimStart(rest[1..]).len == 0;
    }

    /// `/\bas\s+$/`
    fn endsWithAs(s: Str) bool {
        const t = js.trimEnd(s);
        if (t.len == s.len or !js.endsWith(t, "as")) return false;
        return t.len == 2 or !js.isWord(t[t.len - 3]);
    }

    /// `/\)\s*:\s*[$A-Z_][\w$]*\s+is$/i` on a right-trimmed string
    fn isTypePredicate(t: Str) bool {
        if (t.len < 2) return false;
        const i_ch = t[t.len - 2];
        const s_ch = t[t.len - 1];
        if ((i_ch != 'i' and i_ch != 'I') or (s_ch != 's' and s_ch != 'S')) return false;
        var k = t.len - 2;
        const ws_end = k;
        while (k > 0 and js.isWs(t[k - 1])) k -= 1;
        if (k == ws_end) return false;
        const ident_end = k;
        while (k > 0 and js.isIdent(t[k - 1])) k -= 1;
        if (k == ident_end or !js.isIdentStart(t[k])) return false;
        while (k > 0 and js.isWs(t[k - 1])) k -= 1;
        if (k == 0 or t[k - 1] != ':') return false;
        k -= 1;
        while (k > 0 and js.isWs(t[k - 1])) k -= 1;
        return k > 0 and t[k - 1] == ')';
    }

    fn isTsTypeKeyword(name: Str) bool {
        inline for (.{ "string", "number", "boolean", "void", "never", "any", "unknown", "object", "bigint", "symbol", "undefined", "null" }) |kw| {
            if (js.eql(name, kw)) return true;
        }
        return false;
    }

    fn isArrowLead(c: u16) bool {
        return c == '=' or c == ',' or c == ':' or c == '(' or c == '{' or js.isWs(c);
    }

    /// `/(?:^|[=,:({\s])\s*([$A-Z_][\w$]*)\s*=>/gi` from `p`: the identifier
    /// and the end of the match.
    const ArrowMatch = struct { name_start: usize, name_end: usize, end: usize };

    /// The match at `p`, or where the next one can start: a failed attempt
    /// after a lead character fails the same way from every whitespace unit
    /// that follows it, so those are skipped.
    fn singleArrowAt(s: Str, p: usize) union(enum) { match: ArrowMatch, next: usize } {
        var next = p + 1;
        var alt: u2 = 0;
        while (alt < 2) : (alt += 1) {
            var q = p;
            if (alt == 0) {
                if (p != 0) continue;
            } else {
                if (p >= s.len or !isArrowLead(s[p])) continue;
                q = p + 1;
            }
            while (q < s.len and js.isWs(s[q])) q += 1;
            if (alt == 1) next = @max(next, q);
            if (q >= s.len or !js.isIdentStart(s[q])) continue;
            const name_start = q;
            while (q < s.len and js.isIdent(s[q])) q += 1;
            const name_end = q;
            while (q < s.len and js.isWs(s[q])) q += 1;
            if (js.startsWithAt(s, q, "=>")) return .{ .match = .{ .name_start = name_start, .name_end = name_end, .end = q + 2 } };
        }
        return .{ .next = next };
    }

    fn singleParamArrows(self: *Checker, i: usize, line: Str, code_clean: Str) !void {
        // Every match ends in `=>`
        if (js.indexOfLit(code_clean, 0, "=>") == null) return;
        var p: usize = 0;
        while (p < code_clean.len) {
            const m = switch (singleArrowAt(code_clean, p)) {
                .match => |m| m,
                .next => |n| {
                    p = n;
                    continue;
                },
            };
            p = m.end;
            const name = code_clean[m.name_start..m.name_end];
            if (self.arg_ignore.matches(name) or js.eql(name, "undefined")) continue;
            // Return type annotations: `): Type =>` and `(x): x is Type =>`
            const before_match = js.trimEnd(code_clean[0..m.name_start]);
            if (js.endsWith(before_match, ":") and js.endsWith(js.trimEnd(before_match[0 .. before_match.len - 1]), ")")) continue;
            if (isTypePredicate(before_match)) continue;
            if (isTsTypeKeyword(name)) continue;

            // `\b${name}\s*=>` in the original line; a `$` in the name is an
            // anchor there and never matches
            if (js.contains(name, '$')) continue;
            const match_text = findNamedArrow(line, name) orelse continue;
            const arrow_idx = js.indexOf(line, match_text).? + match_text.len - 2;
            const body = try self.arrowBody(i, line, arrow_idx);
            if (!try self.bodyMentions(name, body)) try self.report(i, name, .parameter);
        }
    }

    /// The text of the first `\b${name}\s*=>` match in `line`.
    fn findNamedArrow(line: Str, name: Str) ?Str {
        var from: usize = 0;
        while (js.indexOfFrom(line, from, name)) |p| {
            from = p + 1;
            if (p > 0 and js.isWord(line[p - 1])) continue;
            var q = p + name.len;
            while (q < line.len and js.isWs(line[q])) q += 1;
            if (js.startsWithAt(line, q, "=>")) return line[p .. q + 2];
        }
        return null;
    }
};

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    // The rule's own source, and ambient declaration files, are skipped
    if (std.mem.endsWith(u8, ctx.file_path, "/no-unused-vars.ts")) return;
    if (std.mem.endsWith(u8, ctx.file_path, ".d.ts")) return;
    const a = ctx.allocator;

    var vars_pattern: []const u8 = "^_";
    var args_pattern: []const u8 = "^_";
    if (ctx.options) |opts| {
        if (opts == .object) {
            if (opts.object.get("varsIgnorePattern")) |v| {
                if (v == .string) vars_pattern = v.string;
            }
            if (opts.object.get("argsIgnorePattern")) |v| {
                if (v == .string) args_pattern = v.string;
            }
        }
    }
    // A pattern this engine cannot run leaves the file to TypeScript
    const var_ignore = Pattern.compile(a, vars_pattern) catch return error.Declined;
    const arg_ignore = Pattern.compile(a, args_pattern) catch return error.Declined;

    const text = try js.toUtf16(a, ctx.content);
    const lexed = try lexer.lexSource(a, @as([]const u16, text));
    const code = try lexer.maskSource(a, @as([]const u16, text), .{ .comments = true }, lexed);
    const lines = try js.splitLines(a, code);
    // The lines start where the text's do: masking keeps every offset
    const line_starts = try a.alloc(usize, lines.len);
    for (lines, line_starts) |l, *s| s.* = (@intFromPtr(l.ptr) - @intFromPtr(code.ptr)) / 2;
    const starts_in_template = try lexer.lineStartsInTemplateAt(a, line_starts, lexed);

    var checker: Checker = .{
        .a = a,
        .code = code,
        .lines = lines,
        .out = out,
        .var_ignore = var_ignore,
        .arg_ignore = arg_ignore,
        .vars_pattern = vars_pattern,
        .args_pattern = args_pattern,
    };
    try checker.checkDeclarations(starts_in_template);
    try checker.checkLines(starts_in_template);
}
