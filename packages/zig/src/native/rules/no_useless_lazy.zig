//! `regexp/no-useless-lazy` - port of packages/pickier/src/rules/regexp/no-useless-lazy.ts
//!
//! Line by line, skipping lines that start with `//`, `/*` or `*`: every
//! `/(?![/*])([^/\n\r\\]|\\.)+\/[gimsuvy]*/` on the line whose pattern ends in
//! a lazy quantifier, or in a lazy quantifier and `$`.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const re = @import("re_text.zig");

const rule_id = "regexp/no-useless-lazy";

/// Where the literal regex ends when tried at `start` (past its flags), or
/// where it fails.
const Literal = union(enum) { end: usize, fail: usize };

fn matchLiteral(line: []const u8, start: usize) Literal {
    // (?![/*])
    if (start + 1 < line.len and (line[start + 1] == '/' or line[start + 1] == '*')) return .{ .fail = start };
    var i = start + 1;
    while (i < line.len) {
        switch (line[i]) {
            '/' => {
                if (i == start + 1) return .{ .fail = start };
                var e = i + 1;
                while (e < line.len and isFlag(line[e])) e += 1;
                return .{ .end = e };
            },
            '\n', '\r' => return .{ .fail = i },
            '\\' => {
                const n = re.dotLenAt(line, i + 1);
                if (n == 0) return .{ .fail = i };
                i += 1 + n;
            },
            else => i += 1,
        }
    }
    return .{ .fail = line.len };
}

fn isFlag(c: u8) bool {
    return switch (c) {
        'g', 'i', 'm', 's', 'u', 'v', 'y' => true,
        else => false,
    };
}

fn isQuantifier(c: u8) bool {
    return c == '+' or c == '*' or c == '?';
}

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, n| {
        const trimmed = text.trim(line);
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*"))
            continue;

        var columns: re.Lines = .{ .content = line };
        var pos: usize = 0;
        while (std.mem.indexOfScalarPos(u8, line, pos, '/')) |start| {
            const end = switch (matchLiteral(line, start)) {
                .end => |e| e,
                .fail => |f| {
                    // A `/` before the failure point is the second half of an
                    // escape on the same path, so it fails there too
                    pos = f + 1;
                    continue;
                },
            };
            pos = end;

            const close = std.mem.lastIndexOfScalar(u8, line[0..end], '/').?;
            const pattern = line[start + 1 .. close];
            const p = pattern.len;
            // /[+*?]\?\$$/ and /[+*?]\?$/
            if (p >= 3 and pattern[p - 1] == '$' and pattern[p - 2] == '?' and isQuantifier(pattern[p - 3])) {
                const index = columns.at(start).column - 1;
                const units = text.utf16Len(pattern);
                try out.append(a, .{
                    .line = @intCast(n + 1),
                    .column = @intCast(index + units - 3 + 2),
                    .rule_id = rule_id,
                    .message = "Lazy quantifier is useless before end-of-string anchor",
                    .severity = .@"error",
                });
            }
            if (p >= 2 and pattern[p - 1] == '?' and isQuantifier(pattern[p - 2])) {
                const index = columns.at(start).column - 1;
                const units = text.utf16Len(pattern);
                try out.append(a, .{
                    .line = @intCast(n + 1),
                    .column = @intCast(index + units - 1),
                    .rule_id = rule_id,
                    .message = "Lazy quantifier is useless at the end of the pattern",
                    .severity = .@"error",
                });
            }
        }
    }
}
