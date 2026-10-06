//! `pickier/sort-tailwind-classes` - port of packages/pickier/src/rules/sort/tailwind-classes.ts
//!
//! Finds class lists in `class="..."` / `className='...'` / `:class` attributes,
//! `class={`...`}` templates and `clsx`/`cn`/`tw`/`cva`/`tv` string arguments
//! anywhere in the file, and reports each list that is not in the rule's
//! group / variant / `localeCompare` order.
//!
//! The order falls back on ICU collation, which st_collate.zig has for ASCII
//! only: a file whose order would need it for other characters is declined,
//! and so is a `constructor:` variant, which the TypeScript lookup resolves
//! through `Object.prototype`.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const collate = @import("st_collate.zig");

const Allocator = std.mem.Allocator;

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const content = ctx.content;
    const matches = try extractClassValues(a, content);

    var classes: std.ArrayList([]const u8) = .empty;
    var keyed: std.ArrayList(Keyed) = .empty;
    // Line and column of `start`, counted forward as the matches are in order
    var line: u32 = 1;
    var line_start: usize = 0;
    var counted: usize = 0;

    for (matches) |m| {
        classes.clearRetainingCapacity();
        try parseClasses(a, m.value, &classes);
        if (classes.items.len < 2) continue;

        keyed.clearRetainingCapacity();
        for (classes.items) |cls| try keyed.append(a, .{
            .cls = cls,
            .group = groupIndex(cls),
            .variant = variantPriority(cls) orelse return error.Declined,
        });
        try requireAsciiOrder(keyed.items);
        std.mem.sort(Keyed, keyed.items, {}, lessThan);

        var sorted = true;
        for (classes.items, keyed.items) |c, k| {
            if (!std.mem.eql(u8, c, k.cls)) {
                sorted = false;
                break;
            }
        }
        if (sorted) continue;

        while (counted < m.start) : (counted += 1) {
            if (content[counted] == '\n') {
                line += 1;
                line_start = counted + 1;
            }
        }
        var expected: std.ArrayList(u8) = .empty;
        for (keyed.items, 0..) |k, n| {
            if (n > 0) try expected.append(a, ' ');
            try expected.appendSlice(a, k.cls);
        }
        try out.append(a, .{
            .line = line,
            .column = @intCast(text.utf16Len(content[line_start..m.start]) + 1),
            .rule_id = "pickier/sort-tailwind-classes",
            .message = try std.fmt.allocPrint(a, "Tailwind classes are not in the recommended order. Expected: \"{s}\"", .{expected.items}),
            .severity = .warning,
            .help = "Run with --fix to automatically sort Tailwind classes, or reorder them manually.",
        });
    }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const Keyed = struct { cls: []const u8, group: u32, variant: u32 };

fn lessThan(_: void, x: Keyed, y: Keyed) bool {
    if (x.group != y.group) return x.group < y.group;
    if (x.variant != y.variant) return x.variant < y.variant;
    return (collate.compareAscii(x.cls, y.cls) orelse unreachable) == .lt;
}

/// Decline when two classes the sort may compare by collation are not both
/// ASCII: those are the only `localeCompare` calls whose result matters.
fn requireAsciiOrder(items: []const Keyed) !void {
    for (items, 0..) |x, i| {
        if (isAscii(x.cls)) continue;
        for (items, 0..) |y, j| {
            if (i != j and x.group == y.group and x.variant == y.variant) return error.Declined;
        }
    }
}

fn isAscii(s: []const u8) bool {
    for (s) |c| if (c >= 0x80) return false;
    return true;
}

const Prefixes = struct { words: []const []const u8, exact: bool, group: u32 };

