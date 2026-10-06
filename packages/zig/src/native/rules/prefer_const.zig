//! `general/prefer-const` - port of packages/pickier/src/rules/general/prefer-const.ts
//!
//! A line outside template bodies that matches `/^\s*(?:let|var)\s+(.+?);?\s*$/`
//! declares names (`analyzeLetDecl`); each one with an initializer that no
//! check finds reassigned is reported. The checks, any of which settles it:
//!
//!   1. `\bname\s*(?:>>>=|**=|...|=)` in the initializer after the first `=`;
//!   2. the same over `rest` - the text with the first occurrence of the
//!      line's text replaced by `'\n'` (`text.indexOf(line)`);
//!   3. `(?:^|[^$\w])(?:\+\+|--)\s*name\b|\bname\s*(?:\+\+|--)` over `rest`,
//!      written in a template literal, where `\w` is `w`: `[^$w]`;
//!   4. `destructuringReassignsName(rest, name)`.
//!
//! The TypeScript rule builds `rest` and runs each regex over all of it, for
//! every name. Here `rest` is read in place (pc_rest_walk.zig) and the regexes
//! are answered from the places the name occurs. With no `$` in it a name is
//! all `\w`, and every check needs it as a whole `\w` run: (1)-(3) require
//! `\b` before it and a non-word character (space, operator) after it, and the
//! object-pattern regexes in (4) need a space, `,`, `{`, `:` or the pattern's
//! start before it and a space, `:`, `,`, `=` or `}` after it. So the checks
//! look only at the `\w` runs of `rest` equal to the name: the text's runs,
//! less those touching the removed line, plus the parts of the at most two
//! runs the removed line cut. The bracket groups of (4) are found once per
//! declaration line, from a walk of the whole text made once per file.
//!
//! A name with `$` is built into the regexes unescaped, where `$` is the end
//! of input: a `$` followed by anything else never matches, and `P$` (P all
//! `\w`, possibly empty) only matches at the very end of `rest` or of a
//! pattern. Those are checked as such.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const lexer = @import("pc_lexer.zig");
const rw = @import("pc_rest_walk.zig");

const Rest = rw.Rest;
const Allocator = std.mem.Allocator;

const Part = struct {
    name: []const u8,
    /// `part.slice(part.indexOf('=') + 1)`
    init: []const u8,
};

const Decl = struct {
    line_no: u32,
    /// Byte offset of the line in the text
    pos: usize,
    line: []const u8,
    parts: []const Part,
};

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const t = ctx.content;

    var decls: std.ArrayList(Decl) = .empty;
    var line_no: u32 = 0;
    var start: usize = 0;
    while (true) {
        line_no += 1;
        const nl = std.mem.indexOfScalarPos(u8, t, start, '\n');
        var end = nl orelse t.len;
        if (nl != null and end > start and t[end - 1] == '\r') end -= 1;
        const line = t[start..end];
        if (declBody(line)) |body| {
            if (try parseParts(a, body)) |parts| {
                if (parts.len > 0) try decls.append(a, .{ .line_no = line_no, .pos = start, .line = line, .parts = parts });
            }
        }
        start = (nl orelse break) + 1;
    }
    if (decls.items.len == 0) return;

    // Whether a line starts in a template body only matters for a name that
    // would be reported (every check is pure), so the file is lexed only then
    var in_template: ?[]bool = null;
    var file: File = .{ .t = t, .a = a, .decls = decls.items };
    for (decls.items) |d| {
        for (d.parts) |p| {
            if (try file.reassigned(p, d)) continue;
            if (in_template == null) in_template = try lexer.lineStartsInTemplate(a, t);
            if (in_template.?[d.line_no - 1]) break;
            const idx = wordSearch(d.line, p.name) orelse std.mem.indexOf(u8, d.line, p.name).?;
            try out.append(a, .{
                .line = d.line_no,
                .column = @intCast(text.utf16Index(d.line, idx) + 1),
                .rule_id = "prefer-const",
                .message = try std.fmt.allocPrint(a, "'{s}' is never reassigned. Use 'const' instead", .{p.name}),
                .severity = .@"error",
                .help = try std.fmt.allocPrint(a, "Change 'let {s}' to 'const {s}' since the variable is never reassigned. This makes your code more predictable and prevents accidental mutations", .{ p.name, p.name }),
            });
        }
    }
}

