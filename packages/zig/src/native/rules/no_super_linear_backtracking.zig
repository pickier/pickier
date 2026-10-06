//! `regexp/no-super-linear-backtracking` - port of packages/pickier/src/rules/regexp/no-super-linear-backtracking.ts
//!
//! A heuristic over every `/.../` the literal regex finds in the raw text,
//! skipping those that start inside a comment (by the TypeScript rule's own
//! block- and line-comment scans) or look like division. Reports with the
//! bare rule id `no-super-linear-backtracking`, as the TypeScript rule does.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const re = @import("re_text.zig");

const rule_id = "no-super-linear-backtracking";
const msg_exchangeable = "The combination of ' .*' or ' .+?' with '\\s*' can cause super-linear backtracking due to exchangeable characters";
const msg_adjacent = "Multiple adjacent unlimited wildcard quantifiers can cause super-linear backtracking";
const msg_nested = "Nested unlimited quantifiers detected (e.g., (.+)+) which can cause catastrophic backtracking";

const Range = struct { start: usize, end: usize };

/// Where `/\/[^/\\\n]*(?:\\.[^/\\\n]*)*\//` ends when tried at `start`, or
/// where it fails.
const Literal = union(enum) { end: usize, fail: usize };

fn matchLiteral(s: []const u8, start: usize) Literal {
    var i = start + 1;
    while (i < s.len) {
        switch (s[i]) {
            '/' => return .{ .end = i + 1 },
            '\n' => return .{ .fail = i },
            '\\' => {
                const n = re.dotLenAt(s, i + 1);
                if (n == 0) return .{ .fail = i };
                i += 1 + n;
            },
            else => i += 1,
        }
    }
    return .{ .fail = s.len };
}

/// Ranges of one comment kind, queried with increasing indexes.
const Cursor = struct {
    ranges: []const Range,
    next: usize = 0,

    fn contains(self: *Cursor, idx: usize) bool {
        while (self.next < self.ranges.len and self.ranges[self.next].end <= idx) self.next += 1;
        return self.next < self.ranges.len and self.ranges[self.next].start <= idx;
    }
};

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const s = ctx.content;
    const a = ctx.allocator;

    // `/\/\*[\s\S]*?\*\//g` and `/\/\/[^\n]*/g`, each over the whole text
    var blocks: std.ArrayList(Range) = .empty;
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, s, from, "/*")) |open| {
        const close = std.mem.indexOfPos(u8, s, open + 2, "*/") orelse break;
        try blocks.append(a, .{ .start = open, .end = close + 2 });
        from = close + 2;
    }
    var line_comments: std.ArrayList(Range) = .empty;
    from = 0;
    while (std.mem.indexOfPos(u8, s, from, "//")) |open| {
        const end = std.mem.indexOfScalarPos(u8, s, open, '\n') orelse s.len;
        try line_comments.append(a, .{ .start = open, .end = end });
        from = end;
    }
    var in_block: Cursor = .{ .ranges = blocks.items };
    var in_line: Cursor = .{ .ranges = line_comments.items };

    var lines: re.Lines = .{ .content = s };
    var flat: std.ArrayList(u8) = .empty;
    var collapsed: std.ArrayList(u8) = .empty;
    var atoms: std.ArrayList(u8) = .empty;

    var pos: usize = 0;
    while (std.mem.indexOfScalarPos(u8, s, pos, '/')) |idx| {
        const end = switch (matchLiteral(s, idx)) {
            .end => |e| e,
            // Every `/` before the failure point is the second half of an
            // escape on the same path, so it fails there too
            .fail => |f| {
                pos = f + 1;
                continue;
            },
        };
        pos = end;

        if (in_block.contains(idx) or in_line.contains(idx)) continue;

        const patt = s[idx + 1 .. end - 1];
        if (idx > 0) {
            const prev = s[idx - 1];
            if (prev == ')' or prev == ']' or prev == '.' or text.isIdentByte(prev)) continue;
            if (startsWithSpacesThenWord(patt) and hasWordBeforeParen(patt)) continue;
        }

        // flat = patt.replace(/\[.*?\]/g, '')
        flat.clearRetainingCapacity();
        try removeClasses(a, patt, &flat);
        const f = flat.items;
        if (std.mem.indexOf(u8, f, ".+?\\s*") != null or std.mem.indexOf(u8, f, "\\s*.+?") != null or
            std.mem.indexOf(u8, f, ".*\\s*") != null or std.mem.indexOf(u8, f, "\\s*.*") != null)
        {
            try report(out, a, &lines, idx, msg_exchangeable);
            continue;
        }

        // collapsed = flat.replace(/\s+/g, '')
        collapsed.clearRetainingCapacity();
        var k: usize = 0;
        while (k < f.len) {
            const w = text.whitespaceLenAt(f, k);
            if (w > 0) {
                k += w;
            } else {
                try collapsed.append(a, f[k]);
                k += 1;
            }
        }
        if (hasAdjacentWildcards(collapsed.items)) {
            try report(out, a, &lines, idx, msg_adjacent);
            continue;
        }

        // atoms = patt.replace(/\\./g, '_').replace(/\[[^\]]*\]/g, '_')
        atoms.clearRetainingCapacity();
        try collapseAtoms(a, patt, &atoms);
        if (hasNestedQuantifier(atoms.items)) {
            try report(out, a, &lines, idx, msg_nested);
            continue;
        }
    }
}

