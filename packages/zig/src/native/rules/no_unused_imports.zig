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
    const tokens = try importTokens(allocator, text);
    const declarations = try importSpans(allocator, text, tokens);
    const bindings = declarations.bindings;
    if (bindings.items.len == 0) return;

    // Exclude declaration spans, preserving every other same-line use and
    // every UTF-16 offset used by the report.
    const body = try allocator.dupe(u16, text);
    for (declarations.spans.items) |span| {
        for (body[span.start..span.end]) |*unit| {
            if (unit.* != '\n' and unit.* != '\r' and unit.* != 0x2028 and unit.* != 0x2029) unit.* = ' ';
        }
    }
    const searchable = try lexer.maskComments(allocator, @as([]const u16, body));

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

const Token = struct {
    kind: enum { word, string, punct },
    start: usize,
    end: usize,
};

const Span = struct { start: usize, end: usize };
const Declarations = struct {
    bindings: std.ArrayList(Binding) = .empty,
    spans: std.ArrayList(Span) = .empty,
};

/// The shared lexer owns comments, quoted strings, templates and regexes.
/// Only declaration grammar needs tokens; opaque regions cannot introduce an
/// `import` keyword. All positions remain UTF-16, as in the TypeScript rule.
fn importTokens(allocator: Allocator, text: Str) ![]Token {
    const lexed = try lexer.lexSource(allocator, text);
    var tokens: std.ArrayList(Token) = .empty;
    var at: usize = 0;
    var region_index: usize = 0;
    var template_index: usize = 0;
    while (at < text.len) {
        while (template_index < lexed.templates.len and lexed.templates[template_index][1] < at) template_index += 1;
        if (template_index < lexed.templates.len and lexed.templates[template_index][0] == at) {
            at = @min(text.len, lexed.templates[template_index][1] + 1);
            template_index += 1;
            continue;
        }
        while (region_index < lexed.regions.len and lexed.regions[region_index].end <= at) region_index += 1;
        if (region_index < lexed.regions.len) {
            const region = lexed.regions[region_index];
            const opening = region.start -| (if (region.kind == .comment) @as(usize, 2) else 1);
            if (opening == at and region.kind != .template) {
                const start = at;
                at = @min(text.len, region.end + @as(usize, if (region.kind == .comment and text[start + 1] == '*') 2 else if (region.kind == .comment) 0 else 1));
                if (region.kind == .string and region.end < text.len and text[region.end] == text[start]) {
                    try tokens.append(allocator, .{ .kind = .string, .start = start, .end = at });
                }
                if (region.kind == .regex) while (at < text.len and js.isWord(text[at])) : (at += 1) {};
                region_index += 1;
                continue;
            }
        }
        if (text[at] <= 0x20 or js.isWs(text[at])) {
            at += 1;
            continue;
        }
        const start = at;
        if (importWordPart(text[at])) {
            at += 1;
            while (at < text.len and importWordPart(text[at])) at += 1;
            try tokens.append(allocator, .{ .kind = .word, .start = start, .end = at });
        } else {
            at += 1;
            try tokens.append(allocator, .{ .kind = .punct, .start = start, .end = at });
        }
    }
    return tokens.items;
}

fn importWordPart(unit: u16) bool {
    if (unit <= 0x20 or js.isWs(unit)) return false;
    return switch (unit) {
        '(', ')', '{', '}', '[', ']', ';', ':', ',', '.', '<', '>', '+', '-', '*', '%', '&', '|', '^', '!', '?', '=', '~', '\'', '"', '`', '/' => false,
        else => true,
    };
}

fn tokenIs(tokens: []const Token, text: Str, index: usize, comptime value: []const u8) bool {
    return index < tokens.len and js.eql(text[tokens[index].start..tokens[index].end], value);
}

fn tokenKind(tokens: []const Token, index: usize, kind: @FieldType(Token, "kind")) bool {
    return index < tokens.len and tokens[index].kind == kind;
}

fn recordToken(allocator: Allocator, text: Str, tokens: []const Token, index: usize, type_only: bool, bindings: *std.ArrayList(Binding)) !void {
    if (!tokenKind(tokens, index, .word)) return;
    const token = tokens[index];
    const name = text[token.start..token.end];
    if (name.len == 0 or !js.isIdentStart(name[0])) return;
    for (name[1..]) |unit| if (!js.isIdent(unit)) return;
    var line: u32 = 1;
    var column: usize = 0;
    for (text[0..token.start]) |unit| {
        if (unit == '\n') {
            line += 1;
            column = 0;
        } else column += 1;
    }
    try bindings.append(allocator, .{ .name = name, .line = line, .column = column, .type_only = type_only });
}

