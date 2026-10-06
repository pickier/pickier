//! `pickier/no-unused-imports` - port of packages/pickier/src/rules/imports/no-unused-imports.ts
//!
//! The local names each `import` statement binds, reported when none of them
//! appears as a whole identifier anywhere outside the import statements, with
//! comments masked. Positions are UTF-16, as in TypeScript.

const std = @import("std");
const types = @import("../types.zig");
const lexer = @import("../lexer.zig");
const js = @import("../nuv_js.zig");

const Str = js.Str;
const Allocator = std.mem.Allocator;

const Binding = struct {
    name: Str,
    /// 1-based
    line: u32,
    /// 0-based
    column: usize,
    type_only: bool,
};

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    // Every statement this rule reads starts with `import`
    if (!js.containsBytes(ctx.content, "import")) return;
    const allocator = ctx.allocator;
    const text = try js.toUtf16(allocator, ctx.content);
    const lines = try js.splitLines(allocator, text);

    var bindings: std.ArrayList(Binding) = .empty;
    const import_lines = try allocator.alloc(bool, lines.len);
    @memset(import_lines, false);

    var statement: std.ArrayList(u16) = .empty;
    var i: usize = 0;
    while (i < lines.len) : (i += 1) {
        if (!startsImportStatement(lines[i])) continue;

        // The whole statement, which may wrap across lines - at most 40 more
        statement.clearRetainingCapacity();
        try statement.appendSlice(allocator, lines[i]);
        var end = i;
        const limit = @min(lines.len - 1, i + 40);
        while (end < limit and !hasFromClause(statement.items) and !isSideEffectImport(statement.items)) {
            end += 1;
            try statement.append(allocator, '\n');
            try statement.appendSlice(allocator, lines[end]);
        }
        if (!hasFromClause(statement.items) and !isSideEffectImport(statement.items)) continue;

        for (i..end + 1) |ln| import_lines[ln] = true;
        try bindingsOf(allocator, statement.items, i, lines, &bindings);
        i = end;
    }

    if (bindings.items.len == 0) return;

    // Everything but the import statements, joined, with comments masked
    var body: std.ArrayList(u16) = .empty;
    try body.ensureTotalCapacity(allocator, text.len);
    for (lines, 0..) |line, k| {
        if (k > 0) body.appendAssumeCapacity('\n');
        if (!import_lines[k]) body.appendSliceAssumeCapacity(line);
    }
    const searchable = try lexer.maskComments(allocator, @as([]const u16, body.items));

    // `(?<![\w$])name(?![\w$])` matches exactly where a maximal `[\w$]` run
    // equals the name: one pass over the runs marks the bound names seen.
    var seen: std.HashMapUnmanaged(Str, bool, js.StrContext, 80) = .empty;
    var lengths: u64 = 0;
    for (bindings.items) |b| {
        try seen.put(allocator, b.name, false);
        lengths |= @as(u64, 1) << @intCast(@min(b.name.len, 63));
    }
    const Scan = struct {
        text: Str,
        lengths: u64,
        seen: *std.HashMapUnmanaged(Str, bool, js.StrContext, 80),

        fn run(sc: *@This(), start: usize, end: usize) anyerror!void {
            if (sc.lengths & (@as(u64, 1) << @intCast(@min(end - start, 63))) == 0) return;
            if (sc.seen.getPtr(sc.text[start..end])) |v| v.* = true;
        }
    };
    var scan: Scan = .{ .text = searchable, .lengths = lengths, .seen = &seen };
    try js.forEachIdentRun(searchable, &scan, Scan.run);

    for (bindings.items) |b| {
        if (seen.get(b.name).?) continue;
        const name = try js.asciiToUtf8(allocator, b.name);
        try out.append(allocator, .{
            .line = b.line,
            .column = @intCast(b.column + 1),
            .rule_id = "pickier/no-unused-imports",
            .message = if (b.type_only)
                try std.fmt.allocPrint(allocator, "'{s}' is imported as a type but never used", .{name})
            else
                try std.fmt.allocPrint(allocator, "'{s}' is imported but never used", .{name}),
            .severity = .@"error",
        });
    }
}