/// `/\w/`
inline fn isWord(c: u8) bool {
    return text.isWordByte(c);
}

/// `\s*` from `i` in a plain string.
fn skipSpace(s: []const u8, from: usize) usize {
    var i = from;
    while (i < s.len) {
        const c = s[i];
        if (c < 0x80) {
            if (!text.isAsciiSpace(c)) break;
            i += 1;
            continue;
        }
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) break;
        i += n;
    }
    return i;
}

/// `(.+?)` of `/^\s*(?:let|var)\s+(.+?);?\s*$/`, or null when the line does
/// not match or (only whitespace after the keyword) declares nothing.
///
/// `\s+` takes the whole run of whitespace: giving some back only matters
/// when nothing follows it. The lazy group then ends where the rest is
/// `;?\s*` - before a final `;` if the group keeps a character, else at the
/// trimmed end. `.` stops at line terminators, so one inside fails the match.
fn declBody(line: []const u8) ?[]const u8 {
    var i = skipSpace(line, 0);
    if (!std.mem.startsWith(u8, line[i..], "let") and !std.mem.startsWith(u8, line[i..], "var")) return null;
    i += 3;
    const ws = i;
    i = skipSpace(line, i);
    if (i == ws or i >= line.len) return null;
    const trimmed_end = text.trimEnd(line).len;
    var e = trimmed_end;
    if (line[e - 1] == ';' and e - 1 > i) e -= 1;
    const body = line[i..e];
    if (std.mem.indexOfScalar(u8, body, '\r') != null) return null;
    if (std.mem.indexOf(u8, body, "\u{2028}") != null or std.mem.indexOf(u8, body, "\u{2029}") != null) return null;
    return body;
}

/// `findTopLevelEquals`
fn findTopLevelEquals(s: []const u8) ?usize {
    var depth: isize = 0;
    for (s, 0..) |c, i| {
        switch (c) {
            '{', '(', '[', '<' => depth += 1,
            '}', ')', ']', '>' => depth -= 1,
            '=' => {
                if (depth != 0) continue;
                if (i + 1 < s.len and s[i + 1] == '=') continue;
                if (i > 0 and (s[i - 1] == '!' or s[i - 1] == '<' or s[i - 1] == '>')) continue;
                return i;
            },
            else => {},
        }
    }
    return null;
}

/// The declared names of `analyzeLetDecl`, or null where it returns null.
fn parseParts(a: Allocator, body: []const u8) !?[]const Part {
    var after = body;
    if (findTopLevelEquals(after)) |eq| {
        if (std.mem.indexOfScalar(u8, after, ':')) |colon| {
            if (colon < eq) after = try std.mem.concat(a, u8, &.{ after[0..colon], after[eq..] });
        }
    }

    var parts: std.ArrayList(Part) = .empty;
    // splitTopLevel(after, ',')
    var depth: isize = 0;
    var from: usize = 0;
    var in_str: u8 = 0;
    var escaped = false;
    var i: usize = 0;
    while (i <= after.len) : (i += 1) {
        if (i < after.len) {
            const c = after[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\' and in_str != 0) {
                escaped = true;
                continue;
            }
            if (in_str == 0) {
                switch (c) {
                    '\'', '"', '`' => in_str = c,
                    '(', '{', '[' => depth += 1,
                    ')', '}', ']' => depth -= 1,
                    ',' => if (depth != 0) continue,
                    else => {},
                }
                if (c != ',' or depth != 0) continue;
            } else {
                if (c == in_str) in_str = 0;
                continue;
            }
        }
        // A part ends here
        const part = text.trim(after[from..i]);
        from = i + 1;
        if (part.len == 0) continue;
        // Destructuring, or no plain name: not something the rule handles
        if (part[0] == '{' or part[0] == '[') return null;
        if (!(std.ascii.isAlphabetic(part[0]) or part[0] == '_' or part[0] == '$')) return null;
        var n: usize = 1;
        while (n < part.len and text.isIdentByte(part[n])) n += 1;
        const eq = std.mem.indexOfScalar(u8, part, '=') orelse return null;
        try parts.append(a, .{ .name = part[0..n], .init = part[eq + 1 ..] });
    }
    return parts.items;
}

