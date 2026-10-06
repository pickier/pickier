//! JavaScript string semantics for the ports.
//!
//! The TypeScript rules work on UTF-16 strings; this engine works on UTF-8
//! bytes. A port has to agree on three things in particular:
//!
//! - Lines are `text.split(/\r?\n/)`: split at `\n`, and a `\r` directly
//!   before it is dropped. A lone `\r` stays in the line.
//! - Columns and `.length` count UTF-16 code units, not bytes: a character
//!   outside the BMP is 2, any other non-ASCII character 1.
//! - `\s` is JavaScript whitespace (ASCII whitespace, U+00A0, U+FEFF and the
//!   Unicode space separators); `\w` and `\d` are ASCII only.

const std = @import("std");

// The last file split on this thread. Several rules split the same file;
// the pipeline clears this as each file starts (`resetLineCache`).
threadlocal var cached_text: ?[]const u8 = null;
threadlocal var cached_lines: []const []const u8 = &.{};

pub fn resetLineCache() void {
    cached_text = null;
}

/// `text.split(/\r?\n/)`, shared by every rule linting the same file.
pub fn splitLines(allocator: std.mem.Allocator, text: []const u8) ![]const []const u8 {
    if (cached_text) |t| {
        if (t.ptr == text.ptr and t.len == text.len) return cached_lines;
    }
    const lines = try splitLinesUncached(allocator, text);
    cached_text = text;
    cached_lines = lines;
    return lines;
}

fn splitLinesUncached(allocator: std.mem.Allocator, text: []const u8) ![][]const u8 {
    var lines: std.ArrayList([]const u8) = .empty;
    var start: usize = 0;
    var i: usize = 0;
    while (i < text.len) : (i += 1) {
        if (text[i] == '\n') {
            var end = i;
            if (end > start and text[end - 1] == '\r') end -= 1;
            try lines.append(allocator, text[start..end]);
            start = i + 1;
        }
    }
    try lines.append(allocator, text[start..]);
    return lines.toOwnedSlice(allocator);
}

/// `text.split('\n')`
pub fn splitNewlines(allocator: std.mem.Allocator, text: []const u8) ![][]const u8 {
    var lines: std.ArrayList([]const u8) = .empty;
    var it = std.mem.splitScalar(u8, text, '\n');
    while (it.next()) |l| try lines.append(allocator, l);
    return lines.toOwnedSlice(allocator);
}

/// UTF-16 code units in `bytes` (JavaScript `.length`). Invalid UTF-8
/// decodes as the WHATWG decoder (and so Bun) does: one U+FFFD for each
/// maximal ill-formed subpart.
pub fn utf16Len(bytes: []const u8) usize {
    var n: usize = 0;
    var i: usize = 0;
    while (i < bytes.len) {
        if (bytes[i] < 0x80) {
            n += 1;
            i += 1;
            continue;
        }
        const seq = decodeStep(bytes, i);
        n += seq.units;
        i += seq.len;
    }
    return n;
}

const Step = struct { len: usize, units: usize };

/// One step of the WHATWG UTF-8 decoder at a non-ASCII byte: a whole
/// character (2 units outside the BMP), or one U+FFFD for the bytes up to
/// where the sequence went wrong.
fn decodeStep(bytes: []const u8, i: usize) Step {
    const b = bytes[i];
    var need: usize = 0;
    var lo: u8 = 0x80;
    var hi: u8 = 0xBF;
    switch (b) {
        0xC2...0xDF => need = 1,
        0xE0 => {
            need = 2;
            lo = 0xA0;
        },
        0xE1...0xEC, 0xEE, 0xEF => need = 2,
        0xED => {
            need = 2;
            hi = 0x9F;
        },
        0xF0 => {
            need = 3;
            lo = 0x90;
        },
        0xF1...0xF3 => need = 3,
        0xF4 => {
            need = 3;
            hi = 0x8F;
        },
        else => return .{ .len = 1, .units = 1 },
    }
    var k: usize = 1;
    while (k <= need) : (k += 1) {
        if (i + k >= bytes.len) return .{ .len = k, .units = 1 };
        const c = bytes[i + k];
        if (c < lo or c > hi) return .{ .len = k, .units = 1 };
        lo = 0x80;
        hi = 0xBF;
    }
    return .{ .len = need + 1, .units = if (need == 3) 2 else 1 };
}

/// The UTF-16 index of byte offset `byte_index` in `bytes`: the 0-based
/// JavaScript index of the same character. Add 1 for a reported column.
pub fn utf16Index(bytes: []const u8, byte_index: usize) usize {
    return utf16Len(bytes[0..@min(byte_index, bytes.len)]);
}

/// Whether the code point is JavaScript whitespace (`/\s/`).
pub fn isJsWhitespace(cp: u21) bool {
    return switch (cp) {
        0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF => true,
        else => false,
    };
}

/// `/\s/` for an ASCII byte. Multi-byte whitespace needs `isJsWhitespace`.
pub fn isAsciiSpace(c: u8) bool {
    return c == ' ' or (c >= 0x09 and c <= 0x0D);
}

