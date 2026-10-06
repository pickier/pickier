//! The import test shared by `node/prefer-global/buffer` and
//! `node/prefer-global/process`:
//!
//!   /(?:import\b[^;\n]*\bfrom\s*|require\s*\(\s*)['"](?:node:)?<module>['"]/
//!
//! `[^;\n]*` backs off to any `from` before the first `;` (lines have no
//! `\n`); everything else is one fixed path.

const std = @import("std");
const text = @import("../text.zig");

/// The index of the leftmost match in `line`, or null.
pub fn importIndex(line: []const u8, module: []const u8) ?usize {
    var next_import = std.mem.indexOf(u8, line, "import");
    var next_require = std.mem.indexOf(u8, line, "require");
    while (true) {
        if (next_import) |p| {
            if (next_require == null or p < next_require.?) {
                if (importFrom(line, p, module)) return p;
                next_import = std.mem.indexOfPos(u8, line, p + 1, "import");
                continue;
            }
        }
        const p = next_require orelse return null;
        if (requireCall(line, p, module)) return p;
        next_require = std.mem.indexOfPos(u8, line, p + 1, "require");
    }
}

/// `import\b[^;\n]*\bfrom\s*['"](?:node:)?<module>['"]` at `p`
fn importFrom(line: []const u8, p: usize, module: []const u8) bool {
    const k = p + 6;
    if (k < line.len and text.isWordByte(line[k])) return false;
    const semi = std.mem.indexOfScalarPos(u8, line, k, ';') orelse line.len;
    var from = k;
    while (std.mem.indexOfPos(u8, line[0..semi], from, "from")) |q| {
        from = q + 1;
        if (text.isWordByte(line[q - 1])) continue;
        if (quotedModule(line, skipSpace(line, q + 4), module)) return true;
    }
    return false;
}

/// `require\s*\(\s*['"](?:node:)?<module>['"]` at `p`
fn requireCall(line: []const u8, p: usize, module: []const u8) bool {
    const j = skipSpace(line, p + 7);
    if (j >= line.len or line[j] != '(') return false;
    return quotedModule(line, skipSpace(line, j + 1), module);
}

/// `['"](?:node:)?<module>['"]` at `j`
fn quotedModule(line: []const u8, j: usize, module: []const u8) bool {
    if (j >= line.len or !isQuote(line[j])) return false;
    const rest = line[j + 1 ..];
    if (std.mem.startsWith(u8, rest, "node:") and moduleThenQuote(rest[5..], module)) return true;
    return moduleThenQuote(rest, module);
}

fn moduleThenQuote(s: []const u8, module: []const u8) bool {
    return std.mem.startsWith(u8, s, module) and s.len > module.len and isQuote(s[module.len]);
}

fn isQuote(c: u8) bool {
    return c == '\'' or c == '"';
}

fn skipSpace(s: []const u8, from: usize) usize {
    var j = from;
    while (j < s.len) {
        const len = text.whitespaceLenAt(s, j);
        if (len == 0) break;
        j += len;
    }
    return j;
}

test "import index" {
    try std.testing.expectEqual(@as(?usize, 0), importIndex("import { Buffer } from 'node:buffer'", "buffer"));
    try std.testing.expectEqual(@as(?usize, 19), importIndex("const { Buffer } = require ( \"buffer\")", "buffer"));
    try std.testing.expectEqual(@as(?usize, null), importIndex("import x from 'y'; from 'buffer'", "buffer"));
    try std.testing.expectEqual(@as(?usize, null), importIndex("importx from 'buffer'", "buffer"));
    try std.testing.expectEqual(@as(?usize, null), importIndex("import xfrom 'buffer'", "buffer"));
    try std.testing.expectEqual(@as(?usize, 0), importIndex("import a from 'b' from 'process'", "process"));
    try std.testing.expectEqual(@as(?usize, null), importIndex("import a from 'buffers'", "buffer"));
}