/// `line.search(/\bname\b/)` with `$` escaped (a literal `$`, not a word character).
fn wordSearch(line: []const u8, name: []const u8) ?usize {
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, line, from, name)) |p| {
        if (boundaryAt(line, p) and boundaryAt(line, p + name.len)) return p;
        from = p + 1;
    }
    return null;
}

/// `\b` at offset `i` of `s`.
fn boundaryAt(s: []const u8, i: usize) bool {
    const before = i > 0 and isWord(s[i - 1]);
    const after = i < s.len and isWord(s[i]);
    return before != after;
}

/// Whether `s` (a plain string or a `Rest`) has `lit` at `k`.
fn hasAt(src: anytype, k: usize, lit: []const u8) bool {
    if (k + lit.len > src.len()) return false;
    for (lit, 0..) |c, j| {
        if (src.at(k + j) != c) return false;
    }
    return true;
}

/// One of the assignment operators at `k` (`=` alone covers `==` and `=>`).
fn assignOpAt(src: anytype, k: usize) bool {
    if (k >= src.len()) return false;
    return switch (src.at(k)) {
        '=' => true,
        '>' => hasAt(src, k, ">>>=") or hasAt(src, k, ">>="),
        '*' => hasAt(src, k, "**=") or hasAt(src, k, "*="),
        '<' => hasAt(src, k, "<<="),
        '?' => hasAt(src, k, "??="),
        '|' => hasAt(src, k, "||=") or hasAt(src, k, "|="),
        '&' => hasAt(src, k, "&&=") or hasAt(src, k, "&="),
        '+', '-', '/', '%', '^' => hasAt(src, k + 1, "="),
        else => false,
    };
}

fn incDecAt(src: anytype, k: usize) bool {
    return hasAt(src, k, "++") or hasAt(src, k, "--");
}

const Plain = struct {
    s: []const u8,
    fn len(self: Plain) usize {
        return self.s.len;
    }
    fn at(self: Plain, i: usize) u8 {
        return self.s[i];
    }
};

/// Check 1: `\bname\s*(?:ops)` in `s`, for a name without `$`.
fn assignedIn(s: []const u8, name: []const u8) bool {
    var i: usize = 0;
    while (i < s.len) {
        if (!isWord(s[i])) {
            i += 1;
            continue;
        }
        const run = i;
        while (i < s.len and isWord(s[i])) i += 1;
        if (!std.mem.eql(u8, s[run..i], name)) continue;
        if (assignOpAt(Plain{ .s = s }, skipSpace(s, i))) return true;
    }
    return false;
}

/// `\s*` from `i` in rest, not past `hi`.
fn restSkipSpace(rest: Rest, from: usize, hi: usize) usize {
    var i = from;
    while (i < hi) {
        const n = rest.wsLenAt(i);
        if (n == 0) break;
        i += n;
    }
    return i;
}

/// `\s*` backwards from `i` in rest, not before `lo`.
fn restSkipSpaceBack(rest: Rest, from: usize, lo: usize) usize {
    var i = from;
    while (i > lo) {
        const n = rest.wsLenBefore(i);
        if (n == 0) break;
        i -= n;
    }
    return i;
}