fn importSpans(allocator: Allocator, text: Str, tokens: []const Token) !Declarations {
    var declarations: Declarations = .{};
    var i: usize = 0;
    while (i < tokens.len) : (i += 1) {
        if (!tokenKind(tokens, i, .word) or !tokenIs(tokens, text, i, "import") or
            (i > 0 and tokenIs(tokens, text, i - 1, "."))) continue;
        const start = i;
        var cursor = i + 1;
        var type_only = false;
        var bindings: std.ArrayList(Binding) = .empty;
        if (tokenIs(tokens, text, cursor, "type") and
            (tokenIs(tokens, text, cursor + 1, "{") or tokenIs(tokens, text, cursor + 1, "*") or
                (tokenKind(tokens, cursor + 1, .word) and !tokenIs(tokens, text, cursor + 1, "from"))))
        {
            type_only = true;
            cursor += 1;
        }
        if (!tokenKind(tokens, cursor, .string)) {
            if (tokenKind(tokens, cursor, .word)) {
                try recordToken(allocator, text, tokens, cursor, type_only, &bindings);
                cursor += 1;
                if (tokenIs(tokens, text, cursor, ",")) cursor += 1;
            }
            if (tokenIs(tokens, text, cursor, "*")) {
                cursor += 1;
                if (!tokenIs(tokens, text, cursor, "as")) continue;
                cursor += 1;
                if (!tokenKind(tokens, cursor, .word)) continue;
                try recordToken(allocator, text, tokens, cursor, type_only, &bindings);
                cursor += 1;
            } else if (tokenIs(tokens, text, cursor, "{")) {
                cursor += 1;
                var valid = true;
                while (cursor < tokens.len and !tokenIs(tokens, text, cursor, "}")) {
                    var specifier_type = type_only;
                    if (tokenIs(tokens, text, cursor, "type") and
                        !tokenIs(tokens, text, cursor + 1, ",") and !tokenIs(tokens, text, cursor + 1, "}") and !tokenIs(tokens, text, cursor + 1, "as"))
                    {
                        specifier_type = true;
                        cursor += 1;
                    }
                    var local = cursor;
                    cursor += 1;
                    if (!tokenKind(tokens, local, .word) and !tokenKind(tokens, local, .string)) {
                        valid = false;
                        break;
                    }
                    if (tokenIs(tokens, text, cursor, "as")) {
                        cursor += 1;
                        local = cursor;
                        cursor += 1;
                    }
                    try recordToken(allocator, text, tokens, local, specifier_type, &bindings);
                    if (!tokenIs(tokens, text, cursor, ",")) break;
                    cursor += 1;
                }
                if (!valid or !tokenIs(tokens, text, cursor, "}")) continue;
                cursor += 1;
            }
            if (!tokenIs(tokens, text, cursor, "from")) continue;
            cursor += 1;
        }
        if (!tokenKind(tokens, cursor, .string)) continue;
        var end = tokens[cursor].end;
        cursor += 1;
        if ((tokenIs(tokens, text, cursor, "with") or tokenIs(tokens, text, cursor, "assert")) and tokenIs(tokens, text, cursor + 1, "{")) {
            cursor += 2;
            var depth: usize = 1;
            while (cursor < tokens.len and depth > 0) : (cursor += 1) {
                if (tokenIs(tokens, text, cursor, "{")) depth += 1;
                if (tokenIs(tokens, text, cursor, "}")) depth -= 1;
                end = tokens[cursor].end;
            }
            if (depth != 0) continue;
        }
        if (tokenIs(tokens, text, cursor, ";")) {
            end = tokens[cursor].end;
            cursor += 1;
        }
        try declarations.bindings.appendSlice(allocator, bindings.items);
        try declarations.spans.append(allocator, .{ .start = tokens[start].start, .end = end });
        i = cursor - 1;
    }
    return declarations;
}

