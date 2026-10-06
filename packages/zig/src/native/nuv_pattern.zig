//! `new RegExp(pattern, 'u').test(name)` for the `varsIgnorePattern` and
//! `argsIgnorePattern` options of no-unused-vars.
//!
//! A small backtracking matcher with JavaScript semantics for what such
//! patterns use: literals, `.`, `^`, `$`, `\b`, `\B`, classes and their
//! escapes (`\d \w \s` and negations), groups, alternation, and greedy or
//! lazy `* + ? {n,m}`. Anything else (lookaround, backreferences, named
//! groups, property escapes) is `error.UnsupportedPattern`, and the rule
//! leaves the file to the TypeScript linter.

const std = @import("std");

pub const Error = error{ UnsupportedPattern, OutOfMemory };

const inf = std.math.maxInt(u32);

const Range = struct { lo: u21, hi: u21 };

const ClassItem = union(enum) {
    range: Range,
    digit: bool,
    word: bool,
    space: bool,
};

const Node = union(enum) {
    char: u21,
    any,
    class: struct { items: []const ClassItem, negated: bool },
    start,
    end,
    word_boundary: bool,
    group: []const []const Item,
};

const Item = struct { node: Node, min: u32 = 1, max: u32 = 1, greedy: bool = true };

pub const Pattern = struct {
    alts: []const []const Item,

    pub fn compile(allocator: std.mem.Allocator, source: []const u8) Error!Pattern {
        var p: Parser = .{ .src = source, .allocator = allocator };
        const alts = try p.parseAlts();
        if (p.i != source.len) return error.UnsupportedPattern;
        return .{ .alts = alts };
    }

    /// `re.test(subject)`
    pub fn matches(self: Pattern, subject: []const u16) bool {
        const m: Matcher = .{ .s = subject };
        var start: usize = 0;
        while (start <= subject.len) : (start += 1) {
            for (self.alts) |alt| {
                if (m.seqAt(alt, 0, start, null)) return true;
            }
        }
        return false;
    }
};

