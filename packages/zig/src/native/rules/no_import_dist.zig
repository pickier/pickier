//! `pickier/no-import-dist` - port of packages/pickier/src/rules/imports/no-import-dist.ts
//!
//! A single-line `import ... from '<src>'` whose source is `dist`, or a
//! relative or absolute path through a `dist` directory.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const import_source = @import("st_import_source.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        // The pattern needs the word
        if (std.mem.indexOf(u8, line, "import") == null) continue;
        const src = import_source.importSource(line) orelse continue;
        const is_dist = std.mem.eql(u8, src, "dist") or
            ((std.mem.startsWith(u8, src, ".") or std.mem.startsWith(u8, src, "/")) and hasDistSegment(src));
        if (!is_dist) continue;
        const at = std.mem.indexOf(u8, line, src).?;
        try out.append(a, .{
            .line = @intCast(i + 1),
            .column = @intCast(text.utf16Index(line, at) + 1),
            .rule_id = "pickier/no-import-dist",
            .message = try std.fmt.allocPrint(a, "Do not import modules in `dist` folder, got {s}", .{src}),
            .severity = .@"error",
        });
    }
}

/// `/(?:^|\/)dist(?:\/.|$)/`
fn hasDistSegment(src: []const u8) bool {
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, src, from, "dist")) |k| {
        from = k + 1;
        if (k > 0 and src[k - 1] != '/') continue;
        const after = k + 4;
        if (after == src.len) return true;
        // `.` is any UTF-16 unit but a line terminator
        if (src[after] == '/' and after + 1 < src.len and !isLineTerminatorAt(src, after + 1)) return true;
    }
    return false;
}

fn isLineTerminatorAt(s: []const u8, i: usize) bool {
    if (s[i] == '\n' or s[i] == '\r') return true;
    return s[i] == 0xE2 and i + 2 < s.len and s[i + 1] == 0x80 and (s[i + 2] == 0xA8 or s[i + 2] == 0xA9);
}