/// `/^\s*import(?![\w$])\s*(?![(.])/` - an import statement, not `import(…)`
/// or `import.meta`. Whitespace before the `(` or `.` still matches: the
/// `\s*` gives back a space and the lookahead then sees that instead.
fn startsImportStatement(line: Str) bool {
    const rest = js.trimStart(line);
    if (!js.startsWith(rest, "import")) return false;
    if (rest.len == 6) return true;
    const c = rest[6];
    return !js.isIdent(c) and c != '(' and c != '.';
}

/// `/\bfrom\s*['"][^'"]*['"]/`
fn hasFromClause(s: Str) bool {
    var from: usize = 0;
    while (js.indexOfLit(s, from, "from")) |p| {
        from = p + 1;
        if (p > 0 and js.isWord(s[p - 1])) continue;
        var q = p + 4;
        while (q < s.len and js.isWs(s[q])) q += 1;
        if (q >= s.len or (s[q] != '\'' and s[q] != '"')) continue;
        for (s[q + 1 ..]) |c| {
            if (c == '\'' or c == '"') return true;
        }
    }
    return false;
}

/// `/^\s*import\s*['"]/`
fn isSideEffectImport(s: Str) bool {
    const rest = js.trimStart(s);
    if (!js.startsWith(rest, "import")) return false;
    const after = js.trimStart(rest[6..]);
    return after.len > 0 and (after[0] == '\'' or after[0] == '"');
}

/// The length of `/^type\s+/` at the start of `s`, or 0.
fn typePrefixLen(s: Str) usize {
    if (!js.startsWith(s, "type")) return 0;
    var k: usize = 4;
    while (k < s.len and js.isWs(s[k])) k += 1;
    return if (k > 4) k else 0;
}

/// The local names an import statement binds.
fn bindingsOf(allocator: Allocator, statement: Str, start_line: usize, lines: []const Str, out: *std.ArrayList(Binding)) !void {
    // `/^\s*import\s+type\b/`, and the clause after `/^\s*import\s+/`
    var clause = statement;
    var is_type_import = false;
    {
        const rest = js.trimStart(statement);
        if (js.startsWith(rest, "import")) {
            const after = js.trimStart(rest[6..]);
            if (after.len < rest.len - 6) {
                clause = after;
                is_type_import = js.startsWith(after, "type") and (after.len == 4 or !js.isWord(after[4]));
            }
        }
    }
    clause = stripFromClause(clause);

    // A side-effect import (`import 'x'`) binds nothing
    if (clause.len > 0 and (clause[0] == '\'' or clause[0] == '"')) return;

    // `/\{([\s\S]*)\}/`: the first `{` to the last `}`
    const open = js.indexOfScalar(clause, '{');
    var braces: ?Str = null;
    if (open) |o| {
        if (js.lastIndexOfScalar(clause, '}')) |close| {
            if (close > o) braces = clause[o + 1 .. close];
        }
    }

    if (braces) |inner| {
        var pieces = std.mem.splitScalar(u16, inner, ',');
        while (pieces.next()) |piece| {
            const trimmed = js.trim(piece);
            if (trimmed.len == 0) continue;
            const type_len = typePrefixLen(trimmed);
            const without_type = trimmed[type_len..];
            // `b as c` binds `c`
            try record(allocator, lastAfterAs(without_type), is_type_import or type_len > 0, start_line, lines, out);
        }
    }

    const before_braces = if (braces != null) clause[0..open.?] else clause;
    var pieces = std.mem.splitScalar(u16, before_braces, ',');
    while (pieces.next()) |piece| {
        var trimmed = js.trim(piece);
        trimmed = trimmed[typePrefixLen(trimmed)..];
        if (trimmed.len == 0) continue;
        try record(allocator, namespaceName(trimmed) orelse trimmed, is_type_import, start_line, lines, out);
    }
}

