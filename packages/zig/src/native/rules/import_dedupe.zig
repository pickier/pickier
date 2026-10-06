//! `pickier/import-dedupe` - port of packages/pickier/src/rules/imports/import-dedupe.ts
//!
//! A single-line `import { ... } from '...'` naming the same specifier twice;
//! one issue per line, at the first occurrence of the repeated name.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const import_source = @import("st_import_source.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    var seen = std.StringHashMap(void).init(a);

    for (lines, 0..) |line, i| {
        // The pattern needs the word; most lines do not have it
        if (std.mem.indexOf(u8, line, "import") == null) continue;
        const inner = namedImports(line) orelse continue;

        seen.clearRetainingCapacity();
        var parts = std.mem.splitScalar(u8, inner, ',');
        while (parts.next()) |part| {
            const spec = text.trim(part);
            if (spec.len == 0) continue;
            const name = text.trim(beforeAs(spec));
            const gop = try seen.getOrPut(name);
            if (gop.found_existing) {
                const at = std.mem.indexOf(u8, line, name).?;
                try out.append(a, .{
                    .line = @intCast(i + 1),
                    .column = @intCast(text.utf16Index(line, at) + 1),
                    .rule_id = "pickier/import-dedupe",
                    .message = "Expect no duplication in imports",
                    .severity = .warning,
                });
                break;
            }
        }
    }
}

fn skipSpace(s: []const u8, start: usize) usize {
    var i = start;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) break;
        i += n;
    }
    return i;
}

/// `/^\s*import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/`: the capture.
fn namedImports(line: []const u8) ?[]const u8 {
    var i = skipSpace(line, 0);
    if (!std.mem.startsWith(u8, line[i..], "import")) return null;
    i = skipSpace(line, i + "import".len);
    if (i >= line.len or line[i] != '{') return null;
    const close = std.mem.indexOfScalarPos(u8, line, i + 1, '}') orelse return null;
    const j = skipSpace(line, close + 1);
    if (!std.mem.startsWith(u8, line[j..], "from")) return null;
    _ = import_source.quotedAfter(line, j + "from".len) orelse return null;
    return line[i + 1 .. close];
}

/// `s.split(/\s+as\s+/i)[0]`: up to the first whitespace run that is
/// followed by `as` and more whitespace.
fn beforeAs(s: []const u8) []const u8 {
    var i: usize = 0;
    while (i < s.len) {
        const n = text.whitespaceLenAt(s, i);
        if (n == 0) {
            i += 1;
            continue;
        }
        const run = i;
        const end = skipSpace(s, i);
        if (end + 2 < s.len and (s[end] == 'a' or s[end] == 'A') and (s[end + 1] == 's' or s[end + 1] == 'S') and
            text.whitespaceLenAt(s, end + 2) > 0)
            return s[0..run];
        i = end;
    }
    return s;
}
