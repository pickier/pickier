//! UTF-16 string helpers for the ports of no-unused-vars, no-unused-imports
//! and no-top-level-await.
//!
//! Those rules index, slice and measure the file the way JavaScript does, so
//! they run on the file converted to UTF-16 code units: every index is then a
//! JavaScript index, every `.length` a JavaScript length, and a column is the
//! index plus one. Conversion follows text.zig: an invalid UTF-8 byte is one
//! U+FFFD.
//!
//! The hand-written matchers here stand in for the small regexes those rules
//! use; each says which regex it is.

const std = @import("std");

pub const Str = []const u16;

/// The file as JavaScript sees it after `readFileSync(path, 'utf8')`.
pub fn toUtf16(allocator: std.mem.Allocator, bytes: []const u8) ![]u16 {
    var out = try std.ArrayList(u16).initCapacity(allocator, bytes.len);
    var i: usize = 0;
    while (i < bytes.len) {
        // ASCII runs sixteen at a time
        const V = @Vector(16, u8);
        while (i + 16 <= bytes.len) {
            const v: V = bytes[i..][0..16].*;
            if (@reduce(.Or, v) >= 0x80) break;
            const wide: @Vector(16, u16) = v;
            const dst = out.addManyAsArrayAssumeCapacity(16);
            dst.* = wide;
            i += 16;
        }
        if (i >= bytes.len) break;
        const b = bytes[i];
        if (b < 0x80) {
            out.appendAssumeCapacity(b);
            i += 1;
            continue;
        }
        const len = std.unicode.utf8ByteSequenceLength(b) catch {
            out.appendAssumeCapacity(0xFFFD);
            i += 1;
            continue;
        };
        if (i + len > bytes.len) {
            out.appendAssumeCapacity(0xFFFD);
            i += 1;
            continue;
        }
        const cp = std.unicode.utf8Decode(bytes[i .. i + len]) catch {
            out.appendAssumeCapacity(0xFFFD);
            i += 1;
            continue;
        };
        if (cp >= 0x10000) {
            const v = cp - 0x10000;
            // Four bytes became two units: capacity still holds
            out.appendAssumeCapacity(@intCast(0xD800 + (v >> 10)));
            out.appendAssumeCapacity(@intCast(0xDC00 + (v & 0x3FF)));
        } else {
            out.appendAssumeCapacity(@intCast(cp));
        }
        i += len;
    }
    return out.items;
}

/// Whether `needle` (two or more bytes) occurs in `hay`: a vector filter on
/// its first two bytes, then a compare.
pub fn containsBytes(hay: []const u8, comptime needle: []const u8) bool {
    comptime std.debug.assert(needle.len >= 2);
    const n = 32;
    const V = @Vector(n, u8);
    var i: usize = 0;
    while (i + n + needle.len <= hay.len) : (i += n) {
        const a: V = hay[i..][0..n].*;
        const b: V = hay[i + 1 ..][0..n].*;
        var hits: u32 = @as(u32, @bitCast(a == @as(V, @splat(needle[0])))) & @as(u32, @bitCast(b == @as(V, @splat(needle[1]))));
        while (hits != 0) {
            const k = i + @ctz(hits);
            hits &= hits - 1;
            if (std.mem.eql(u8, hay[k .. k + needle.len], needle)) return true;
        }
    }
    return std.mem.indexOf(u8, hay[i..], needle) != null;
}

/// A string of ASCII identifier characters back to UTF-8, for messages.
pub fn asciiToUtf8(allocator: std.mem.Allocator, s: Str) ![]u8 {
    const out = try allocator.alloc(u8, s.len);
    for (s, 0..) |c, k| out[k] = @intCast(c & 0x7F);
    return out;
}

/// `/\s/` on one UTF-16 unit: JavaScript WhiteSpace and LineTerminator.
pub fn isWs(c: u16) bool {
    return switch (c) {
        0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF => true,
        else => false,
    };
}

/// A regex `.` does not match these.
pub fn isLineTerminator(c: u16) bool {
    return c == '\n' or c == '\r' or c == 0x2028 or c == 0x2029;
}