/// `(?:^|[^$\w])(?:\+\+|--)\s*` ending at rest index `o` - as the rule
/// builds it, in a template literal, where `\w` is just `w`: the class is
/// `[^$w]`, so `x++name` counts and `w++name` does not.
fn incDecBefore(rest: Rest, o: usize) bool {
    const t0 = restSkipSpaceBack(rest, o, 0);
    if (t0 < 2) return false;
    const c = rest.at(t0 - 1);
    if ((c != '+' and c != '-') or rest.at(t0 - 2) != c) return false;
    if (t0 == 2) return true;
    const before = rest.at(t0 - 3);
    return before != '$' and before != 'w';
}

/// Offsets of `let` and `var` at the end of a `\w` run that is not the end
/// of the text, all and by the 8 bytes from there.
const Keywords = struct {
    all: std.ArrayList(usize) = .empty,
    by_prefix: std.AutoHashMap(u64, std.ArrayList(usize)),
};

/// `/\w/` by byte
const word_bytes: [256]bool = blk: {
    var table: [256]bool = @splat(false);
    for (0..256) |c| table[c] = text.isWordByte(@intCast(c));
    break :blk table;
};

fn prefixKey(s: []const u8) u64 {
    return std.mem.readInt(u64, s[0..8], .little);
}

/// A bit per `/\w/` byte of the 64.
fn wordMask(block: *const [64]u8) u64 {
    const V = @Vector(64, u8);
    const v: V = block.*;
    const none: @Vector(64, bool) = @splat(false);
    // Setting bit 5 folds A-Z onto a-z and moves no other byte there
    const lower = v | @as(V, @splat(0x20));
    const alpha = @select(bool, lower >= @as(V, @splat('a')), lower <= @as(V, @splat('z')), none);
    const digit = @select(bool, v >= @as(V, @splat('0')), v <= @as(V, @splat('9')), none);
    const under = v == @as(V, @splat('_'));
    // alpha or digit or under
    const word = @select(bool, alpha, alpha, @select(bool, digit, digit, under));
    return @bitCast(word);
}

/// What `prepare` collects from each run.
const Runs = struct {
    t: []const u8,
    a: Allocator,
    kw: Keywords,
    map: std.StringHashMap(std.ArrayList(usize)),
    /// The names' first two bytes (the second 0 for a one-byte name), and
    /// lengths (all at least 64 share the top bit), to skip most lookups
    pairs: [1 << 10]u64 = @splat(0),
    lengths: u64 = 0,

    fn addName(self: *Runs, name: []const u8) void {
        const k = pairKey(name);
        self.pairs[k >> 6] |= @as(u64, 1) << @intCast(k & 63);
        self.lengths |= lengthBit(name.len);
    }

    fn hasPair(self: *const Runs, s: []const u8) bool {
        const k = pairKey(s);
        return self.pairs[k >> 6] & (@as(u64, 1) << @intCast(k & 63)) != 0;
    }

    fn pairKey(s: []const u8) usize {
        return (@as(usize, s[0]) << 8) | (if (s.len > 1) s[1] else 0);
    }

    fn lengthBit(n: usize) u64 {
        return @as(u64, 1) << @intCast(@min(n, 63));
    }

    fn add(self: *Runs, s: usize, e: usize) !void {
        const t = self.t;
        const n = e - s;
        // A declaration line has whitespace right after its keyword, so
        // wherever its text occurs the keyword ends a run
        if (n >= 3 and e < t.len) {
            const x = e - 3;
            const c = t[x];
            if ((c == 'l' and t[x + 1] == 'e' and t[x + 2] == 't') or (c == 'v' and t[x + 1] == 'a' and t[x + 2] == 'r')) {
                try self.kw.all.append(self.a, x);
                if (x + 8 <= t.len) {
                    const gop = try self.kw.by_prefix.getOrPut(prefixKey(t[x..]));
                    if (!gop.found_existing) gop.value_ptr.* = .empty;
                    try gop.value_ptr.append(self.a, x);
                }
            }
        }
        if (self.lengths & lengthBit(n) == 0 or !self.hasPair(t[s..e])) return;
        if (self.map.getPtr(t[s..e])) |list| try list.append(self.a, s);
    }
};