const Parser = struct {
    src: []const u8,
    i: usize = 0,
    allocator: std.mem.Allocator,

    fn peek(self: *Parser) ?u8 {
        return if (self.i < self.src.len) self.src[self.i] else null;
    }

    fn parseAlts(self: *Parser) Error![]const []const Item {
        var alts: std.ArrayList([]const Item) = .empty;
        while (true) {
            try alts.append(self.allocator, try self.parseSeq());
            if (self.peek() == '|') {
                self.i += 1;
                continue;
            }
            return alts.items;
        }
    }

    fn parseSeq(self: *Parser) Error![]const Item {
        var items: std.ArrayList(Item) = .empty;
        while (self.peek()) |c| {
            if (c == '|' or c == ')') break;
            var item: Item = .{ .node = try self.parseAtom() };
            if (self.peek()) |q| {
                switch (q) {
                    '*' => {
                        item.min = 0;
                        item.max = inf;
                        self.i += 1;
                    },
                    '+' => {
                        item.min = 1;
                        item.max = inf;
                        self.i += 1;
                    },
                    '?' => {
                        item.min = 0;
                        item.max = 1;
                        self.i += 1;
                    },
                    '{' => {
                        self.i += 1;
                        item.min = try self.number();
                        item.max = item.min;
                        if (self.peek() == ',') {
                            self.i += 1;
                            item.max = if (self.peek() == '}') inf else try self.number();
                        }
                        if (self.peek() != '}' or item.max < item.min) return error.UnsupportedPattern;
                        self.i += 1;
                    },
                    else => {},
                }
                if (q == '*' or q == '+' or q == '?' or q == '{') {
                    if (item.node == .start or item.node == .end or item.node == .word_boundary) return error.UnsupportedPattern;
                    if (self.peek() == '?') {
                        item.greedy = false;
                        self.i += 1;
                    }
                }
            }
            try items.append(self.allocator, item);
        }
        return items.items;
    }

    fn number(self: *Parser) Error!u32 {
        const start = self.i;
        while (self.peek()) |c| {
            if (c < '0' or c > '9') break;
            self.i += 1;
        }
        if (self.i == start) return error.UnsupportedPattern;
        return std.fmt.parseInt(u32, self.src[start..self.i], 10) catch error.UnsupportedPattern;
    }

    fn parseAtom(self: *Parser) Error!Node {
        const c = self.src[self.i];
        switch (c) {
            '^' => {
                self.i += 1;
                return .start;
            },
            '$' => {
                self.i += 1;
                return .end;
            },
            '.' => {
                self.i += 1;
                return .any;
            },
            '(' => {
                self.i += 1;
                if (self.peek() == '?') {
                    if (self.i + 1 < self.src.len and self.src[self.i + 1] == ':') {
                        self.i += 2;
                    } else return error.UnsupportedPattern;
                }
                const alts = try self.parseAlts();
                if (self.peek() != ')') return error.UnsupportedPattern;
                self.i += 1;
                return .{ .group = alts };
            },
            '[' => return self.parseClass(),
            '\\' => {
                self.i += 1;
                const e = self.peek() orelse return error.UnsupportedPattern;
                self.i += 1;
                switch (e) {
                    'b' => return .{ .word_boundary = true },
                    'B' => return .{ .word_boundary = false },
                    'd', 'D', 'w', 'W', 's', 'S' => {
                        const items = try self.allocator.alloc(ClassItem, 1);
                        items[0] = classEscape(e);
                        return .{ .class = .{ .items = items, .negated = false } };
                    },
                    else => {
                        self.i -= 1;
                        return .{ .char = try self.charEscape(false) };
                    },
                }
            },
            '*', '+', '?', '{', '}', ')', ']' => return error.UnsupportedPattern,
            else => return .{ .char = try self.literal() },
        }
    }

    fn classEscape(e: u8) ClassItem {
        return switch (std.ascii.toLower(e)) {
            'd' => .{ .digit = std.ascii.isLower(e) },
            'w' => .{ .word = std.ascii.isLower(e) },
            else => .{ .space = std.ascii.isLower(e) },
        };
    }

    /// One literal code point of the source.
    fn literal(self: *Parser) Error!u21 {
        const len = std.unicode.utf8ByteSequenceLength(self.src[self.i]) catch return error.UnsupportedPattern;
        if (self.i + len > self.src.len) return error.UnsupportedPattern;
        const cp = std.unicode.utf8Decode(self.src[self.i .. self.i + len]) catch return error.UnsupportedPattern;
        self.i += len;
        return cp;
    }

    /// The escape after a backslash that stands for one character.
    fn charEscape(self: *Parser, in_class: bool) Error!u21 {
        const e = self.src[self.i];
        self.i += 1;
        return switch (e) {
            't' => '\t',
            'n' => '\n',
            'r' => '\r',
            'v' => 0x0B,
            'f' => 0x0C,
            '0' => if (self.peek()) |d| (if (d >= '0' and d <= '9') error.UnsupportedPattern else 0) else 0,
            'x' => self.hex(2),
            'u' => blk: {
                if (self.peek() == '{') {
                    self.i += 1;
                    const start = self.i;
                    while (self.peek()) |d| {
                        if (d == '}') break;
                        self.i += 1;
                    }
                    if (self.peek() != '}') break :blk error.UnsupportedPattern;
                    const v = std.fmt.parseInt(u21, self.src[start..self.i], 16) catch break :blk error.UnsupportedPattern;
                    self.i += 1;
                    break :blk v;
                }
                break :blk self.hex(4);
            },
            // Identity escapes the `u` flag allows; `\-` only in a class
            '^', '$', '\\', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/' => e,
            '-' => if (in_class) e else error.UnsupportedPattern,
            else => error.UnsupportedPattern,
        };
    }

    fn hex(self: *Parser, n: usize) Error!u21 {
        if (self.i + n > self.src.len) return error.UnsupportedPattern;
        const v = std.fmt.parseInt(u21, self.src[self.i .. self.i + n], 16) catch return error.UnsupportedPattern;
        self.i += n;
        return v;
    }

    fn parseClass(self: *Parser) Error!Node {
        self.i += 1;
        var negated = false;
        if (self.peek() == '^') {
            negated = true;
            self.i += 1;
        }
        var items: std.ArrayList(ClassItem) = .empty;
        while (true) {
            const c = self.peek() orelse return error.UnsupportedPattern;
            if (c == ']') {
                self.i += 1;
                break;
            }
            const lo = try self.classAtom();
            if (self.peek() == '-' and self.i + 1 < self.src.len and self.src[self.i + 1] != ']') {
                self.i += 1;
                const hi = try self.classAtom();
                if (lo != .range or hi != .range or hi.range.lo < lo.range.lo) return error.UnsupportedPattern;
                try items.append(self.allocator, .{ .range = .{ .lo = lo.range.lo, .hi = hi.range.lo } });
                continue;
            }
            try items.append(self.allocator, lo);
        }
        return .{ .class = .{ .items = items.items, .negated = negated } };
    }

    fn classAtom(self: *Parser) Error!ClassItem {
        const c = self.src[self.i];
        if (c != '\\') {
            const cp = try self.literal();
            return .{ .range = .{ .lo = cp, .hi = cp } };
        }
        self.i += 1;
        const e = self.peek() orelse return error.UnsupportedPattern;
        switch (e) {
            'd', 'D', 'w', 'W', 's', 'S' => {
                self.i += 1;
                return classEscape(e);
            },
            'b' => {
                self.i += 1;
                return .{ .range = .{ .lo = 0x08, .hi = 0x08 } };
            },
            else => {
                const cp = try self.charEscape(true);
                return .{ .range = .{ .lo = cp, .hi = cp } };
            },
        }
    }
};