/// `clause.replace(/\s+from\s+['"][^'"]+['"].*$/s, '')`
fn stripFromClause(clause: Str) Str {
    var p: usize = 0;
    while (p < clause.len) {
        if (!js.isWs(clause[p])) {
            p += 1;
            continue;
        }
        const run_start = p;
        while (p < clause.len and js.isWs(clause[p])) p += 1;
        if (!js.startsWithAt(clause, p, "from")) continue;
        var q = p + 4;
        const ws_start = q;
        while (q < clause.len and js.isWs(clause[q])) q += 1;
        if (q == ws_start or q >= clause.len) continue;
        if (clause[q] != '\'' and clause[q] != '"') continue;
        var r = q + 1;
        while (r < clause.len and clause[r] != '\'' and clause[r] != '"') r += 1;
        if (r < clause.len and r > q + 1) return clause[0..run_start];
    }
    return clause;
}

/// The last piece of `s.split(/\s+as\s+/)`.
fn lastAfterAs(s: Str) Str {
    var last_start: usize = 0;
    var p: usize = 0;
    while (p < s.len) {
        if (!js.isWs(s[p])) {
            p += 1;
            continue;
        }
        var q = p;
        while (q < s.len and js.isWs(s[q])) q += 1;
        if (js.startsWithAt(s, q, "as")) {
            var r = q + 2;
            while (r < s.len and js.isWs(s[r])) r += 1;
            if (r > q + 2) {
                last_start = r;
                p = r;
                continue;
            }
        }
        p += 1;
    }
    return s[last_start..];
}

/// `/^\*\s+as\s+(\w+)$/`
fn namespaceName(s: Str) ?Str {
    if (s.len == 0 or s[0] != '*') return null;
    var k: usize = 1;
    while (k < s.len and js.isWs(s[k])) k += 1;
    if (k == 1 or !js.startsWithAt(s, k, "as")) return null;
    k += 2;
    const ws = k;
    while (k < s.len and js.isWs(s[k])) k += 1;
    if (k == ws or k >= s.len) return null;
    for (s[k..]) |c| {
        if (!js.isWord(c)) return null;
    }
    return s[k..];
}

/// `/^[A-Z_$][\w$]*$/i`
fn isIdentifier(s: Str) bool {
    if (s.len == 0 or !js.isIdentStart(s[0])) return false;
    for (s[1..]) |c| {
        if (!js.isIdent(c)) return false;
    }
    return true;
}

/// `/\bfrom\b/`
fn hasFromWord(s: Str) bool {
    var from: usize = 0;
    while (js.indexOfLit(s, from, "from")) |p| {
        from = p + 1;
        if (p > 0 and js.isWord(s[p - 1])) continue;
        if (p + 4 < s.len and js.isWord(s[p + 4])) continue;
        return true;
    }
    return false;
}

fn record(allocator: Allocator, raw_name: Str, type_only: bool, start_line: usize, lines: []const Str, out: *std.ArrayList(Binding)) !void {
    const name = js.trim(raw_name);
    if (name.len == 0 or js.eql(name, "type")) return;
    // Only a real identifier is reported; anything else is a misread statement
    if (!isIdentifier(name)) return;
    // The statement buffer is reused for the next import
    const owned = try allocator.dupe(u16, name);

    // Point at the name itself, searching to the end of the statement
    var ln = start_line;
    while (ln < lines.len) : (ln += 1) {
        if (js.searchWholeIdentifier(lines[ln], name)) |column| {
            try out.append(allocator, .{ .name = owned, .line = @intCast(ln + 1), .column = column, .type_only = type_only });
            return;
        }
        if (hasFromWord(lines[ln])) break;
    }
    try out.append(allocator, .{ .name = owned, .line = @intCast(start_line + 1), .column = 0, .type_only = type_only });
}