const File = struct {
    t: []const u8,
    a: Allocator,
    decls: []const Decl,
    /// Text offsets of the `\w` runs equal to each declared name
    index: ?std.StringHashMap(std.ArrayList(usize)) = null,
    walk: ?rw.TextWalk = null,
    groups: std.AutoHashMap([2]usize, rw.RestGroups) = undefined,
    groups_ready: bool = false,
    keywords: ?Keywords = null,
    /// The names of one line share their rest
    last_rest: ?struct { pos: usize, rest: Rest } = null,

    fn reassigned(self: *File, p: Part, d: Decl) !bool {
        const name = p.name;
        if (std.mem.indexOfScalar(u8, name, '$')) |dollar| return self.reassignedDollar(name, dollar, d);

        // 1. In the initializer
        if (assignedIn(p.init, name)) return true;

        const rest = try self.restOf(d);
        const occ = try self.restOccurrences(name, rest);

        // 2. and 3. over rest
        const len = rest.len();
        for (occ) |o| {
            const k = restSkipSpace(rest, o + name.len, len);
            if (assignOpAt(rest, k) or incDecAt(rest, k)) return true;
            if (incDecBefore(rest, o)) return true;
        }

        // 4. Destructuring
        if (occ.len == 0) return false;
        const rg = try self.restGroups(rest);
        var i: usize = 0;
        while (i < occ.len) {
            const g = rg.containing(occ[i]) orelse {
                i += 1;
                continue;
            };
            // Array pattern: any occurrence is a binding
            if (g.open == '[') return true;
            // Object pattern: a binding unless every occurrence is only a key
            const lo = g.start + 1;
            const hi = g.end;
            var key_only = false;
            var value_after_colon = false;
            var shorthand = false;
            while (i < occ.len and occ[i] < hi) : (i += 1) {
                const o = occ[i];
                const k = restSkipSpace(rest, o + name.len, hi);
                const next: u8 = if (k < hi) rest.at(k) else 0;
                // `\bname\b\s*:`
                if (next == ':') key_only = true;
                // `:\s*\bname\b`
                const b = restSkipSpaceBack(rest, o, lo);
                if (b > lo and rest.at(b - 1) == ':') value_after_colon = true;
                // `(?:^|[\s,{])\s*name\s*(?:,|\s*=|\s*})`
                const before_ok = o == lo or rest.wsLenBefore(o) > 0 or rest.at(o - 1) == ',' or rest.at(o - 1) == '{';
                if (before_ok and (next == ',' or next == '=' or next == '}')) shorthand = true;
            }
            if (!(key_only and !value_after_colon and !shorthand)) return true;
        }
        return false;
    }

    /// A name with `$`: only `P$...$` (P all `\w`) can match anything, and
    /// only at the end of rest or of a pattern's inside.
    fn reassignedDollar(self: *File, name: []const u8, dollar: usize, d: Decl) !bool {
        for (name[dollar..]) |c| {
            if (c != '$') return false;
        }
        const prefix = name[0..dollar];
        const rest = try self.restOf(d);
        const len = rest.len();

        // 3. `(?:^|[^$\w])(?:\+\+|--)\s*P$\b`: rest ends with ++P / --P
        if (prefix.len > 0 and len >= prefix.len and hasAt(rest, len - prefix.len, prefix)) {
            if (incDecBefore(rest, len - prefix.len)) return true;
        }

        // 4. `\bP$\b` at the end of a pattern's inside; the key-only test
        // needs input after the `$`, so it never refutes
        const rg = try self.restGroups(rest);
        const Ctx = struct { rest: Rest, prefix: []const u8 };
        return rg.each(Ctx{ .rest = rest, .prefix = prefix }, struct {
            fn f(c: Ctx, g: rw.Group) bool {
                const lo = g.start + 1;
                const hi = g.end;
                if (c.prefix.len == 0) return hi > lo and isWord(c.rest.at(hi - 1));
                if (hi - lo < c.prefix.len) return false;
                const at = hi - c.prefix.len;
                if (!hasAt(c.rest, at, c.prefix)) return false;
                return at == lo or !isWord(c.rest.at(at - 1));
            }
        }.f);
    }

    /// `rest` for a declaration line: `text.indexOf(line)` is its first occurrence.
    ///
    /// The line is `\s*` then `let` or `var`, so any occurrence has that
    /// keyword after the same leading whitespace. The keyword's offsets in
    /// the text are bucketed by the 8 bytes from there; only those whose
    /// bytes match the line's are compared.
    fn restOf(self: *File, d: Decl) !Rest {
        if (self.last_rest) |last| {
            if (last.pos == d.pos) return last.rest;
        }
        const t = self.t;
        const line = d.line;
        const lead = skipSpace(line, 0);
        const core = line[lead..];
        const kw = try self.getKeywords();
        const candidates = if (core.len >= 8)
            (if (kw.by_prefix.getPtr(prefixKey(core))) |l| l.items else &[_]usize{})
        else
            kw.all.items;
        var r = d.pos;
        for (candidates) |q| {
            if (q < lead) continue;
            const at = q - lead;
            if (at >= d.pos) break;
            if (std.mem.eql(u8, t[at .. at + line.len], line)) {
                r = at;
                break;
            }
        }
        const rest: Rest = .{ .t = t, .r = r, .l = line.len };
        self.last_rest = .{ .pos = d.pos, .rest = rest };
        return rest;
    }

    fn getKeywords(self: *File) !*Keywords {
        try self.prepare();
        return &self.keywords.?;
    }

    /// The rest offsets of the `\w` runs of rest equal to `name`, in order.
    fn restOccurrences(self: *File, name: []const u8, rest: Rest) ![]const usize {
        const t = self.t;
        const index = try self.getIndex();
        const at_text = if (index.getPtr(name)) |l| l.items else &[_]usize{};
        const r = rest.r;
        const line_end = r + rest.l;
        var out: std.ArrayList(usize) = try .initCapacity(self.a, at_text.len + 2);

        var k: usize = 0;
        while (k < at_text.len and at_text[k] + name.len <= r) : (k += 1) out.appendAssumeCapacity(at_text[k]);
        // The run the line's start cut, up to the inserted '\n'
        if (r > 0 and isWord(t[r - 1]) and isWord(t[r])) {
            var s = r - 1;
            while (s > 0 and isWord(t[s - 1])) s -= 1;
            if (std.mem.eql(u8, t[s..r], name)) out.appendAssumeCapacity(s);
        }
        // The run the line's end cut, from after the inserted '\n'
        if (line_end < t.len and isWord(t[line_end - 1]) and isWord(t[line_end])) {
            var e = line_end;
            while (e < t.len and isWord(t[e])) e += 1;
            if (std.mem.eql(u8, t[line_end..e], name)) out.appendAssumeCapacity(r + 1);
        }
        while (k < at_text.len and at_text[k] < line_end) k += 1;
        while (k < at_text.len) : (k += 1) out.appendAssumeCapacity(at_text[k] - rest.l + 1);
        return out.items;
    }

    fn getIndex(self: *File) !*std.StringHashMap(std.ArrayList(usize)) {
        try self.prepare();
        return &self.index.?;
    }

    /// One pass over the text's `\w` runs: where each declared name is a
    /// whole run, and where `let` and `var` are (all `\w`, so inside runs).
    fn prepare(self: *File) !void {
        if (self.index != null) return;
        var runs: Runs = .{
            .t = self.t,
            .a = self.a,
            .kw = .{ .by_prefix = std.AutoHashMap(u64, std.ArrayList(usize)).init(self.a) },
            .map = std.StringHashMap(std.ArrayList(usize)).init(self.a),
        };
        for (self.decls) |d| {
            for (d.parts) |p| {
                if (std.mem.indexOfScalar(u8, p.name, '$') != null) continue;
                const gop = try runs.map.getOrPut(p.name);
                if (!gop.found_existing) gop.value_ptr.* = .empty;
                runs.addName(p.name);
            }
        }

        // 64 bytes at a time: a bit per `\w` byte gives where runs start
        const t = self.t;
        var base: usize = 0;
        var carry: u64 = 0;
        while (base + 64 <= t.len) : (base += 64) {
            const m = wordMask(t[base..][0..64]);
            var starts = m & ~((m << 1) | carry);
            carry = m >> 63;
            while (starts != 0) {
                const bit: u6 = @intCast(@ctz(starts));
                starts &= starts - 1;
                const s = base + bit;
                const after = ~m >> bit;
                var e: usize = undefined;
                if (after != 0) {
                    e = s + @ctz(after);
                } else {
                    e = base + 64;
                    while (e < t.len and word_bytes[t[e]]) e += 1;
                }
                try runs.add(s, e);
            }
        }
        var i = base;
        // The rest of a run that started in the last block is done
        if (carry != 0) {
            while (i < t.len and word_bytes[t[i]]) i += 1;
        }
        while (i < t.len) {
            if (!word_bytes[t[i]]) {
                i += 1;
                continue;
            }
            const s = i;
            i += 1;
            while (i < t.len and word_bytes[t[i]]) i += 1;
            try runs.add(s, i);
        }
        self.index = runs.map;
        self.keywords = runs.kw;
    }

    fn restGroups(self: *File, rest: Rest) !*const rw.RestGroups {
        if (!self.groups_ready) {
            self.groups = std.AutoHashMap([2]usize, rw.RestGroups).init(self.a);
            self.walk = try rw.TextWalk.build(self.a, self.t);
            self.groups_ready = true;
        }
        // Lines with the same text share their first occurrence, and so rest
        const gop = try self.groups.getOrPut(.{ rest.r, rest.l });
        if (!gop.found_existing) gop.value_ptr.* = try rw.restGroups(self.a, &self.walk.?, rest);
        return gop.value_ptr;
    }
};

