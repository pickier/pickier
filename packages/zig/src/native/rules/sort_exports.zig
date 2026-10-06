//! `pickier/sort-exports` - port of packages/pickier/src/rules/sort/exports.ts
//!
//! Each run of consecutive lines (`/\r?\n/`) matching
//!
//!   /^export\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/
//!
//! is sorted, whole lines, with `Array.prototype.sort` (stable) and the
//! rule's comparator; a run that sorts differently is reported once, at its
//! first line out of place. `partitionByNewLine` changes nothing: a run ends
//! at the first other line either way.
//!
//! Options come from the plan, which is what the TypeScript rule reads from
//! `pluginRules['pickier/sort-exports'][1]` when that is where they are set.
//! The `localeCompare` orders are ported for ASCII; a run with a non-ASCII
//! line that has to be collated is declined to the TypeScript linter.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const collate = @import("st_collate.zig");

const rule_id = "pickier/sort-exports";

const SortType = enum { alphabetical, natural, line_length, unsorted };

const Options = struct {
    type: SortType = .alphabetical,
    desc: bool = false,
    ignore_case: bool = false,
};

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const opts = parseOptions(ctx.options);
    // Nothing is ever out of order
    if (opts.type == .unsorted) return;

    const lines = try text.splitLines(a, ctx.content);
    var keys: std.ArrayList(Key) = .empty;
    var order: std.ArrayList(u32) = .empty;

    var i: usize = 0;
    while (i < lines.len) {
        while (i < lines.len and !isExportLine(lines[i])) i += 1;
        if (i >= lines.len) break;
        var j = i;
        while (j < lines.len and isExportLine(lines[j])) j += 1;

        const block = lines[i..j];
        if (block.len > 1) {
            keys.clearRetainingCapacity();
            order.clearRetainingCapacity();
            for (block, 0..) |line, k| {
                try keys.append(a, try makeKey(a, line, opts));
                try order.append(a, @intCast(k));
            }
            std.sort.block(u32, order.items, Sorter{ .keys = keys.items, .opts = opts }, Sorter.lessThan);
            for (block, order.items, 0..) |line, s, k| {
                if (std.mem.eql(u8, line, block[s])) continue;
                try out.append(a, .{
                    .line = @intCast(i + k + 1),
                    .column = 1,
                    .rule_id = rule_id,
                    .message = "Export statements are not sorted.",
                    .severity = .warning,
                });
                break;
            }
        }
        // The line after the run is not an export line
        i = j + 1;
    }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// `(options || {})` read as the TypeScript does: a missing or non-string
/// `type` is alphabetical, `order` is descending only as `'desc'`, and
/// `ignoreCase` is JavaScript truthiness.
fn parseOptions(value: ?std.json.Value) Options {
    var opts: Options = .{};
    const v = value orelse return opts;
    if (v != .object) return opts;
    const obj = v.object;
    if (obj.get("type")) |t| {
        if (t == .string) {
            if (std.mem.eql(u8, t.string, "natural")) opts.type = .natural;
            if (std.mem.eql(u8, t.string, "line-length")) opts.type = .line_length;
            if (std.mem.eql(u8, t.string, "unsorted")) opts.type = .unsorted;
        }
    }
    if (obj.get("order")) |o| {
        opts.desc = o == .string and std.mem.eql(u8, o.string, "desc");
    }
    if (obj.get("ignoreCase")) |c| opts.ignore_case = truthy(c);
    return opts;
}

