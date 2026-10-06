//! The "rest of the file" that rules/general/prefer-const.ts searches for
//! reassignments, and the bracket walk of its `destructuringReassignsName`,
//! without building either per declaration.
//!
//! The TypeScript rule searches
//!
//!   rest = text.slice(0, r) + '\n' + text.slice(r + line.length)
//!
//! where `r = text.indexOf(line)`. `Rest` reads that string in place: index
//! `r` is the `'\n'` and everything after it is the text shifted by
//! `line.length - 1`.
//!
//! `destructuringReassignsName` walks `rest` from the start, tracking quotes
//! outside brackets and jumping over each top-level `[...]` / `{...}` group
//! (counting only its own bracket kind, ignoring strings, a backslash skipping
//! a character), and looks at the groups followed by `=` (not `==`, `=>`).
//! Which groups those are does not depend on the name, only on `rest`. The
//! walk over `rest` reads the same characters as the walk over the whole text
//! up to `r`, and the walk is a function of (position, state) from then on, so
//! `restGroups` takes the text's walk (`TextWalk`, built once per file), walks
//! only from the last point before `r` that it shares with it, and stops as
//! soon as both walks stand at the same text position in the same state;
//! beyond that the text's groups are the rest's groups, shifted. A group
//! closed before `r` whose `=` lookahead crossed `r` is looked at again.
//!
//! Neither walk scans a group byte by byte: where a group closes is a lookup
//! in bracket counts taken once per file (see `TextWalk`), so a declaration
//! inside a large group - a module wrapper, a long function - costs a few
//! lookups instead of a scan to the group's end.

const std = @import("std");
const text = @import("../text.zig");

/// The TypeScript `rest` string, read in place.
pub const Rest = struct {
    t: []const u8,
    /// Where the removed line starts (`text.indexOf(line)`)
    r: usize,
    /// Its length in bytes
    l: usize,

    pub fn len(self: Rest) usize {
        return self.t.len - self.l + 1;
    }

    pub inline fn at(self: Rest, i: usize) u8 {
        if (i < self.r) return self.t[i];
        if (i == self.r) return '\n';
        return self.t[i + self.l - 1];
    }

    /// The text offset of rest index `i` (not the inserted `'\n'`).
    pub inline fn textIndex(self: Rest, i: usize) usize {
        return if (i < self.r) i else i + self.l - 1;
    }

    /// Byte length of the `\s` character starting at `i`, or 0.
    pub fn wsLenAt(self: Rest, i: usize) usize {
        if (i == self.r) return 1;
        const c = self.at(i);
        if (c < 0x80) return if (text.isAsciiSpace(c)) 1 else 0;
        // Characters never straddle `r`: the line starts and ends on whole characters
        const ti = self.textIndex(i);
        const bound = if (i < self.r) self.r else self.t.len;
        return text.whitespaceLenAt(self.t[0..bound], ti);
    }

    /// Byte length of the `\s` character ending just before `i`, or 0.
    pub fn wsLenBefore(self: Rest, i: usize) usize {
        if (i == 0) return 0;
        const c = self.at(i - 1);
        if (c < 0x80) return if (text.isAsciiSpace(c)) 1 else 0;
        var s = i - 1;
        var steps: usize = 0;
        // The inserted '\n' is ASCII, so this never steps across it
        while (steps < 3 and s > 0 and (self.at(s) & 0xC0) == 0x80) : (steps += 1) s -= 1;
        const n = self.wsLenAt(s);
        return if (n == i - s) n else 0;
    }
};

/// A bracket group the walk jumped over: `[start .. end]` are the brackets.
pub const Group = struct {
    start: usize,
    /// The closing bracket, or where the scan stopped for an unclosed group
    end: usize,
    open: u8,
    /// Followed by `=` that is not `==` or `=>`
    eq: bool,
    /// The last index the `=` lookahead could read
    look_end: usize,
};

const OUT: u8 = 0;
const SINGLE: u8 = 1;
const DOUBLE: u8 = 2;
const TEMPLATE: u8 = 3;
const ESC: u8 = 4;