fn report(out: *std.ArrayList(types.Issue), a: std.mem.Allocator, lines: *re.Lines, idx: usize, message: []const u8) !void {
    const p = lines.at(idx);
    try out.append(a, .{ .line = p.line, .column = p.column, .rule_id = rule_id, .message = message, .severity = .@"error" });
}

/// `/^\s+\w/`
fn startsWithSpacesThenWord(s: []const u8) bool {
    const i = re.skipSpaces(s, 0);
    return i > 0 and i < s.len and text.isWordByte(s[i]);
}

/// `/\w\s*\)/`
fn hasWordBeforeParen(s: []const u8) bool {
    var word_before = false;
    var i: usize = 0;
    while (i < s.len) {
        const w = text.whitespaceLenAt(s, i);
        if (w > 0) {
            i += w;
            continue;
        }
        if (s[i] == ')' and word_before) return true;
        word_before = text.isWordByte(s[i]);
        i += 1;
    }
    return false;
}

/// `s.replace(/\[.*?\]/g, '')`: a `[` through the first `]` after it, unless
/// a line terminator comes first.
fn removeClasses(a: std.mem.Allocator, s: []const u8, out: *std.ArrayList(u8)) !void {
    // A `[` before this index already failed to find its `]`, and so does
    // every `[` up to the same line terminator
    var no_close_before: usize = 0;
    var i: usize = 0;
    while (i < s.len) {
        if (s[i] == '[' and i >= no_close_before) {
            var j = i + 1;
            while (j < s.len and s[j] != ']' and !re.isLineTerminatorAt(s, j)) j += 1;
            if (j < s.len and s[j] == ']') {
                i = j + 1;
                continue;
            }
            no_close_before = j;
        }
        try out.append(a, s[i]);
        i += 1;
    }
}

/// `/(?:\.\*\??){2,}/`, `/(?:\.\+\??){2,}/` and `/\.\*\??\.\+\?|\.\+\??\.\*\?/`:
/// `.*` or `.+`, an optional `?`, then the same quantifier again or the
/// other one made lazy.
fn hasAdjacentWildcards(s: []const u8) bool {
    var i: usize = 0;
    while (std.mem.indexOfScalarPos(u8, s, i, '.')) |d| : (i = d + 1) {
        if (d + 1 >= s.len) return false;
        const q = s[d + 1];
        if (q != '*' and q != '+') continue;
        var r = s[d + 2 ..];
        if (r.len > 0 and r[0] == '?') r = r[1..];
        if (r.len < 2 or r[0] != '.') continue;
        if (r[1] == q) return true;
        if ((r[1] == '*' or r[1] == '+') and r.len > 2 and r[2] == '?') return true;
    }
    return false;
}

/// `s.replace(/\\./g, '_').replace(/\[[^\]]*\]/g, '_')`
fn collapseAtoms(a: std.mem.Allocator, s: []const u8, out: *std.ArrayList(u8)) !void {
    var escaped: std.ArrayList(u8) = .empty;
    var i: usize = 0;
    while (i < s.len) {
        if (s[i] == '\\') {
            const n = re.dotLenAt(s, i + 1);
            if (n > 0) {
                try escaped.append(a, '_');
                i += 1 + n;
                continue;
            }
        }
        try escaped.append(a, s[i]);
        i += 1;
    }
    const e = escaped.items;
    i = 0;
    while (i < e.len) {
        if (e[i] == '[') {
            if (std.mem.indexOfScalarPos(u8, e, i + 1, ']')) |close| {
                try out.append(a, '_');
                i = close + 1;
                continue;
            }
            // no `]` after this one, so none after any later `[` either
            try out.appendSlice(a, e[i..]);
            return;
        }
        try out.append(a, e[i]);
        i += 1;
    }
}

/// `/\((?:\?:)?[^)]*?[+*][^)]*\)\s*[+*]/`: a `(` and a later `+` or `*`
/// with no `)` between them or before the next `)`, which a `+` or `*`
/// follows after optional whitespace.
fn hasNestedQuantifier(s: []const u8) bool {
    var open = false;
    var quantified = false;
    var i: usize = 0;
    while (i < s.len) : (i += 1) {
        switch (s[i]) {
            '(' => open = true,
            '+', '*' => {
                if (open) quantified = true;
            },
            ')' => {
                if (quantified) {
                    const j = re.skipSpaces(s, i + 1);
                    if (j < s.len and (s[j] == '+' or s[j] == '*')) return true;
                }
                open = false;
                quantified = false;
            },
            else => {},
        }
    }
    return false;
}
