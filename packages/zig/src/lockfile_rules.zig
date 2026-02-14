const std = @import("std");
const Allocator = std.mem.Allocator;
const cfg_mod = @import("config.zig");
const scanner = @import("scanner.zig");
const directives_mod = @import("directives.zig");

const LintIssue = scanner.LintIssue;
const Severity = LintIssue.Severity;

fn mapSeverity(sev: cfg_mod.RuleSeverity) ?Severity {
    return switch (sev) {
        .@"error" => .@"error",
        .warn => .warning,
        .off => null,
    };
}

/// Run lockfile rules on lock file content
pub fn runLockfileRules(
    file_path: []const u8,
    content: []const u8,
    cfg: *const cfg_mod.PickierConfig,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    if (mapSeverity(cfg.getPluginRuleSeverity("lockfile/validate-https"))) |sev|
        try checkValidateHttps(file_path, content, sev, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("lockfile/validate-package-names"))) |sev|
        try checkValidatePackageNames(file_path, content, sev, issues, allocator);
    if (mapSeverity(cfg.getPluginRuleSeverity("lockfile/validate-scheme"))) |sev|
        try checkValidateScheme(file_path, content, sev, issues, allocator);
}

// ---------------------------------------------------------------------------
// lockfile/validate-https — ensure all URLs use HTTPS
// ---------------------------------------------------------------------------

fn checkValidateHttps(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    var line_no: u32 = 1;
    var pos: usize = 0;
    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        // Look for http:// URLs (not https://)
        if (std.mem.indexOf(u8, line, "http://")) |http_pos| {
            // Make sure it's not https://
            if (http_pos + 8 < line.len and line[http_pos + 4] != 's') {
                try issues.append(allocator, .{
                    .file_path = file_path,
                    .line = line_no,
                    .column = @intCast(http_pos + 1),
                    .rule_id = "lockfile/validate-https",
                    .message = "Non-HTTPS URL found in lockfile",
                    .severity = severity,
                });
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// lockfile/validate-package-names — ensure package names look valid
// ---------------------------------------------------------------------------

fn checkValidatePackageNames(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    // For YAML lockfiles (pnpm-lock.yaml), check for suspicious package names
    // containing characters that shouldn't be there
    if (!std.mem.endsWith(u8, file_path, ".yaml") and !std.mem.endsWith(u8, file_path, ".yml"))
        return;

    var line_no: u32 = 1;
    var pos: usize = 0;
    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        // Look for package entries like '  /packagename@version:' or '  packagename@version:'
        if (trimmed.len > 0 and trimmed[0] == '/' and std.mem.indexOf(u8, trimmed, "@") != null) {
            const pkg = trimmed[1 .. std.mem.indexOf(u8, trimmed, "@") orelse trimmed.len];
            // Check for suspicious characters
            for (pkg) |ch| {
                if (ch == '\\' or ch == ';' or ch == '|' or ch == '&') {
                    try issues.append(allocator, .{
                        .file_path = file_path,
                        .line = line_no,
                        .column = 1,
                        .rule_id = "lockfile/validate-package-names",
                        .message = "Suspicious characters in package name",
                        .severity = severity,
                    });
                    break;
                }
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

// ---------------------------------------------------------------------------
// lockfile/validate-scheme — ensure URLs use allowed schemes
// ---------------------------------------------------------------------------

fn checkValidateScheme(
    file_path: []const u8,
    content: []const u8,
    severity: Severity,
    issues: *std.ArrayList(LintIssue),
    allocator: Allocator,
) !void {
    const allowed = [_][]const u8{ "https:", "git+https:", "git+ssh:" };

    var line_no: u32 = 1;
    var pos: usize = 0;
    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];

        // Find URLs with schemes
        if (std.mem.indexOf(u8, line, "://")) |scheme_end| {
            // Extract scheme (everything before ://)
            var scheme_start = scheme_end;
            while (scheme_start > 0 and isSchemeChar(line[scheme_start - 1])) scheme_start -= 1;
            const scheme_with_colon = line[scheme_start .. scheme_end + 1]; // include ':'

            // Check if scheme is allowed
            var is_allowed = false;
            for (allowed) |a| {
                if (std.mem.eql(u8, scheme_with_colon, a)) {
                    is_allowed = true;
                    break;
                }
            }
            if (!is_allowed and scheme_with_colon.len > 1) {
                try issues.append(allocator, .{
                    .file_path = file_path,
                    .line = line_no,
                    .column = @intCast(scheme_start + 1),
                    .rule_id = "lockfile/validate-scheme",
                    .message = "URL uses disallowed scheme",
                    .severity = severity,
                });
            }
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
        line_no += 1;
    }
}

fn isSchemeChar(ch: u8) bool {
    return (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or ch == '+' or ch == '-' or ch == '.';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "validate-https detects http" {
    const alloc = std.testing.allocator;
    var issues = std.ArrayList(LintIssue){};
    defer issues.deinit(alloc);
    try checkValidateHttps("lock.yaml", "resolved: http://registry.npmjs.org/foo\n", .@"error", &issues, alloc);
    try std.testing.expect(issues.items.len == 1);
}

test "validate-https allows https" {
    const alloc = std.testing.allocator;
    var issues = std.ArrayList(LintIssue){};
    defer issues.deinit(alloc);
    try checkValidateHttps("lock.yaml", "resolved: https://registry.npmjs.org/foo\n", .@"error", &issues, alloc);
    try std.testing.expect(issues.items.len == 0);
}