/// The walk of `destructuringReassignsName`, step by step as the TypeScript
/// does it, from index `from` in `state`: the reference the tests hold
/// `TextWalk` and `restGroups` to. `cb.visit(i, state)` is called at each
/// step and stops the walk by returning true; `cb.group(g)` gets each group.
fn walk(src: anytype, from: usize, state: u8, cb: anytype) !void {
    const n = src.len();
    var i = from;
    var st = state;
    while (i < n) {
        if (cb.visit(i, st)) return;
        const c = src.at(i);
        if (st & ESC != 0) {
            st &= ~ESC;
            i += 1;
            continue;
        }
        if (st != OUT) {
            if (c == '\\') {
                st |= ESC;
            } else if ((st == SINGLE and c == '\'') or (st == DOUBLE and c == '"') or (st == TEMPLATE and c == '`')) {
                st = OUT;
            }
            i += 1;
            continue;
        }
        switch (c) {
            '\'' => st = SINGLE,
            '"' => st = DOUBLE,
            '`' => st = TEMPLATE,
            '[', '{' => {
                const close: u8 = if (c == '[') ']' else '}';
                var depth: usize = 1;
                var j = i + 1;
                while (j < n) {
                    const cj = src.at(j);
                    if (cj == '\\') {
                        j += 2;
                        continue;
                    }
                    if (cj == c) {
                        depth += 1;
                    } else if (cj == close) {
                        depth -= 1;
                        if (depth == 0) break;
                    }
                    j += 1;
                }
                if (depth == 0 and j < n) {
                    var g: Group = .{ .start = i, .end = j, .open = c, .eq = false, .look_end = 0 };
                    lookahead(src, &g);
                    try cb.group(g);
                } else {
                    try cb.group(.{ .start = i, .end = j, .open = c, .eq = false, .look_end = j });
                }
                i = j + 1;
                continue;
            },
            else => {},
        }
        i += 1;
    }
}

/// Whether the closed group is followed by `=` (past ' ', \t, \r, \n), and
/// how far that looked.
fn lookahead(src: anytype, g: *Group) void {
    const n = src.len();
    var k = g.end + 1;
    while (k < n) {
        const c = src.at(k);
        if (c != ' ' and c != '\t' and c != '\r' and c != '\n') break;
        k += 1;
    }
    g.look_end = k + 1;
    if (k >= n or src.at(k) != '=') {
        g.eq = false;
        return;
    }
    if (k + 1 >= n) {
        g.eq = true;
        return;
    }
    const next = src.at(k + 1);
    g.eq = next != '=' and next != '>';
}

const Plain = struct {
    t: []const u8,
    fn len(self: Plain) usize {
        return self.t.len;
    }
    inline fn at(self: Plain, i: usize) u8 {
        return self.t[i];
    }
};

fn deltaTable(open: u8, close: u8) [256]i32 {
    var table: [256]i32 = @splat(0);
    table[open] = 1;
    table[close] = -1;
    return table;
}
const square_delta = deltaTable('[', ']');
const curly_delta = deltaTable('{', '}');

/// Whether the 64 bytes hold a bracket or a backslash.
fn hasSpecial(block: *const [64]u8) bool {
    const v: @Vector(64, u8) = block.*;
    // `[`, `\`, `]` are 0x5B-0x5D and `{`, `}` 0x7B, 0x7D: with bit 5 cleared,
    // all of them land in 0x5B-0x5D, and so does `|` (0x7C), which is harmless
    const folded = v & @as(@Vector(64, u8), @splat(0xDF));
    const lo = folded >= @as(@Vector(64, u8), @splat(0x5B));
    const hi = folded <= @as(@Vector(64, u8), @splat(0x5D));
    const both = @select(bool, lo, hi, @as(@Vector(64, bool), @splat(false)));
    return @reduce(.Or, both);
}

