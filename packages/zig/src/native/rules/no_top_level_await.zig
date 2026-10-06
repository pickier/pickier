//! `ts/no-top-level-await` - port of packages/pickier/src/rules/ts/no-top-level-await.ts
//!
//! `await` at brace depth 0 of the lexer's code-only view, as a whole word
//! and not after `for`. Positions are UTF-16, as in TypeScript.

const std = @import("std");
const types = @import("../types.zig");
const lexer = @import("../lexer.zig");
const js = @import("../nuv_js.zig");

/// The next `\n`, `{`, `}` or `aw` at or after `from`.
fn nextInteresting(code: []const u16, from: usize) ?usize {
    const lanes = 16;
    const V = @Vector(lanes, u16);
    var i = from;
    while (i + lanes + 1 <= code.len) : (i += lanes) {
        const v: V = code[i..][0..lanes].*;
        const w: V = code[i + 1 ..][0..lanes].*;
        const nl: u16 = @bitCast(v == @as(V, @splat('\n')));
        const open: u16 = @bitCast(v == @as(V, @splat('{')));
        const close: u16 = @bitCast(v == @as(V, @splat('}')));
        const a: u16 = @bitCast(v == @as(V, @splat('a')));
        const aw: u16 = a & @as(u16, @bitCast(w == @as(V, @splat('w'))));
        const hit = nl | open | close | aw;
        if (hit != 0) return i + @ctz(hit);
    }
    while (i < code.len) : (i += 1) {
        switch (code[i]) {
            '\n', '{', '}' => return i,
            'a' => if (i + 1 < code.len and code[i + 1] == 'w') return i,
            else => {},
        }
    }
    return null;
}

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    // `ctx.filePath.split('.').pop()`: the text after the last dot
    const path = ctx.file_path;
    const ext = if (std.mem.lastIndexOfScalar(u8, path, '.')) |dot| path[dot + 1 ..] else path;
    const exts = [_][]const u8{ "ts", "tsx", "mts", "cts", "js", "mjs", "cjs" };
    for (exts) |e| {
        if (std.mem.eql(u8, ext, e)) break;
    } else return;

    // Only `await` and braces matter, both ASCII: a file without the word has
    // nothing to report.
    if (!js.containsBytes(ctx.content, "await")) return;

    const text = try js.toUtf16(ctx.allocator, ctx.content);
    const code = try lexer.maskNonCode(ctx.allocator, @as([]const u16, text));

    // Only newlines, braces and an `a` starting `await` matter; the column is
    // the distance from the last newline. (The TypeScript loop also skips the
    // four units after every `await`, which are never one of these.)
    var depth: usize = 0;
    var line: u32 = 1;
    var line_start: usize = 0;
    var i: usize = 0;
    while (nextInteresting(code, i)) |at| {
        i = at + 1;
        switch (code[at]) {
            '\n' => {
                line += 1;
                line_start = at + 1;
            },
            '{' => depth += 1,
            '}' => depth -|= 1,
            else => {
                if (!js.startsWith(code[at..], "await")) continue;
                i = at + 5;
                if (depth != 0) continue;
                const before = code[at -| 6..at];
                const trimmed = js.trimEnd(before);
                // `/for\s+$/` on the six units before
                const for_await = trimmed.len < before.len and js.endsWith(trimmed, "for");
                const boundary_before = at == 0 or !js.isIdent(code[at - 1]);
                const boundary_after = at + 5 >= code.len or !js.isIdent(code[at + 5]);
                if (!for_await and boundary_before and boundary_after) {
                    try out.append(ctx.allocator, .{
                        .line = line,
                        .column = @intCast(at - line_start + 1),
                        .rule_id = "ts/no-top-level-await",
                        .message = "Do not use top-level await",
                        .severity = .@"error",
                    });
                }
            },
        }
    }
}