/// `/\w/`
pub fn isWord(c: u16) bool {
    return (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_';
}

/// `/[\w$]/`
pub fn isIdent(c: u16) bool {
    return isWord(c) or c == '$';
}

/// `/[$A-Z_]/i`
pub fn isIdentStart(c: u16) bool {
    return (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or c == '_' or c == '$';
}

pub fn trimStart(s: Str) Str {
    var i: usize = 0;
    while (i < s.len and isWs(s[i])) i += 1;
    return s[i..];
}

pub fn trimEnd(s: Str) Str {
    var e = s.len;
    while (e > 0 and isWs(s[e - 1])) e -= 1;
    return s[0..e];
}

pub fn trim(s: Str) Str {
    return trimEnd(trimStart(s));
}

pub fn eql(s: Str, comptime lit: []const u8) bool {
    if (s.len != lit.len) return false;
    inline for (lit, 0..) |c, k| {
        if (s[k] != c) return false;
    }
    return true;
}

pub fn startsWith(s: Str, comptime lit: []const u8) bool {
    return s.len >= lit.len and eql(s[0..lit.len], lit);
}

pub fn endsWith(s: Str, comptime lit: []const u8) bool {
    return s.len >= lit.len and eql(s[s.len - lit.len ..], lit);
}

/// `s.startsWith(lit, at)`
pub fn startsWithAt(s: Str, at: usize, comptime lit: []const u8) bool {
    return at <= s.len and startsWith(s[at..], lit);
}

/// `s.indexOf(c, from)`
pub fn indexOfScalarFrom(s: Str, from: usize, c: u16) ?usize {
    if (from >= s.len) return null;
    return std.mem.indexOfScalarPos(u16, s, from, c);
}

pub fn indexOfScalar(s: Str, c: u16) ?usize {
    return std.mem.indexOfScalar(u16, s, c);
}

pub fn lastIndexOfScalar(s: Str, c: u16) ?usize {
    return std.mem.lastIndexOfScalar(u16, s, c);
}

pub fn contains(s: Str, c: u16) bool {
    return std.mem.indexOfScalar(u16, s, c) != null;
}

/// `s.indexOf(needle, from)`
pub fn indexOfFrom(s: Str, from: usize, needle: Str) ?usize {
    if (from > s.len) return if (needle.len == 0) s.len else null;
    if (needle.len == 0) return from;
    if (needle.len > s.len) return null;
    // A vector scan for the first unit, then a compare
    const last_start = s.len - needle.len;
    var p = from;
    while (p <= last_start) {
        p = std.mem.indexOfScalarPos(u16, s[0 .. last_start + 1], p, needle[0]) orelse return null;
        if (std.mem.eql(u16, s[p + 1 .. p + needle.len], needle[1..])) return p;
        p += 1;
    }
    return null;
}

pub fn indexOf(s: Str, needle: Str) ?usize {
    return indexOfFrom(s, 0, needle);
}

const lanes = 16;
const Vec = @Vector(lanes, u16);
const Mask = u16; // one bit per lane

/// The first index at or after `from` holding one of `set`.
pub fn indexOfAny(s: Str, from: usize, comptime set: []const u16) ?usize {
    var i = from;
    while (i + lanes <= s.len) : (i += lanes) {
        const v: Vec = s[i..][0..lanes].*;
        var hit: Mask = 0;
        inline for (set) |c| hit |= @bitCast(v == @as(Vec, @splat(c)));
        if (hit != 0) return i + @ctz(hit);
    }
    if (i >= s.len) return null;
    const v = tailVec(s, i);
    var hit: Mask = 0;
    inline for (set) |c| hit |= @bitCast(v == @as(Vec, @splat(c)));
    return if (hit != 0) i + @ctz(hit) else null;
}

/// The units of `s` from `i` (fewer than a vector's worth), zero-padded.
/// The callers' sets never contain 0.
fn tailVec(s: Str, i: usize) Vec {
    var buf: [lanes]u16 = @splat(0);
    @memcpy(buf[0 .. s.len - i], s[i..]);
    return buf;
}

/// One bit per unit of `v`: whether it is `\w` (or `[\w$]`).
fn wordBits(v: Vec, comptime dollar: bool) Mask {
    const lower = v | @as(Vec, @splat(0x20));
    const alpha: Mask = @as(Mask, @bitCast(lower >= @as(Vec, @splat('a')))) & @as(Mask, @bitCast(lower <= @as(Vec, @splat('z'))));
    const digit: Mask = @as(Mask, @bitCast(v >= @as(Vec, @splat('0')))) & @as(Mask, @bitCast(v <= @as(Vec, @splat('9'))));
    const under: Mask = @bitCast(v == @as(Vec, @splat('_')));
    const dol: Mask = if (dollar) @bitCast(v == @as(Vec, @splat('$'))) else 0;
    return alpha | digit | under | dol;
}

/// Calls `f(ctx, start, end)` for every maximal `\w` run in `s`.
pub fn forEachWordRun(s: Str, ctx: anytype, comptime f: fn (@TypeOf(ctx), usize, usize) anyerror!void) !void {
    return forEachRun(s, false, ctx, f);
}

/// Calls `f(ctx, start, end)` for every maximal `[\w$]` run in `s`.
pub fn forEachIdentRun(s: Str, ctx: anytype, comptime f: fn (@TypeOf(ctx), usize, usize) anyerror!void) !void {
    return forEachRun(s, true, ctx, f);
}

fn forEachRun(s: Str, comptime dollar: bool, ctx: anytype, comptime f: fn (@TypeOf(ctx), usize, usize) anyerror!void) !void {
    const member = if (dollar) isIdent else isWord;
    var in_run = false;
    var start: usize = 0;
    var i: usize = 0;
    while (i + lanes <= s.len) : (i += lanes) {
        const bits = wordBits(s[i..][0..lanes].*, dollar);
        // Bits where wordness differs from the unit before
        var changes = bits ^ ((bits << 1) | @intFromBool(in_run));
        while (changes != 0) {
            const k = @ctz(changes);
            changes &= changes - 1;
            if (in_run) try f(ctx, start, i + k) else start = i + k;
            in_run = !in_run;
        }
    }
    while (i < s.len) : (i += 1) {
        const w = member(s[i]);
        if (w and !in_run) {
            start = i;
            in_run = true;
        } else if (!w and in_run) {
            try f(ctx, start, i);
            in_run = false;
        }
    }
    if (in_run) try f(ctx, start, s.len);
}

/// Which members of `set` occur in `s`, one bit per member.
pub fn charsPresent(s: Str, comptime set: []const u16) u32 {
    const Out = u32;
    var acc: [set.len]Mask = @splat(0);
    var i: usize = 0;
    while (i + lanes <= s.len) : (i += lanes) {
        const v: Vec = s[i..][0..lanes].*;
        inline for (set, 0..) |c, k| acc[k] |= @bitCast(v == @as(Vec, @splat(c)));
    }
    if (i < s.len) {
        const v = tailVec(s, i);
        inline for (set, 0..) |c, k| acc[k] |= @bitCast(v == @as(Vec, @splat(c)));
    }
    var out: Out = 0;
    inline for (0..set.len) |k| {
        if (acc[k] != 0) out |= @as(Out, 1) << k;
    }
    return out;
}

/// `s.indexOf(lit, from)` for an ASCII literal
pub fn indexOfLit(s: Str, from: usize, comptime lit: []const u8) ?usize {
    const needle = comptime blk: {
        var buf: [lit.len]u16 = undefined;
        for (lit, 0..) |c, k| buf[k] = c;
        break :blk buf;
    };
    return indexOfFrom(s, from, &needle);
}

/// `text.split(/\r?\n/)`
pub fn splitLines(allocator: std.mem.Allocator, text: Str) ![]Str {
    var lines: std.ArrayList(Str) = .empty;
    var start: usize = 0;
    var i: usize = 0;
    while (std.mem.indexOfScalarPos(u16, text, i, '\n')) |nl| {
        var end = nl;
        if (end > start and text[end - 1] == '\r') end -= 1;
        try lines.append(allocator, text[start..end]);
        start = nl + 1;
        i = nl + 1;
    }
    try lines.append(allocator, text[start..]);
    return lines.items;
}

/// Strings joined by `\n`, as `head + lines.map(l => '\n' + l)`: a body of
/// text the TypeScript rule built by joining lines, without the copy.
pub const Joined = struct {
    head: Str,
    rest: []const Str = &.{},

    pub fn len(self: Joined) usize {
        var n = self.head.len;
        for (self.rest) |l| n += 1 + l.len;
        return n;
    }

    /// The last `k` units (or all, if shorter) into `buf`.
    pub fn tail(self: Joined, buf: []u16) Str {
        var w = buf.len;
        var r = self.rest.len;
        while (w > 0 and r > 0) {
            r -= 1;
            const piece = self.rest[r];
            const take = @min(piece.len, w);
            @memcpy(buf[w - take .. w], piece[piece.len - take ..]);
            w -= take;
            if (w == 0) break;
            buf[w - 1] = '\n';
            w -= 1;
        }
        if (w > 0 and r == 0) {
            const take = @min(self.head.len, w);
            @memcpy(buf[w - take .. w], self.head[self.head.len - take ..]);
            w -= take;
        }
        return buf[w..];
    }
};

/// `new RegExp(`\\b${name}\\b`).test(hay)` for a `name` of `[\w$]` units.
///
/// With only word characters this is "some maximal run of `\w` in `hay`
/// equals `name`". A `$` in the name is an end-of-input anchor, so the
/// pattern can only match at the very end of `hay` - or never, when a word
/// character follows the `$`.
pub fn wordBoundedTest(allocator: std.mem.Allocator, name: Str, hay: Joined) !bool {
    if (indexOfScalar(name, '$')) |dollar| {
        for (name[dollar..]) |c| {
            if (c != '$') return false;
        }
        const prefix = name[0..dollar];
        var stack: [256]u16 = undefined;
        const buf = if (prefix.len + 1 <= stack.len) stack[0..] else try allocator.alloc(u16, prefix.len + 1);
        const total = hay.len();
        const t = hay.tail(buf[0..@min(total, prefix.len + 1)]);
        return dollarMatch(prefix, t, total);
    }
    if (findWordRun(hay.head, name)) return true;
    for (hay.rest) |l| {
        if (findWordRun(l, name)) return true;
    }
    return false;
}

/// `\b<prefix>$+\b` against a text of length `total` whose last units are
/// `t` (at least `prefix.len + 1` of them, or the whole text).
pub fn dollarMatch(prefix: Str, t: Str, total: usize) bool {
    if (total < prefix.len) return false;
    if (total == 0) return false;
    // The match is the last prefix.len units; the boundary at the end needs
    // a word character last, and the one before the prefix depends on it.
    if (!std.mem.eql(u16, t[t.len - prefix.len ..], prefix)) return false;
    if (!isWord(t[t.len - 1])) return false;
    if (prefix.len == 0) return true;
    // prefix[0] is a word character: the unit before it must not be
    const before_at = t.len - prefix.len;
    if (before_at == 0) return true;
    return !isWord(t[before_at - 1]);
}

/// Whether `name` (word characters only) occurs in `s` as a whole `\w` run.
pub fn findWordRun(s: Str, name: Str) bool {
    if (name.len == 0 or s.len < name.len) return false;
    var from: usize = 0;
    while (indexOfFrom(s, from, name)) |p| {
        const before_ok = p == 0 or !isWord(s[p - 1]);
        const after_ok = p + name.len == s.len or !isWord(s[p + name.len]);
        if (before_ok and after_ok) return true;
        from = p + 1;
    }
    return false;
}

/// `new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`)` - `name` as a whole
/// identifier: the index of the first such occurrence in `s`.
pub fn searchWholeIdentifier(s: Str, name: Str) ?usize {
    if (name.len == 0) return null;
    var from: usize = 0;
    while (indexOfFrom(s, from, name)) |p| {
        const before_ok = p == 0 or !isIdent(s[p - 1]);
        const after_ok = p + name.len == s.len or !isIdent(s[p + name.len]);
        if (before_ok and after_ok) return p;
        from = p + 1;
    }
    return null;
}

/// Hashing for UTF-16 keys.
pub const StrContext = struct {
    pub fn hash(_: StrContext, k: Str) u64 {
        return std.hash.Wyhash.hash(0, std.mem.sliceAsBytes(k));
    }
    pub fn eql(_: StrContext, a: Str, b: Str) bool {
        return std.mem.eql(u16, a, b);
    }
};

test "toUtf16" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const s = try toUtf16(arena.allocator(), "aé😀\xff");
    try std.testing.expectEqualSlices(u16, &.{ 'a', 0xE9, 0xD83D, 0xDE00, 0xFFFD }, s);
}

test "wordBoundedTest with dollar anchors" {
    const u = std.unicode.utf8ToUtf16LeStringLiteral;
    try std.testing.expect(try wordBoundedTest(std.testing.allocator, u("foo"), .{ .head = u("a foo b") }));
    try std.testing.expect(!try wordBoundedTest(std.testing.allocator, u("foo"), .{ .head = u("afoo b") }));
    try std.testing.expect(!try wordBoundedTest(std.testing.allocator, u("$foo"), .{ .head = u("$foo") }));
    try std.testing.expect(try wordBoundedTest(std.testing.allocator, u("foo$"), .{ .head = u("x\nfoo") }));
    try std.testing.expect(!try wordBoundedTest(std.testing.allocator, u("foo$"), .{ .head = u("x\nfoo ") }));
    try std.testing.expect(try wordBoundedTest(std.testing.allocator, u("$"), .{ .head = u("ab") }));
    try std.testing.expect(!try wordBoundedTest(std.testing.allocator, u("$"), .{ .head = u("a$") }));
    try std.testing.expect(try wordBoundedTest(std.testing.allocator, u("foo$"), .{ .head = u("x"), .rest = &.{u("foo")} }));
}