/// The canonical scan (see `TextWalk`): for one bracket kind, `p(y)` is
/// openers minus closers among the offsets below `y` it does not skip.
/// Kept per 64 offsets - the counts and skip state where each block starts
/// and the lowest count in it (and in each 64 blocks) - and recounted from a
/// block's start for anything inside it.
const Canon = struct {
    t: []const u8,
    /// Whether the scan skips the block's first offset
    skip: []bool,
    square: Counts,
    curly: Counts,

    const Counts = struct {
        base: []i32,
        low: []i32,
        super: []i32,
    };

    fn build(allocator: std.mem.Allocator, t: []const u8) !Canon {
        const n = t.len;
        // Blocks over the offsets 0 ..= n
        const nb = n / 64 + 1;
        var c: Canon = .{
            .t = t,
            .skip = try allocator.alloc(bool, nb),
            .square = .{ .base = try allocator.alloc(i32, nb), .low = try allocator.alloc(i32, nb), .super = try allocator.alloc(i32, (nb + 63) / 64) },
            .curly = .{ .base = try allocator.alloc(i32, nb), .low = try allocator.alloc(i32, nb), .super = try allocator.alloc(i32, (nb + 63) / 64) },
        };
        var sq: i32 = 0;
        var cu: i32 = 0;
        var skip = false;
        for (0..nb) |b| {
            c.square.base[b] = sq;
            c.curly.base[b] = cu;
            c.skip[b] = skip;
            var sq_low = sq;
            var cu_low = cu;
            // The block holds p(from) .. p(from + 63); the last one also p(n)
            const from = b * 64;
            const end = @min(from + 64, n);
            if (end == from + 64 and !hasSpecial(t[from..][0..64])) {
                // No bracket or backslash: nothing counts, and a skip ends here
                skip = false;
                c.square.low[b] = sq;
                c.curly.low[b] = cu;
                continue;
            }
            for (t[from..end]) |ch| {
                sq_low = @min(sq_low, sq);
                cu_low = @min(cu_low, cu);
                // Branch-free: a skipped byte counts nothing
                const live: i32 = @intFromBool(!skip);
                sq += square_delta[ch] * live;
                cu += curly_delta[ch] * live;
                skip = !skip and ch == '\\';
            }
            if (b == nb - 1) {
                sq_low = @min(sq_low, sq);
                cu_low = @min(cu_low, cu);
            }
            c.square.low[b] = sq_low;
            c.curly.low[b] = cu_low;
        }
        for (c.square.super, c.curly.super, 0..) |*s, *k, i| {
            const from = i * 64;
            const to = @min(nb, from + 64);
            s.* = std.mem.min(i32, c.square.low[from..to]);
            k.* = std.mem.min(i32, c.curly.low[from..to]);
        }
        return c;
    }

    fn counts(self: *const Canon, open: u8) *const Counts {
        return if (open == '[') &self.square else &self.curly;
    }

    const Point = struct { p: i32, scanned: bool };

    /// `p(x)`, and whether the scan visits `x`.
    fn at(self: *const Canon, open: u8, x: usize) Point {
        const close: u8 = if (open == '[') ']' else '}';
        const b = x / 64;
        var p = self.counts(open).base[b];
        var skip = self.skip[b];
        var y = b * 64;
        while (y < x) : (y += 1) {
            if (skip) {
                skip = false;
                continue;
            }
            const c = self.t[y];
            if (c == '\\') {
                skip = true;
            } else if (c == open) {
                p += 1;
            } else if (c == close) {
                p -= 1;
            }
        }
        return .{ .p = p, .scanned = !skip };
    }

    /// The first offset `y >= from` in block `b` with `p(y) <= v`.
    fn inBlock(self: *const Canon, open: u8, b: usize, from: usize, v: i32) ?usize {
        const close: u8 = if (open == '[') ']' else '}';
        const n = self.t.len;
        var p = self.counts(open).base[b];
        var skip = self.skip[b];
        var y = b * 64;
        const end = @min(y + 64, n + 1);
        while (y < end) : (y += 1) {
            if (y >= from and p <= v) return y;
            if (y == n) break;
            if (skip) {
                skip = false;
                continue;
            }
            const c = self.t[y];
            if (c == '\\') {
                skip = true;
            } else if (c == open) {
                p += 1;
            } else if (c == close) {
                p -= 1;
            }
        }
        return null;
    }

    /// The first offset `y >= from` with `p(y) <= v`.
    fn firstAtMost(self: *const Canon, open: u8, from: usize, v: i32) ?usize {
        const cnt = self.counts(open);
        const nb = cnt.base.len;
        if (from / 64 >= nb) return null;
        if (self.inBlock(open, from / 64, from, v)) |y| return y;
        var b = from / 64 + 1;
        while (b < nb and b % 64 != 0) : (b += 1) {
            if (cnt.low[b] <= v) return self.inBlock(open, b, 0, v);
        }
        while (b < nb) : (b += 64) {
            if (cnt.super[b / 64] > v) continue;
            while (cnt.low[b] > v) b += 1;
            return self.inBlock(open, b, 0, v);
        }
        return null;
    }
};