/// GROUP_ORDER: `^(a|b|...)$` (exact) or `^(a|b|...)` (prefix), first match wins.
const group_order = [_]Prefixes{
    .{ .exact = true, .group = 0, .words = &.{ "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "flow-root", "contents", "hidden", "table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "list-item", "subgrid" } },
    .{ .exact = false, .group = 1, .words = &.{ "container", "columns", "break-after", "break-before", "break-inside", "box-decoration", "box-border", "box-content", "float", "clear", "isolation", "object", "overflow", "overscroll", "position", "inset", "top", "right", "bottom", "left", "start", "end", "z-", "aspect", "order" } },
    .{ .exact = true, .group = 1, .words = &.{ "static", "fixed", "absolute", "relative", "sticky" } },
    .{ .exact = true, .group = 1, .words = &.{ "visible", "invisible", "collapse" } },
    .{ .exact = false, .group = 2, .words = &.{ "basis", "flex-", "grow", "shrink", "order", "grid-", "col-", "row-", "auto-cols", "auto-rows", "gap", "justify", "items", "content", "self", "place" } },
    // group 3 (spacing) is `spacing_words` followed by `-`, handled in groupIndex
    .{ .exact = false, .group = 4, .words = &.{ "w-", "h-", "min-w", "max-w", "min-h", "max-h", "size-" } },
    .{ .exact = false, .group = 5, .words = &.{ "font", "text", "tracking", "leading", "list", "placeholder", "vertical", "whitespace", "break", "hyphens", "content", "truncate", "overflow-ellipsis", "overflow-clip", "line-clamp", "underline", "overline", "line-through", "no-underline", "uppercase", "lowercase", "capitalize", "normal-case", "italic", "not-italic", "ordinal", "slashed-zero", "lining-nums", "oldstyle-nums", "proportional-nums", "tabular-nums", "diagonal-fractions", "stacked-fractions", "normal-nums", "antialiased", "subpixel-antialiased" } },
    .{ .exact = false, .group = 6, .words = &.{ "bg-", "from-", "via-", "to-", "gradient-" } },
    .{ .exact = false, .group = 7, .words = &.{ "border", "rounded", "outline", "ring", "divide", "accent" } },
    .{ .exact = false, .group = 8, .words = &.{ "shadow", "opacity", "mix-blend", "bg-blend" } },
    .{ .exact = false, .group = 9, .words = &.{ "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "saturate", "sepia", "backdrop" } },
    .{ .exact = false, .group = 10, .words = &.{ "border-collapse", "border-separate", "border-spacing", "table-auto", "table-fixed", "caption" } },
    .{ .exact = false, .group = 11, .words = &.{ "transition", "duration", "ease", "delay", "animate" } },
    .{ .exact = false, .group = 12, .words = &.{ "scale", "rotate", "translate", "skew", "origin", "transform", "perspective" } },
    .{ .exact = false, .group = 13, .words = &.{ "appearance", "cursor", "caret", "pointer-events", "resize", "scroll", "snap", "touch", "select", "will-change" } },
    .{ .exact = false, .group = 14, .words = &.{ "fill", "stroke" } },
    .{ .exact = true, .group = 15, .words = &.{ "sr-only", "not-sr-only" } },
};

const spacing_words = [_][]const u8{ "p", "px", "py", "ps", "pe", "pt", "pr", "pb", "pl", "m", "mx", "my", "ms", "me", "mt", "mr", "mb", "ml", "space", "indent" };

fn matchesAny(base: []const u8, p: Prefixes) bool {
    for (p.words) |w| {
        if (if (p.exact) std.mem.eql(u8, base, w) else std.mem.startsWith(u8, base, w)) return true;
    }
    return false;
}

/// `/^(p|px|...|indent)-/`
fn isSpacing(base: []const u8) bool {
    for (spacing_words) |w| {
        if (base.len > w.len and std.mem.startsWith(u8, base, w) and base[w.len] == '-') return true;
    }
    return false;
}

/// `stripVariants`: drop `variant:` segments, stopping at a segment that
/// starts with `[` or is followed by one.
fn stripVariants(cls: []const u8) []const u8 {
    var i: usize = 0;
    while (i < cls.len) {
        if (cls[i] == '[') break;
        const colon = std.mem.indexOfScalarPos(u8, cls, i, ':') orelse break;
        if (colon + 1 < cls.len and cls[colon + 1] == '[') break;
        i = colon + 1;
    }
    return cls[i..];
}

fn groupIndex(cls: []const u8) u32 {
    var base = stripVariants(cls);
    if (std.mem.startsWith(u8, base, "!")) base = base[1..];
    for (group_order) |p| {
        // GROUP_ORDER has the two spacing patterns between groups 2 and 4
        if (p.group == 4) {
            if (isSpacing(base)) return 3;
            if (base.len > 0 and base[0] == '-' and isSpacing(base[1..])) return 3;
        }
        if (matchesAny(base, p)) return p.group;
    }
    return 99;
}

fn isVariantChar(c: u8) bool {
    return (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9');
}

/// `getVariantPriority`: from `/^([a-z0-9][-a-z0-9]{0,50}:)+(?!\[)/`. Null for
/// a `constructor` variant, which the TypeScript lookup table finds on
/// `Object.prototype` and turns the priority into a string.
fn variantPriority(cls: []const u8) ?u32 {
    var total: u32 = 10;
    var count: usize = 0;
    var constructors: usize = 0;
    // The last segment, which `(?!\[)` may give back
    var last_add: u32 = 0;
    var last_constructor = false;
    var i: usize = 0;
    while (i < cls.len and isVariantChar(cls[i])) {
        var j = i + 1;
        while (j < cls.len and j - i - 1 < 50 and (isVariantChar(cls[j]) or cls[j] == '-')) j += 1;
        if (j >= cls.len or cls[j] != ':') break;
        const seg = cls[i..j];
        last_add = if (std.mem.eql(u8, seg, "sm")) 1 else if (std.mem.eql(u8, seg, "md")) 2 else if (std.mem.eql(u8, seg, "lg")) 3 else if (std.mem.eql(u8, seg, "xl")) 4 else if (std.mem.eql(u8, seg, "2xl")) 5 else 20;
        last_constructor = std.mem.eql(u8, seg, "constructor");
        if (last_constructor) constructors += 1;
        total += last_add;
        count += 1;
        i = j + 1;
    }
    if (i < cls.len and cls[i] == '[' and count > 0) {
        count -= 1;
        total -= last_add;
        if (last_constructor) constructors -= 1;
    }
    if (count == 0) return 0;
    if (constructors > 0) return null;
    return total;
}

// ---------------------------------------------------------------------------
// Class value extraction
// ---------------------------------------------------------------------------

const Match = struct { value: []const u8, start: usize };

/// First occurrence of `c` at or after a position, remembered between the
/// forward-moving calls so that unclosed quotes do not rescan the file.
const NextChar = struct {
    c: u8,
    from: usize = 0,
    at: ?usize = null,
    valid: bool = false,

    fn find(self: *NextChar, s: []const u8, pos: usize) ?usize {
        if (self.valid and pos >= self.from) {
            if (self.at) |at| {
                if (pos <= at) return at;
            } else return null;
        }
        self.from = pos;
        self.at = std.mem.indexOfScalarPos(u8, s, pos, self.c);
        self.valid = true;
        return self.at;
    }
};

const Finders = struct {
    dq: NextChar = .{ .c = '"' },
    sq: NextChar = .{ .c = '\'' },
    bt: NextChar = .{ .c = '`' },
};

fn skipSpace(s: []const u8, start: usize) usize {
    var i = start;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) break;
        i += n;
    }
    return i;
}

/// `\b` at `p`
fn isBoundary(s: []const u8, p: usize) bool {
    const before = p > 0 and text.isWordByte(s[p - 1]);
    const after = p < s.len and text.isWordByte(s[p]);
    return before != after;
}

const Found = struct { value: []const u8, end: usize };

/// `(?:"([^"]*?)"|'([^']*?)')` at `i`
fn quoted(s: []const u8, i: usize, f: *Finders) ?Found {
    if (i >= s.len) return null;
    const finder = switch (s[i]) {
        '"' => &f.dq,
        '\'' => &f.sq,
        else => return null,
    };
    const close = finder.find(s, i + 1) orelse return null;
    return .{ .value = s[i + 1 .. close], .end = close + 1 };
}

/// `\s*=\s*` then the attribute tail for ATTR_RE or ATTR_TMPL_RE
fn attrTail(s: []const u8, from: usize, template: bool, f: *Finders) ?Found {
    var i = skipSpace(s, from);
    if (i >= s.len or s[i] != '=') return null;
    i = skipSpace(s, i + 1);
    if (!template) return quoted(s, i, f);
    // `\{`([^`]*?)`\}`
    if (!std.mem.startsWith(u8, s[i..], "{`")) return null;
    const close = f.bt.find(s, i + 2) orelse return null;
    if (close + 1 >= s.len or s[close + 1] != '}') return null;
    return .{ .value = s[i + 2 .. close], .end = close + 2 };
}

/// `\b(?:class|className|:class)` + tail, anchored at `p`
fn attrAt(s: []const u8, p: usize, template: bool, f: *Finders) ?Found {
    if (!isBoundary(s, p)) return null;
    for ([_][]const u8{ "class", "className", ":class" }) |kw| {
        if (!std.mem.startsWith(u8, s[p..], kw)) continue;
        if (attrTail(s, p + kw.len, template, f)) |found| return found;
    }
    return null;
}

/// `\b(?:clsx|cn|tw|cva|tv)\s*\(\s*` + quoted string, anchored at `p`
fn utilAt(s: []const u8, p: usize, f: *Finders) ?Found {
    if (!isBoundary(s, p)) return null;
    for ([_][]const u8{ "clsx", "cn", "tw", "cva", "tv" }) |kw| {
        if (!std.mem.startsWith(u8, s[p..], kw)) continue;
        var i = skipSpace(s, p + kw.len);
        if (i >= s.len or s[i] != '(') continue;
        i = skipSpace(s, i + 1);
        if (quoted(s, i, f)) |found| return found;
    }
    return null;
}

const Pattern = enum { attr, attr_template, util };

fn extractClassValues(a: Allocator, content: []const u8) ![]Match {
    var matches: std.ArrayList(Match) = .empty;
    const needles = [_][]const u8{ "class", "clsx", "cn(", "tw(", "cva(", "tv(" };
    var any = false;
    for (needles) |n| {
        if (std.mem.indexOf(u8, content, n) != null) {
            any = true;
            break;
        }
    }
    if (!any) return matches.items;

    var scratch: std.ArrayList(u8) = .empty;
    for ([_]Pattern{ .attr, .attr_template, .util }) |pattern| {
        var f: Finders = .{};
        var p: usize = 0;
        while (p < content.len) {
            const c = content[p];
            const candidate = switch (pattern) {
                .attr, .attr_template => c == 'c' or c == ':',
                .util => c == 'c' or c == 't',
            };
            if (!candidate) {
                p += 1;
                continue;
            }
            const found = switch (pattern) {
                .attr => attrAt(content, p, false, &f),
                .attr_template => attrAt(content, p, true, &f),
                .util => utilAt(content, p, &f),
            } orelse {
                p += 1;
                continue;
            };
            const index = p;
            p = found.end;
            const value = found.value;
            if (text.trim(value).len == 0) continue;
            // Skip dynamic binding expressions
            if (try looksLikeJsExpression(a, &scratch, value)) continue;
            const start = std.mem.indexOfPos(u8, content, index, value) orelse continue;
            try matches.append(a, .{ .value = value, .start = start });
        }
    }

    // By position, keeping pattern order for equal starts (a stable sort)
    std.mem.sort(Match, matches.items, {}, struct {
        fn lt(_: void, x: Match, y: Match) bool {
            return x.start < y.start;
        }
    }.lt);
    return matches.items;
}

const js_words = [_][]const u8{ "true", "false", "null", "undefined", "function", "return", "typeof", "instanceof" };

fn looksLikeJsExpression(a: Allocator, scratch: *std.ArrayList(u8), value: []const u8) !bool {
    // `value.replace(/\[[^\]]*\]/g, '')`
    scratch.clearRetainingCapacity();
    var i: usize = 0;
    var no_close = false;
    while (i < value.len) {
        if (value[i] == '[' and !no_close) {
            if (std.mem.indexOfScalarPos(u8, value, i + 1, ']')) |close| {
                i = close + 1;
                continue;
            }
            no_close = true;
        }
        try scratch.append(a, value[i]);
        i += 1;
    }
    const s = scratch.items;

    if (std.mem.indexOfAny(u8, s, "'\"`") != null) return true;
    if (std.mem.indexOfAny(u8, s, "{}()=") != null) return true;
    if (std.mem.indexOf(u8, s, " ? ") != null or std.mem.indexOf(u8, s, " && ") != null or std.mem.indexOf(u8, s, " || ") != null) return true;

    // `/\b(?:true|false|...)\b/`: a whole ASCII word
    var k: usize = 0;
    while (k < s.len) {
        if (!text.isWordByte(s[k])) {
            k += 1;
            continue;
        }
        const w0 = k;
        while (k < s.len and text.isWordByte(s[k])) k += 1;
        const word = s[w0..k];
        for (js_words) |w| {
            if (std.mem.eql(u8, word, w)) return true;
        }
    }
    return false;
}

/// `parseClasses`: split on whitespace outside `[...]`.
fn parseClasses(a: Allocator, value: []const u8, out: *std.ArrayList([]const u8)) !void {
    var depth: usize = 0;
    var start: usize = 0;
    var i: usize = 0;
    while (i < value.len) {
        const c = value[i];
        if (c == '[') {
            depth += 1;
        } else if (c == ']') {
            depth -|= 1;
        } else if (depth == 0) {
            const n = text.whitespaceLenAt(value, i);
            if (n > 0) {
                if (i > start) try out.append(a, value[start..i]);
                i += n;
                start = i;
                continue;
            }
        }
        i += 1;
    }
    if (value.len > start) try out.append(a, value[start..]);
}
