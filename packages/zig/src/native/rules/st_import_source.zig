//! The import-source pattern shared by packages/pickier/src/rules/imports/
//! no-import-dist.ts and no-import-node-modules-by-path.ts:
//!
//!   new RegExp('^\\s*import\\s[^;]*?from\\s*[\'"]([^\'"]+)[\'"]', 'm')
//!
//! matched against one line, with the `m` flag's `^` also matching after a
//! lone `\r`, U+2028 or U+2029 inside the line.

const std = @import("std");
const text = @import("../text.zig");

/// The first capture of the pattern in `line`, or null when it does not match.
pub fn importSource(line: []const u8) ?[]const u8 {
    if (matchAt(line, 0)) |src| return src;
    var i: usize = 0;
    while (i < line.len) {
        const n = lineTerminatorLen(line, i);
        if (n > 0) {
            if (matchAt(line, i + n)) |src| return src;
            i += n;
        } else i += 1;
    }
    return null;
}

/// `\r`, U+2028 or U+2029 at `i`: its byte length, or 0.
fn lineTerminatorLen(s: []const u8, i: usize) usize {
    if (s[i] == '\r' or s[i] == '\n') return 1;
    if (s[i] == 0xE2 and i + 2 < s.len and s[i + 1] == 0x80 and (s[i + 2] == 0xA8 or s[i + 2] == 0xA9)) return 3;
    return 0;
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

/// The pattern anchored at `start`.
fn matchAt(s: []const u8, start: usize) ?[]const u8 {
    var i = skipSpace(s, start);
    if (!std.mem.startsWith(u8, s[i..], "import")) return null;
    i += "import".len;
    if (i >= s.len) return null;
    const ws = text.whitespaceLenAt(s, i);
    if (ws == 0) return null;
    i += ws;
    // `[^;]*?from` - the first `from` before any `;` whose tail matches
    var q = i;
    while (q < s.len and s[q] != ';') : (q += 1) {
        if (s[q] != 'f' or !std.mem.startsWith(u8, s[q..], "from")) continue;
        if (quotedAfter(s, q + "from".len)) |src| return src;
    }
    return null;
}

/// `\s*['"]([^'"]+)['"]` at `start`: the capture.
pub fn quotedAfter(s: []const u8, start: usize) ?[]const u8 {
    const open = skipSpace(s, start);
    if (open >= s.len or (s[open] != '\'' and s[open] != '"')) return null;
    var j = open + 1;
    while (j < s.len and s[j] != '\'' and s[j] != '"') j += 1;
    if (j >= s.len or j == open + 1) return null;
    return s[open + 1 .. j];
}