/// The walk over the whole text: the state at every step and every group.
///
/// Also the canonical scan: the bracket scan run from offset 0, where a
/// backslash skips the next character. A group scan starts right after its
/// opening bracket, which is never a backslash, so the canonical scan visits
/// that offset too, and from there both skip the same characters. A group
/// scan's depth is then the bracket count along the canonical scan, and where
/// it closes is where that count first drops below its start.
pub const TextWalk = struct {
    /// Per text index: 0 when the walk jumps over it, else its state + 1
    visited: []u8,
    groups: []Group,
    /// The groups followed by `=`, in order
    eq_groups: []Group,
    canon: Canon,

    pub fn build(allocator: std.mem.Allocator, t: []const u8) !TextWalk {
        const n = t.len;
        var tw: TextWalk = .{
            .visited = try allocator.alloc(u8, n),
            .groups = &.{},
            .eq_groups = &.{},
            .canon = try Canon.build(allocator, t),
        };
        @memset(tw.visited, 0);

        // The walk, stepping only outside brackets: a group's scan is aligned
        // with the canonical one, so where it closes is a lookup
        var groups: std.ArrayList(Group) = .empty;
        var eq_groups: std.ArrayList(Group) = .empty;
        var i: usize = 0;
        var st: u8 = OUT;
        while (i < n) {
            tw.visited[i] = st + 1;
            const c = t[i];
            if (st & ESC != 0) {
                st &= ~ESC;
                i += 1;
                continue;
            }
            if (st != OUT) {
                if (c == '\\') {
                    st |= ESC;
                } else if ((st == SINGLE and c == '\'') or (st == DOUBLE and c == '"') or (st == TEMPLATE and c == '`')) {
                    st = OUT;
                }
                i += 1;
                continue;
            }
            switch (c) {
                '\'' => st = SINGLE,
                '"' => st = DOUBLE,
                '`' => st = TEMPLATE,
                '[', '{' => {
                    const end = tw.closeOf(c, i) orelse {
                        try groups.append(allocator, .{ .start = i, .end = n, .open = c, .eq = false, .look_end = n });
                        break;
                    };
                    var g: Group = .{ .start = i, .end = end, .open = c, .eq = false, .look_end = 0 };
                    lookahead(Plain{ .t = t }, &g);
                    try groups.append(allocator, g);
                    if (g.eq) try eq_groups.append(allocator, g);
                    i = end + 1;
                    continue;
                },
                else => {},
            }
            i += 1;
        }
        tw.groups = groups.items;
        tw.eq_groups = eq_groups.items;
        return tw;
    }

    /// Where the group the text opens at `at` closes, or null.
    fn closeOf(self: *const TextWalk, open: u8, at: usize) ?usize {
        // The canonical scan visits at + 1, whether or not it visited `at`
        const x = at + 1;
        if (x >= self.visited.len) return null;
        const y = self.canon.firstAtMost(open, x + 1, self.canon.at(open, x).p - 1) orelse return null;
        return y - 1;
    }

    /// A group scan of `open` over rest, continued from rest index `from`
    /// with `depth` brackets open: the rest index of its closing bracket, or
    /// null when it never closes. Once it stands on an offset past the line
    /// that the canonical scan visits, it skips what the canonical scan skips.
    fn scanFrom(self: *const TextWalk, rest: Rest, open: u8, from: usize, depth_in: i32) ?usize {
        const close: u8 = if (open == '[') ']' else '}';
        const n = rest.len();
        var depth = depth_in;
        var i = from;
        while (i < n) {
            if (i > rest.r) {
                const x = rest.textIndex(i);
                const here = self.canon.at(open, x);
                if (here.scanned) {
                    const y = self.canon.firstAtMost(open, x + 1, here.p - depth) orelse return null;
                    return y - 1 - (rest.l - 1);
                }
            }
            const c = rest.at(i);
            if (c == '\\') {
                i += 2;
                continue;
            }
            if (c == open) {
                depth += 1;
            } else if (c == close) {
                depth -= 1;
                if (depth == 0) return i;
            }
            i += 1;
        }
        return null;
    }
};

