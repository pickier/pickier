const std = @import("std");
const Allocator = std.mem.Allocator;
const config = @import("config.zig");

// ---------------------------------------------------------------------------
// Ignore pattern matching & file validation (pure logic, no I/O)
//
// Directory walking (which requires std.Io) lives in main.zig.
// ---------------------------------------------------------------------------

/// Check if a single file should be processed
pub fn isValidFile(path: []const u8, extensions: []const config.Extension, ignores: []const []const u8) bool {
    if (shouldIgnorePath(path, ignores)) return false;
    return config.hasMatchingExtension(path, extensions);
}

/// Fast path: commonly ignored directory names
pub fn isCommonIgnoredDir(name: []const u8) bool {
    const ignored = [_][]const u8{
        "node_modules", ".git",      ".next",     ".nuxt",
        ".output",      ".vercel",   ".netlify",  ".cache",
        ".turbo",       ".vscode",   ".idea",     ".zed",
        ".cursor",      ".claude",   ".github",   "dist",
        "build",        "coverage",  ".nyc_output", "tmp",
        "temp",         ".tmp",      ".temp",     "vendor",
        "pantry",       "target",    "zig-cache", "zig-out",
        ".pnpm",        ".yarn",     "out",       ".vite",
    };
    for (ignored) |ign| {
        if (std.mem.eql(u8, name, ign)) return true;
    }
    return false;
}

/// Check if a path matches any ignore pattern.
/// Supports simple glob patterns:
///   - `**/name/**` matches any path containing `/name/`
///   - `**/*.ext` matches any file with that extension
///   - `name/**` matches paths starting with name/
pub fn shouldIgnorePath(path: []const u8, patterns: []const []const u8) bool {
    const normalized = path; // already forward-slash on unix

    for (patterns) |pattern| {
        if (matchGlobPattern(normalized, pattern)) return true;
    }
    return false;
}

fn matchGlobPattern(path: []const u8, pattern: []const u8) bool {
    // Handle common patterns directly for performance

    // Pattern: **/name/** — match if path contains /name/
    if (std.mem.startsWith(u8, pattern, "**/") and std.mem.endsWith(u8, pattern, "/**")) {
        const name = pattern[3 .. pattern.len - 3];
        // Check if path contains /name/ or starts with name/
        if (std.mem.indexOf(u8, path, "/") != null) {
            var search_buf: [256]u8 = undefined;
            const search = std.fmt.bufPrint(&search_buf, "/{s}/", .{name}) catch return false;
            if (std.mem.indexOf(u8, path, search) != null) return true;
            // Also check if path starts with name/
            const prefix = std.fmt.bufPrint(&search_buf, "{s}/", .{name}) catch return false;
            if (std.mem.startsWith(u8, path, prefix)) return true;
        }
        return false;
    }

    // Pattern: **/*.ext — match if file ends with .ext
    if (std.mem.startsWith(u8, pattern, "**/")) {
        const suffix = pattern[3..];
        if (std.mem.startsWith(u8, suffix, "*")) {
            // **/*.ext — match file extension
            const ext = suffix[1..];
            return std.mem.endsWith(u8, path, ext);
        }
        // **/filename — match if basename equals filename
        const basename = getBasename(path);
        return std.mem.eql(u8, basename, suffix);
    }

    // Pattern: name/** — match paths starting with name/
    if (std.mem.endsWith(u8, pattern, "/**")) {
        const prefix = pattern[0 .. pattern.len - 3];
        return std.mem.startsWith(u8, path, prefix);
    }

    // Exact match
    return std.mem.eql(u8, path, pattern);
}

fn getBasename(path: []const u8) []const u8 {
    if (std.mem.lastIndexOfScalar(u8, path, '/')) |pos| {
        return path[pos + 1 ..];
    }
    return path;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "isCommonIgnoredDir" {
    try std.testing.expect(isCommonIgnoredDir("node_modules"));
    try std.testing.expect(isCommonIgnoredDir(".git"));
    try std.testing.expect(isCommonIgnoredDir("dist"));
    try std.testing.expect(isCommonIgnoredDir("zig-cache"));
    try std.testing.expect(!isCommonIgnoredDir("src"));
    try std.testing.expect(!isCommonIgnoredDir("lib"));
}

test "shouldIgnorePath - double star name" {
    const ignores = &[_][]const u8{"**/node_modules/**"};
    try std.testing.expect(shouldIgnorePath("foo/node_modules/bar", ignores));
    try std.testing.expect(shouldIgnorePath("node_modules/bar", ignores));
    try std.testing.expect(!shouldIgnorePath("foo/src/bar", ignores));
}

test "shouldIgnorePath - extension pattern" {
    const ignores = &[_][]const u8{"**/*.test.ts"};
    try std.testing.expect(shouldIgnorePath("foo/bar.test.ts", ignores));
    try std.testing.expect(!shouldIgnorePath("foo/bar.ts", ignores));
}

test "shouldIgnorePath - exact filename" {
    const ignores = &[_][]const u8{"**/package-lock.json"};
    try std.testing.expect(shouldIgnorePath("foo/package-lock.json", ignores));
    try std.testing.expect(!shouldIgnorePath("foo/package.json", ignores));
}

test "matchGlobPattern - prefix pattern" {
    try std.testing.expect(matchGlobPattern("docs/readme.md", "docs/**"));
    try std.testing.expect(!matchGlobPattern("src/readme.md", "docs/**"));
}

test "isValidFile" {
    const exts = &[_]config.Extension{ .ts, .js };
    const ignores = &[_][]const u8{"**/node_modules/**"};
    try std.testing.expect(isValidFile("src/index.ts", exts, ignores));
    try std.testing.expect(!isValidFile("node_modules/foo/index.ts", exts, ignores));
    try std.testing.expect(!isValidFile("src/index.css", exts, ignores));
}
