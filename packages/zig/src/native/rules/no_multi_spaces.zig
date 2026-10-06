//! `style/no-multi-spaces` - port of packages/pickier/src/rules/style/no-multi-spaces.ts
//!
//! Per line (`/\r?\n/`), after the leading `/^\s*/`: each run of two or more
//! ASCII spaces (`/ {2,}/g`, so a trailing run too) is reported at its start,
//! unless the text before it on the line, past the indent, holds an odd
//! number of `'`, `"` or `` ` `` (each counted on its own, escaped ones
//! included), or holds `//`. Lines whose trimmed text starts with `*` or `/*`
//! are skipped whole; blank lines report nothing.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        const code = text.trimStart(line);
        // Blank line
        if (code.len == 0) continue;
        if (code[0] == '*' or std.mem.startsWith(u8, code, "/*")) continue;
        // A run needs two spaces past the indent; scan from there
        const first = std.mem.indexOf(u8, code, "  ") orelse continue;
        const indent = line.len - code.len;

        const before = code[0..first];
        var singles = std.mem.count(u8, before, "'");
        var doubles = std.mem.count(u8, before, "\"");
        var backticks = std.mem.count(u8, before, "`");
        var comment = std.mem.indexOf(u8, before, "//") != null;
        // UTF-16 units of `line[0 .. indent + counted]`; every run starts at
        // an ASCII byte, so counting slice by slice agrees with the whole line
        var units: usize = 0;
        var counted: usize = 0;
        var units_ready = false;
        var j: usize = first;
        while (j < code.len) {
            const c = code[j];
            if (c == ' ' and j + 1 < code.len and code[j + 1] == ' ') {
                var end = j + 2;
                while (end < code.len and code[end] == ' ') end += 1;
                if (singles % 2 == 0 and doubles % 2 == 0 and backticks % 2 == 0 and !comment) {
                    if (!units_ready) {
                        units = text.utf16Len(line[0..indent]);
                        units_ready = true;
                    }
                    units += text.utf16Len(code[counted..j]);
                    counted = j;
                    try out.append(a, .{
                        .line = @intCast(i + 1),
                        .column = @intCast(units + 1),
                        .rule_id = "style/no-multi-spaces",
                        .message = "Multiple spaces found",
                        .severity = .warning,
                        .help = "Remove extra spaces. Use single spaces between tokens.",
                    });
                }
                j = end;
                continue;
            }
            switch (c) {
                '\'' => singles += 1,
                '"' => doubles += 1,
                '`' => backticks += 1,
                '/' => {
                    if (j > 0 and code[j - 1] == '/') comment = true;
                },
                else => {},
            }
            j += 1;
        }
    }
}

test "no-multi-spaces runs" {
    const settings: types.Settings = .{};
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    text.resetLineCache();
    defer text.resetLineCache();
    const ctx: types.RuleContext = .{
        .file_path = "a.ts",
        .content = "  const x  = 'a  b'  // c  d\n * x  y\nfoo(a,   b)  \n\u{3000}é  x",
        .options = null,
        .settings = &settings,
        .allocator = arena.allocator(),
    };
    var out: std.ArrayList(types.Issue) = .empty;
    try check(&ctx, &out);
    try std.testing.expectEqual(@as(usize, 5), out.items.len);
    try std.testing.expectEqual(@as(u32, 10), out.items[0].column);
    try std.testing.expectEqual(@as(u32, 20), out.items[1].column);
    try std.testing.expectEqual(@as(u32, 7), out.items[2].column);
    try std.testing.expectEqual(@as(u32, 12), out.items[3].column);
    try std.testing.expectEqual(@as(u32, 3), out.items[4].column);
}