/// The groups followed by `=` in the walk over `rest`, in order, as three
/// runs: the text's groups before the point where the walks part (`before`
/// and `fixed`), the groups of the walk over the changed part (`walked`), and
/// the text's groups after the walks meet again (`after`, in text offsets).
pub const RestGroups = struct {
    rest: Rest,
    before: []const Group,
    fixed: []const Group,
    walked: []const Group,
    after: []const Group,

    /// The group followed by `=` whose inside holds rest index `o`, as rest offsets.
    pub fn containing(self: *const RestGroups, o: usize) ?Group {
        if (find(self.before, o)) |g| return g;
        if (find(self.fixed, o)) |g| return g;
        if (find(self.walked, o)) |g| return g;
        const shift = self.rest.l - 1;
        if (self.after.len > 0 and o + shift >= self.after[0].start) {
            if (find(self.after, o + shift)) |g| {
                var moved = g;
                moved.start -= shift;
                moved.end -= shift;
                return moved;
            }
        }
        return null;
    }

    /// Every group followed by `=`, in order, as rest offsets.
    pub fn each(self: *const RestGroups, ctx: anytype, comptime f: fn (@TypeOf(ctx), Group) bool) bool {
        for (self.before) |g| if (f(ctx, g)) return true;
        for (self.fixed) |g| if (f(ctx, g)) return true;
        for (self.walked) |g| if (f(ctx, g)) return true;
        const shift = self.rest.l - 1;
        for (self.after) |g| {
            var moved = g;
            moved.start -= shift;
            moved.end -= shift;
            if (f(ctx, moved)) return true;
        }
        return false;
    }
};

/// The group in sorted, disjoint `groups` whose inside holds `o`.
fn find(groups: []const Group, o: usize) ?Group {
    const k = upperStart(groups, o);
    if (k == 0) return null;
    const g = groups[k - 1];
    return if (o < g.end) g else null;
}

/// The groups followed by `=` in the walk over `rest`.
pub fn restGroups(allocator: std.mem.Allocator, tw: *const TextWalk, rest: Rest) !RestGroups {
    const r = rest.r;
    const n = rest.len();
    const groups = tw.groups;
    var walked: std.ArrayList(Group) = .empty;

    // Where the walks part: r itself when the text's walk steps on it, else
    // the group the text's walk jumped over it with, whose scan rest continues
    var start: usize = r;
    var i: usize = r;
    var st: u8 = OUT;
    var ended = false;
    if (tw.visited[r] != 0) {
        st = tw.visited[r] - 1;
    } else {
        const g = groups[upperStart(groups, r) - 1];
        start = g.start;
        const depth = 1 + tw.canon.at(g.open, r).p - tw.canon.at(g.open, g.start + 1).p;
        // The inserted '\n' is no bracket, and no backslash: the scan goes on at r + 1
        if (tw.scanFrom(rest, g.open, r + 1, depth)) |end| {
            var again: Group = .{ .start = g.start, .end = end, .open = g.open, .eq = false, .look_end = 0 };
            lookahead(rest, &again);
            if (again.eq) try walked.append(allocator, again);
            i = end + 1;
        } else {
            ended = true;
        }
    }

    // The text's groups before that point; those whose `=` lookahead reached
    // r are looked at again in rest (look_end only grows along the walk)
    const n_before = upperStart(groups, start);
    var first_fix = n_before;
    while (first_fix > 0 and groups[first_fix - 1].look_end >= r) first_fix -= 1;
    var fixed: std.ArrayList(Group) = .empty;
    for (groups[first_fix..n_before]) |g| {
        var again = g;
        lookahead(rest, &again);
        if (again.eq) try fixed.append(allocator, again);
    }
    const limit = if (first_fix < groups.len) groups[first_fix].start else std.math.maxInt(usize);
    const before_end = upperStart(tw.eq_groups, limit);

    // Walk rest until it meets the text's walk again: the same offset in the
    // same state, from where both read the same characters
    var meet: ?usize = null;
    while (!ended and i < n) {
        if (i > r) {
            const p = rest.textIndex(i);
            if (tw.visited[p] == st + 1) {
                meet = p;
                break;
            }
        }
        const c = rest.at(i);
        if (st & ESC != 0) {
            st &= ~ESC;
            i += 1;
            continue;
        }
        if (st != OUT) {
            if (c == '\\') {
                st |= ESC;
            } else if ((st == SINGLE and c == '\'') or (st == DOUBLE and c == '"') or (st == TEMPLATE and c == '`')) {
                st = OUT;
            }
            i += 1;
            continue;
        }
        switch (c) {
            '\'' => st = SINGLE,
            '"' => st = DOUBLE,
            '`' => st = TEMPLATE,
            '[', '{' => {
                const end = tw.scanFrom(rest, c, i + 1, 1) orelse break;
                var g: Group = .{ .start = i, .end = end, .open = c, .eq = false, .look_end = 0 };
                lookahead(rest, &g);
                if (g.eq) try walked.append(allocator, g);
                i = end + 1;
                continue;
            },
            else => {},
        }
        i += 1;
    }
    const after: []const Group = if (meet) |p| tw.eq_groups[upperStart(tw.eq_groups, p)..] else &.{};

    return .{
        .rest = rest,
        .before = tw.eq_groups[0..before_end],
        .fixed = fixed.items,
        .walked = walked.items,
        .after = after,
    };
}