test "the name index finds every whole run" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var block: [64]u8 = undefined;
    for (0..4) |k| {
        for (&block, 0..) |*c, j| c.* = @intCast(k * 64 + j);
        const m = wordMask(&block);
        for (block, 0..) |c, j| try std.testing.expectEqual(word_bytes[c], (m >> @intCast(j)) & 1 == 1);
    }
    var prng = std.Random.DefaultPrng.init(7);
    const random = prng.random();
    const alphabet = "ab_1 .let\n\xC3\xA9var";
    const parts = [_]Part{ .{ .name = "ab", .init = "" }, .{ .name = "a", .init = "" }, .{ .name = "b_1", .init = "" }, .{ .name = "let", .init = "" } };
    const decls = [_]Decl{.{ .line_no = 1, .pos = 0, .line = "", .parts = &parts }};
    for (0..200) |_| {
        const t = try a.alloc(u8, random.intRangeAtMost(usize, 0, 300));
        for (t) |*c| c.* = alphabet[random.uintLessThan(usize, alphabet.len)];
        var file: File = .{ .t = t, .a = a, .decls = &decls };
        const index = try file.getIndex();
        for (parts) |p| {
            var want: std.ArrayList(usize) = .empty;
            var i: usize = 0;
            while (i < t.len) {
                if (!isWord(t[i])) {
                    i += 1;
                    continue;
                }
                const s = i;
                while (i < t.len and isWord(t[i])) i += 1;
                if (std.mem.eql(u8, t[s..i], p.name)) try want.append(a, s);
            }
            try std.testing.expectEqualSlices(usize, want.items, index.get(p.name).?.items);
        }
    }
}

test "declBody" {
    try std.testing.expectEqualStrings("x = 1", declBody("  let x = 1;  ").?);
    try std.testing.expectEqualStrings(";", declBody("let ;").?);
    try std.testing.expectEqualStrings("x = 1;", declBody("let x = 1;;").?);
    try std.testing.expect(declBody("letx = 1") == null);
    try std.testing.expect(declBody("let x\r= 1") == null);
    try std.testing.expectEqualStrings("x = 1", declBody("let x = 1\r").?);
}