const Frame = struct {
    repeat: bool,
    seq: []const Item,
    idx: usize,
    count: u32 = 0,
    start: usize = 0,
    next: ?*const Frame,
};

const Matcher = struct {
    s: []const u16,

    fn isWordAt(self: Matcher, i: isize) bool {
        if (i < 0 or i >= @as(isize, @intCast(self.s.len))) return false;
        const c = self.s[@intCast(i)];
        return (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_';
    }

    fn run(self: Matcher, f: ?*const Frame, pos: usize) bool {
        const fr = f orelse return true;
        if (!fr.repeat) return self.seqAt(fr.seq, fr.idx, pos, fr.next);
        // One more iteration of fr.seq[fr.idx] just finished; an optional one
        // that matched nothing fails, as in JavaScript
        if (pos == fr.start and fr.count > fr.seq[fr.idx].min) return false;
        return self.rep(fr.seq, fr.idx, pos, fr.count, fr.next);
    }

    fn seqAt(self: Matcher, seq: []const Item, idx: usize, pos: usize, next: ?*const Frame) bool {
        if (idx == seq.len) return self.run(next, pos);
        return self.rep(seq, idx, pos, 0, next);
    }

    fn rep(self: Matcher, seq: []const Item, idx: usize, pos: usize, count: u32, next: ?*const Frame) bool {
        const item = seq[idx];
        const again: Frame = .{ .repeat = true, .seq = seq, .idx = idx, .count = count + 1, .start = pos, .next = next };
        const after: Frame = .{ .repeat = false, .seq = seq, .idx = idx + 1, .next = next };
        if (count < item.min) return self.one(item.node, pos, &again);
        if (count >= item.max) return self.run(&after, pos);
        if (item.greedy) return self.one(item.node, pos, &again) or self.run(&after, pos);
        return self.run(&after, pos) or self.one(item.node, pos, &again);
    }

    fn one(self: Matcher, node: Node, pos: usize, k: *const Frame) bool {
        const s = self.s;
        switch (node) {
            .char => |c| return pos < s.len and s[pos] == c and self.run(k, pos + 1),
            .any => {
                if (pos >= s.len) return false;
                const c = s[pos];
                if (c == '\n' or c == '\r' or c == 0x2028 or c == 0x2029) return false;
                return self.run(k, pos + 1);
            },
            .class => |cls| {
                if (pos >= s.len) return false;
                if (classHas(cls.items, s[pos]) == cls.negated) return false;
                return self.run(k, pos + 1);
            },
            .start => return pos == 0 and self.run(k, pos),
            .end => return pos == s.len and self.run(k, pos),
            .word_boundary => |want| {
                const p: isize = @intCast(pos);
                const at = self.isWordAt(p - 1) != self.isWordAt(p);
                return at == want and self.run(k, pos);
            },
            .group => |alts| {
                for (alts) |alt| {
                    if (self.seqAt(alt, 0, pos, k)) return true;
                }
                return false;
            },
        }
    }

    fn classHas(items: []const ClassItem, c: u16) bool {
        for (items) |item| {
            const hit = switch (item) {
                .range => |r| c >= r.lo and c <= r.hi,
                .digit => |want| (c >= '0' and c <= '9') == want,
                .word => |want| ((c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '_') == want,
                .space => |want| isSpace(c) == want,
            };
            if (hit) return true;
        }
        return false;
    }

    fn isSpace(c: u16) bool {
        return switch (c) {
            0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF => true,
            else => false,
        };
    }
};

test "ignore patterns" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const u = std.unicode.utf8ToUtf16LeStringLiteral;
    const p = try Pattern.compile(a, "^_");
    try std.testing.expect(p.matches(u("_x")));
    try std.testing.expect(!p.matches(u("x_")));
    const q = try Pattern.compile(a, "^(_|ignored)$|Unused\\d*");
    try std.testing.expect(q.matches(u("ignored")));
    try std.testing.expect(!q.matches(u("ignoredX")));
    try std.testing.expect(q.matches(u("fooUnused12")));
    const r = try Pattern.compile(a, "^[a-c]+?x{2,}$");
    try std.testing.expect(r.matches(u("abxx")));
    try std.testing.expect(!r.matches(u("abx")));
    const w = try Pattern.compile(a, "^\\W\\D");
    try std.testing.expect(w.matches(u("$a")));
    try std.testing.expect(!w.matches(u("a$")));
    try std.testing.expectError(error.UnsupportedPattern, Pattern.compile(a, "\\-"));
    try std.testing.expectError(error.UnsupportedPattern, Pattern.compile(a, "(?=x)"));
    try std.testing.expectError(error.UnsupportedPattern, Pattern.compile(a, "\\1"));
}