/// The number of groups starting before `pos`.
fn upperStart(groups: []const Group, pos: usize) usize {
    var lo: usize = 0;
    var hi: usize = groups.len;
    while (lo < hi) {
        const mid = (lo + hi) / 2;
        if (groups[mid].start < pos) lo = mid + 1 else hi = mid;
    }
    return lo;
}

/// The groups followed by `=` of a walk over all of `rest`, for tests.
fn restGroupsSlow(allocator: std.mem.Allocator, rest: Rest) ![]Group {
    var out: std.ArrayList(Group) = .empty;
    const Cb = struct {
        out: *std.ArrayList(Group),
        allocator: std.mem.Allocator,
        inline fn visit(_: *@This(), _: usize, _: u8) bool {
            return false;
        }
        fn group(self: *@This(), g: Group) !void {
            if (g.eq) try self.out.append(self.allocator, g);
        }
    };
    var cb: Cb = .{ .out = &out, .allocator = allocator };
    try walk(rest, 0, OUT, &cb);
    return out.items;
}

test "rest groups match a full walk" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();
    const a = arena_state.allocator();
    const samples = [_][]const u8{
        "let x = 1\n[x, y] = f()\n{ x } = g\n",
        "const [a] = b\nlet x = {\n  a: [1, 2]\n}\n[x] = y\n",
        "'it\\'s' let x = `a [ b`\n[x]\n= 3\n{a}=\n=1",
        "{ a\nlet x = 1\n} = 2\n[x] = 1",
        "a = [\nlet x = 1 ] = 3\n",
        "\"\\\nlet x\n\" [x] = 1",
        "[a]\nlet x = 1\n= [x] = {x}\n=> {x} ==",
        "[a] \\\nlet q = 1\n",
    };
    // And random strings over the characters the walk cares about
    var prng = std.Random.DefaultPrng.init(0x5eed);
    const random = prng.random();
    const alphabet = "[]{}'\"`\\= \n\r>x";
    var all: std.ArrayList([]const u8) = .empty;
    for (samples) |s| try all.append(a, s);
    for (0..400) |_| {
        const buf = try a.alloc(u8, random.intRangeAtMost(usize, 1, 24));
        for (buf) |*c| c.* = alphabet[random.uintLessThan(usize, alphabet.len)];
        try all.append(a, buf);
    }
    for (all.items) |t| {
        const tw = try TextWalk.build(a, t);
        var r: usize = 0;
        while (r < t.len) : (r += 1) {
            var l: usize = 1;
            while (r + l <= t.len) : (l += 1) try expectSameGroups(a, &tw, .{ .t = t, .r = r, .l = l });
        }
    }
    // Long, deeply nested ones, past the prefix blocks, at sampled splits
    const nested = "[[[{{{]]]}}}{[x]}{\\'`\"= \n";
    for (0..30) |_| {
        const buf = try a.alloc(u8, random.intRangeAtMost(usize, 100, 9000));
        for (buf) |*c| c.* = nested[random.uintLessThan(usize, nested.len)];
        const tw = try TextWalk.build(a, buf);
        for (0..150) |_| {
            const r = random.uintLessThan(usize, buf.len);
            const l = random.intRangeAtMost(usize, 1, @min(40, buf.len - r));
            try expectSameGroups(a, &tw, .{ .t = buf, .r = r, .l = l });
        }
    }
}

fn expectSameGroups(a: std.mem.Allocator, tw: *const TextWalk, rest: Rest) !void {
    const slow = try restGroupsSlow(a, rest);
    const fast = try restGroups(a, tw, rest);
    var got: std.ArrayList(Group) = .empty;
    for (fast.before) |g| try got.append(a, g);
    for (fast.fixed) |g| try got.append(a, g);
    for (fast.walked) |g| try got.append(a, g);
    for (fast.after) |g| {
        var m = g;
        m.start -= rest.l - 1;
        m.end -= rest.l - 1;
        try got.append(a, m);
    }
    try std.testing.expectEqual(slow.len, got.items.len);
    for (slow, got.items) |x, y| {
        try std.testing.expectEqual(x.start, y.start);
        try std.testing.expectEqual(x.end, y.end);
        try std.testing.expectEqual(x.open, y.open);
    }
}