test "unused import statement boundaries retain same-line uses" {
    for ([_][]const u8{
        "import{readFileSync as read}from'node:fs';import path from'node:path';console.log(read(path.resolve('x')))\n",
        "import { readFileSync as read } from 'node:fs'; import path from 'node:path'; console.log(read(path.resolve('x')))\n",
        "import * as paths from 'node:path';console.log(paths.resolve('x'))\n",
        "import 'setup';import { used } from 'pkg';console.log(used)\n",
        "import {\n  used,\n} from 'pkg';console.log(used)\n",
        "import type { Value } from 'pkg';export const value:Value={}\n",
        "import/*from 'fake'*/{used/*, unused*/}from'pkg';console.log(used)\n",
        "import type from 'pkg';console.log(type)\n",
        "import from from 'pkg';console.log(from)\n",
        "import { type as value } from 'pkg';console.log(value)\n",
        "import { 'original' as local } from 'pkg';console.log(local)\n",
        "import value from 'pkg' with { type: 'json' };console.log(value)\n",
        "import { used } from 'pkg'\nconst text = `${'}' + `import { fake } from 'other'`}`\nconsole.log(text,used)\n",
    }) |source| {
        var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
        defer arena.deinit();
        const settings: types.Settings = .{};
        const context: types.RuleContext = .{ .file_path = "subject.ts", .content = source, .options = null, .settings = &settings, .allocator = arena.allocator() };
        var issues: std.ArrayList(types.Issue) = .empty;
        try check(&context, &issues);
        try std.testing.expectEqual(@as(usize, 0), issues.items.len);
    }
}

test "unused import statement boundaries report each binding position" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const source = "import unused from 'a';import{other as unusedToo}from'b';console.log('done')\n";
    const settings: types.Settings = .{};
    const context: types.RuleContext = .{ .file_path = "subject.ts", .content = source, .options = null, .settings = &settings, .allocator = arena.allocator() };
    var issues: std.ArrayList(types.Issue) = .empty;
    try check(&context, &issues);
    try std.testing.expectEqual(@as(usize, 2), issues.items.len);
    try std.testing.expectEqualStrings("'unused' is imported but never used", issues.items[0].message);
    try std.testing.expectEqual(@as(u32, 1), issues.items[0].line);
    try std.testing.expectEqual(@as(u32, @intCast(std.mem.indexOf(u8, source, "unused").? + 1)), issues.items[0].column);
    try std.testing.expectEqualStrings("'unusedToo' is imported but never used", issues.items[1].message);
    try std.testing.expectEqual(@as(u32, 1), issues.items[1].line);
    try std.testing.expectEqual(@as(u32, @intCast(std.mem.indexOf(u8, source, "unusedToo").? + 1)), issues.items[1].column);
}

test "unused import statement boundaries exclude other clauses and prose" {
    for ([_]struct { source: []const u8, expected: usize }{
        .{ .source = "import { shared } from 'a';import { shared as alias } from 'b'\n", .expected = 2 },
        .{ .source = "import from from 'pkg';\n", .expected = 1 },
        .{ .source = "import type,{unused}from'pkg';console.log(type)\n", .expected = 1 },
        .{ .source = "/* 🟢 */import { λ, unused } from 'pkg';\n", .expected = 1 },
        .{ .source = "import type from 'pkg' with { type: 'json' };\n", .expected = 1 },
        .{ .source = "import missing from 'unfinished\n", .expected = 0 },
        .{ .source = "const text=\"import { missing } from 'pkg';\";\n// import { commented } from 'pkg'\nimport('pkg').then(mod=>console.log(mod,text))\n", .expected = 0 },
    }) |case| {
        var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
        defer arena.deinit();
        const settings: types.Settings = .{};
        const context: types.RuleContext = .{ .file_path = "subject.ts", .content = case.source, .options = null, .settings = &settings, .allocator = arena.allocator() };
        var issues: std.ArrayList(types.Issue) = .empty;
        try check(&context, &issues);
        try std.testing.expectEqual(case.expected, issues.items.len);
        if (case.expected == 1) {
            const subject = try js.toUtf16(arena.allocator(), case.source);
            if (js.indexOfLit(subject, 0, "unused")) |position| {
                try std.testing.expectEqualStrings("'unused' is imported but never used", issues.items[0].message);
                try std.testing.expectEqual(@as(u32, @intCast(position + 1)), issues.items[0].column);
            }
        }
        if (case.expected == 2) {
            try std.testing.expectEqualStrings("'shared' is imported but never used", issues.items[0].message);
            try std.testing.expectEqualStrings("'alias' is imported but never used", issues.items[1].message);
        }
    }
}