fn truthy(v: std.json.Value) bool {
    return switch (v) {
        .null => false,
        .bool => |b| b,
        .integer => |n| n != 0,
        .float => |f| f != 0 and !std.math.isNan(f),
        .number_string => |s| (std.fmt.parseFloat(f64, s) catch 1) != 0,
        .string => |s| s.len > 0,
        .array, .object => true,
    };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/// What the comparator looks at: the line (lowercased with `ignoreCase`) or
/// its `.length`.
const Key = struct { str: []const u8, len: usize };

fn makeKey(a: std.mem.Allocator, line: []const u8, opts: Options) !Key {
    switch (opts.type) {
        .line_length => {
            var len = text.utf16Len(line);
            // `toLowerCase` changes the length of one character only:
            // U+0130 becomes `i` and a combining dot above
            if (opts.ignore_case) len += std.mem.count(u8, line, "\u{130}");
            return .{ .str = line, .len = len };
        },
        .alphabetical, .natural => {
            if (!isAscii(line)) return error.Declined;
            // Base strength ignores case already
            if (!opts.ignore_case or opts.type == .natural) return .{ .str = line, .len = 0 };
            const lower = try a.alloc(u8, line.len);
            return .{ .str = std.ascii.lowerString(lower, line), .len = 0 };
        },
        .unsorted => unreachable,
    }
}

const Sorter = struct {
    keys: []const Key,
    opts: Options,

    fn lessThan(self: Sorter, x: u32, y: u32) bool {
        const kx = self.keys[x];
        const ky = self.keys[y];
        var ord: std.math.Order = switch (self.opts.type) {
            .line_length => std.math.order(kx.len, ky.len),
            .natural => compareNatural(kx.str, ky.str),
            .alphabetical => collate.compareAscii(kx.str, ky.str) orelse unreachable,
            .unsorted => unreachable,
        };
        if (self.opts.desc) ord = ord.invert();
        return ord == .lt;
    }
};

fn isAscii(s: []const u8) bool {
    for (s) |c| if (c >= 0x80) return false;
    return true;
}

/// Primary weights of `localeCompare` for ASCII, as in st_collate.zig: 0 for
/// the ignorable controls, then whitespace, punctuation and symbols, digits,
/// and letters with both cases equal.
const symbol_order = "\t\n\x0b\x0c\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789";

const primary: [128]u8 = blk: {
    var t: [128]u8 = @splat(0);
    var w: u8 = 1;
    for (symbol_order) |c| {
        t[c] = w;
        w += 1;
    }
    for (0..26) |k| {
        t['a' + k] = w;
        t['A' + k] = w;
        w += 1;
    }
    break :blk t;
};

/// One collation element at primary strength: a character's weight, or a
/// number from a run of digits.
const Unit = struct {
    weight: u8,
    /// The digits of a number, leading zeros dropped
    number: []const u8 = "",
};

/// The primary collation elements of an ASCII string under ICU numeric
/// collation. A run of digits (an ignorable control ends it) becomes numbers
/// of at most 254 digits each, every one without its leading zeros.
const Units = struct {
    s: []const u8,
    i: usize = 0,
    run_end: usize = 0,

    fn next(self: *Units) ?Unit {
        if (self.i >= self.run_end) {
            while (self.i < self.s.len and primary[self.s[self.i]] == 0) self.i += 1;
            if (self.i == self.s.len) return null;
            const c = self.s[self.i];
            if (!std.ascii.isDigit(c)) {
                self.i += 1;
                return .{ .weight = primary[c] };
            }
            var e = self.i;
            while (e < self.s.len and std.ascii.isDigit(self.s[e])) e += 1;
            self.run_end = e;
        }
        // The next number of the digit run
        while (self.i < self.run_end - 1 and self.s[self.i] == '0') self.i += 1;
        const len = @min(self.run_end - self.i, 254);
        const number = self.s[self.i .. self.i + len];
        self.i += len;
        return .{ .weight = primary['0'], .number = number };
    }
};

/// `a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })`
/// for ASCII strings.
fn compareNatural(a: []const u8, b: []const u8) std.math.Order {
    var ua: Units = .{ .s = a };
    var ub: Units = .{ .s = b };
    while (true) {
        const x = ua.next() orelse return if (ub.next() == null) .eq else .lt;
        const y = ub.next() orelse return .gt;
        if (x.weight != y.weight) return std.math.order(x.weight, y.weight);
        if (x.number.len != y.number.len) return std.math.order(x.number.len, y.number.len);
        const ord = std.mem.order(u8, x.number, y.number);
        if (ord != .eq) return ord;
    }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/// `/^export\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/`. No part can
/// backtrack into another match: each `\s+` is followed by a non-space,
/// `[^}]*` ends at the first `}` and `[^'"]+` at the next quote.
fn isExportLine(s: []const u8) bool {
    if (!std.mem.startsWith(u8, s, "export")) return false;
    var i = skipSpaces(s, 6) orelse return false;
    if (i >= s.len or s[i] != '{') return false;
    i = (std.mem.indexOfScalarPos(u8, s, i + 1, '}') orelse return false) + 1;
    i = skipSpaces(s, i) orelse return false;
    if (!std.mem.startsWith(u8, s[i..], "from")) return false;
    i = skipSpaces(s, i + 4) orelse return false;
    if (i >= s.len or (s[i] != '\'' and s[i] != '"')) return false;
    const close = std.mem.indexOfAnyPos(u8, s, i + 1, "'\"") orelse return false;
    if (close == i + 1) return false;
    i = close + 1;
    if (i < s.len and s[i] == ';') i += 1;
    return text.trimStart(s[i..]).len == 0;
}

/// The end of the `\s+` at `i`, or null when there is none.
fn skipSpaces(s: []const u8, i: usize) ?usize {
    var j = i;
    while (j < s.len) {
        const len = text.whitespaceLenAt(s, j);
        if (len == 0) break;
        j += len;
    }
    return if (j > i) j else null;
}

test "export line pattern" {
    try std.testing.expect(isExportLine("export { a } from 'a'"));
    try std.testing.expect(isExportLine("export {a, b as c}\tfrom \"x';  \r"));
    try std.testing.expect(isExportLine("export\u{a0}{} from 'x' "));
    try std.testing.expect(!isExportLine("export {} from ''"));
    try std.testing.expect(!isExportLine(" export { a } from 'a'"));
    try std.testing.expect(!isExportLine("export { a }from 'a'"));
    try std.testing.expect(!isExportLine("export { a } from 'a';;"));
    try std.testing.expect(!isExportLine("export { a } from 'a' // x"));
    try std.testing.expect(!isExportLine("export * from 'a'"));
}

test "natural order" {
    const O = std.math.Order;
    try std.testing.expectEqual(O.eq, compareNatural("01", "1"));
    try std.testing.expectEqual(O.lt, compareNatural("9", "10"));
    try std.testing.expectEqual(O.eq, compareNatural("a", "A"));
    try std.testing.expectEqual(O.lt, compareNatural("1\x012", "12"));
    try std.testing.expectEqual(O.lt, compareNatural("1.5", "1.10"));
    try std.testing.expectEqual(O.lt, compareNatural("~", "0"));
    try std.testing.expectEqual(O.lt, compareNatural("1", "a"));
    try std.testing.expectEqual(O.gt, compareNatural(&(@as([300]u8, @splat('0')) ++ "5".*), "4"));
    try std.testing.expectEqual(O.gt, compareNatural(&(@as([254]u8, @splat('1')) ++ "9".*), "2"));
}