/// `/\w/`
pub fn isWordByte(c: u8) bool {
    return std.ascii.isAlphanumeric(c) or c == '_';
}

/// `/[\w$]/`
pub fn isIdentByte(c: u8) bool {
    return isWordByte(c) or c == '$';
}

/// `str.trim()` - JavaScript whitespace at both ends, including multi-byte.
pub fn trim(s: []const u8) []const u8 {
    return trimEnd(trimStart(s));
}

pub fn trimStart(s: []const u8) []const u8 {
    var i: usize = 0;
    while (i < s.len) {
        const len = whitespaceLenAt(s, i);
        if (len == 0) break;
        i += len;
    }
    return s[i..];
}

pub fn trimEnd(s: []const u8) []const u8 {
    var end = s.len;
    while (end > 0) {
        // Find the start of the last character
        var start = end - 1;
        while (start > 0 and (s[start] & 0xC0) == 0x80) start -= 1;
        if (whitespaceLenAt(s, start) != end - start) break;
        end = start;
    }
    return s[0..end];
}

/// Byte length of the whitespace character at `i`, or 0 if it is not one.
pub fn whitespaceLenAt(s: []const u8, i: usize) usize {
    const b = s[i];
    if (b < 0x80) return if (isAsciiSpace(b)) 1 else 0;
    const len = std.unicode.utf8ByteSequenceLength(b) catch return 0;
    if (i + len > s.len) return 0;
    const cp = std.unicode.utf8Decode(s[i .. i + len]) catch return 0;
    return if (isJsWhitespace(cp)) len else 0;
}

/// `/^#!\s*(?:\/usr\/bin\/env\s+)?(?:ba|z|k|da)?sh\b/` - a shell script
/// shebang, which makes the TypeScript linter run the shell rules on the file.
pub fn hasShellShebang(content: []const u8) bool {
    if (!std.mem.startsWith(u8, content, "#!")) return false;
    var i: usize = 2;
    while (i < content.len and whitespaceLenAt(content, i) > 0) i += whitespaceLenAt(content, i);
    const env = "/usr/bin/env";
    if (std.mem.startsWith(u8, content[i..], env)) {
        var j = i + env.len;
        const ws_start = j;
        while (j < content.len and whitespaceLenAt(content, j) > 0) j += whitespaceLenAt(content, j);
        if (j > ws_start) i = j;
    }
    for ([_][]const u8{ "bash", "zsh", "ksh", "dash", "sh" }) |shell| {
        if (std.mem.startsWith(u8, content[i..], shell)) {
            const after = i + shell.len;
            return after >= content.len or !isWordByte(content[after]);
        }
    }
    return false;
}

test "splitLines matches /\\r?\\n/" {
    const lines = try splitLinesUncached(std.testing.allocator, "a\r\nb\rc\n\nd");
    defer std.testing.allocator.free(lines);
    try std.testing.expectEqual(@as(usize, 4), lines.len);
    try std.testing.expectEqualStrings("a", lines[0]);
    try std.testing.expectEqualStrings("b\rc", lines[1]);
    try std.testing.expectEqualStrings("", lines[2]);
    try std.testing.expectEqualStrings("d", lines[3]);
}

test "utf16 lengths" {
    try std.testing.expectEqual(@as(usize, 3), utf16Len("abc"));
    try std.testing.expectEqual(@as(usize, 1), utf16Len("é"));
    try std.testing.expectEqual(@as(usize, 2), utf16Len("😀"));
    try std.testing.expectEqual(@as(usize, 3), utf16Index("é😀x", 6));
}

test "utf16 lengths of invalid UTF-8" {
    // A truncated sequence is one U+FFFD; a stray continuation byte is one each
    try std.testing.expectEqual(@as(usize, 2), utf16Len("\xE2\x80a"));
    try std.testing.expectEqual(@as(usize, 2), utf16Len("\x80\x80"));
    // An overlong or surrogate lead stops at its second byte
    try std.testing.expectEqual(@as(usize, 3), utf16Len("\xE0\x80\x80"));
    try std.testing.expectEqual(@as(usize, 3), utf16Len("\xED\xA0\x80"));
    try std.testing.expectEqual(@as(usize, 1), utf16Len("\xF0\x9F\x98"));
    try std.testing.expectEqual(@as(usize, 2), utf16Len("\xF4\x90"));
}

test "shell shebang" {
    // As the TypeScript regex has it: only `env`-style or bare shell names
    try std.testing.expect(!hasShellShebang("#!/bin/sh\n"));
    try std.testing.expect(hasShellShebang("#!sh\n"));
    try std.testing.expect(hasShellShebang("#!/usr/bin/env bash\n"));
    try std.testing.expect(!hasShellShebang("#!/usr/bin/env node\n"));
    try std.testing.expect(!hasShellShebang("#!/bin/shell\n"));
}

test "shell shebang edge cases" {
    try std.testing.expect(hasShellShebang("#!/usr/bin/env bash"));
    try std.testing.expect(hasShellShebang("#!  /usr/bin/env  dash x"));
    try std.testing.expect(!hasShellShebang("#!/usr/bin/envsh"));
    try std.testing.expect(!hasShellShebang("#!dashboard"));
}
