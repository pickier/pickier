const std = @import("std");
const Allocator = std.mem.Allocator;
const scanner = @import("scanner.zig");
const cfg_mod = @import("config.zig");

// ---------------------------------------------------------------------------
// Output reporters matching TS formatStylish/formatVerbose from formatter.ts
// ---------------------------------------------------------------------------

/// Format and output all issues using the specified reporter
pub fn reportIssues(
    issues: []const scanner.LintIssue,
    reporter: cfg_mod.LintConfig.Reporter,
    total_errors: u32,
    total_warnings: u32,
    verbose: bool,
    io: std.Io,
    allocator: Allocator,
) !void {
    if (issues.len == 0) {
        if (verbose) {
            writeStderr(io, "No issues found.\n");
        }
        return;
    }

    switch (reporter) {
        .json => try reportJson(issues, total_errors, total_warnings, io, allocator),
        .compact => reportCompact(issues, io),
        .stylish => reportStylish(issues, io),
    }

    // Summary line (matching TS: ✖ N problems (X errors, Y warnings))
    // For JSON reporter, skip the text summary (JSON is self-contained)
    if (reporter != .json) {
        const total = total_errors + total_warnings;
        var summary_buf: [512]u8 = undefined;
        const summary = std.fmt.bufPrint(&summary_buf, "\n\x1b[31m\xe2\x9c\x96 {d} {s} ({d} {s}, {d} {s})\x1b[0m\n", .{
            total,
            if (total == 1) "problem" else "problems",
            total_errors,
            if (total_errors == 1) "error" else "errors",
            total_warnings,
            if (total_warnings == 1) "warning" else "warnings",
        }) catch return;
        writeStdout(io, summary);

        // Verbose scan summary
        if (verbose) {
            var verbose_buf: [256]u8 = undefined;
            const verbose_msg = std.fmt.bufPrint(&verbose_buf, "\x1b[90mFound {d} errors and {d} warnings.\x1b[0m\n", .{ total_errors, total_warnings }) catch return;
            writeStdout(io, verbose_msg);
        }
    }
}

/// ESLint-style stylish reporter: grouped by file
fn reportStylish(issues: []const scanner.LintIssue, io: std.Io) void {
    var current_file: []const u8 = "";

    for (issues) |issue| {
        if (!std.mem.eql(u8, issue.file_path, current_file)) {
            current_file = issue.file_path;
            writeStdout(io, "\n\x1b[4m");
            writeStdout(io, current_file);
            writeStdout(io, "\x1b[0m\n");
        }

        var line_buf: [32]u8 = undefined;
        const line_str = std.fmt.bufPrint(&line_buf, "  {d}:{d}", .{ issue.line, issue.column }) catch "  ?:?";
        writeStdout(io, line_str);

        // Pad to column 12 for alignment
        var pad: usize = if (line_str.len < 12) 12 - line_str.len else 1;
        while (pad > 0) : (pad -= 1) writeStdout(io, " ");

        // Severity with color
        if (issue.severity == .@"error") {
            writeStdout(io, "\x1b[31merror\x1b[0m");
            writeStdout(io, "    ");
        } else {
            writeStdout(io, "\x1b[33mwarning\x1b[0m");
            writeStdout(io, "  ");
        }

        writeStdout(io, issue.message);
        writeStdout(io, "  \x1b[90m");
        writeStdout(io, issue.rule_id);
        writeStdout(io, "\x1b[0m\n");
    }
}

/// Compact reporter: file:line:col severity ruleId message
fn reportCompact(issues: []const scanner.LintIssue, io: std.Io) void {
    for (issues) |issue| {
        writeStdout(io, issue.file_path);
        writeStdout(io, ":");
        var buf: [32]u8 = undefined;
        const pos_str = std.fmt.bufPrint(&buf, "{d}:{d}", .{ issue.line, issue.column }) catch "?:?";
        writeStdout(io, pos_str);
        writeStdout(io, " ");
        writeStdout(io, issue.severity.toString());
        writeStdout(io, " ");
        writeStdout(io, issue.rule_id);
        writeStdout(io, " ");
        writeStdout(io, issue.message);
        writeStdout(io, "\n");
    }
}

/// JSON reporter: structured output
fn reportJson(
    issues: []const scanner.LintIssue,
    total_errors: u32,
    total_warnings: u32,
    io: std.Io,
    allocator: Allocator,
) !void {
    var buf = std.ArrayList(u8){};
    defer buf.deinit(allocator);

    try buf.appendSlice(allocator, "{\n  \"errors\": ");
    var num_buf: [32]u8 = undefined;
    var num = std.fmt.bufPrint(&num_buf, "{d}", .{total_errors}) catch "0";
    try buf.appendSlice(allocator, num);
    try buf.appendSlice(allocator, ",\n  \"warnings\": ");
    num = std.fmt.bufPrint(&num_buf, "{d}", .{total_warnings}) catch "0";
    try buf.appendSlice(allocator, num);
    try buf.appendSlice(allocator, ",\n  \"issues\": [");

    for (issues, 0..) |issue, i| {
        if (i > 0) try buf.appendSlice(allocator, ",");
        try buf.appendSlice(allocator, "\n    {\n      \"filePath\": \"");
        try appendJsonEscaped(&buf, issue.file_path, allocator);
        try buf.appendSlice(allocator, "\",\n      \"line\": ");
        num = std.fmt.bufPrint(&num_buf, "{d}", .{issue.line}) catch "0";
        try buf.appendSlice(allocator, num);
        try buf.appendSlice(allocator, ",\n      \"column\": ");
        num = std.fmt.bufPrint(&num_buf, "{d}", .{issue.column}) catch "0";
        try buf.appendSlice(allocator, num);
        try buf.appendSlice(allocator, ",\n      \"ruleId\": \"");
        try buf.appendSlice(allocator, issue.rule_id);
        try buf.appendSlice(allocator, "\",\n      \"message\": \"");
        try appendJsonEscaped(&buf, issue.message, allocator);
        try buf.appendSlice(allocator, "\",\n      \"severity\": \"");
        try buf.appendSlice(allocator, issue.severity.toString());
        try buf.appendSlice(allocator, "\"");
        if (issue.help) |help| {
            try buf.appendSlice(allocator, ",\n      \"help\": \"");
            try appendJsonEscaped(&buf, help, allocator);
            try buf.appendSlice(allocator, "\"");
        }
        try buf.appendSlice(allocator, "\n    }");
    }

    try buf.appendSlice(allocator, "\n  ]\n}\n");
    writeStdout(io, buf.items);
}

fn appendJsonEscaped(buf: *std.ArrayList(u8), s: []const u8, allocator: Allocator) !void {
    for (s) |c| {
        switch (c) {
            '"' => try buf.appendSlice(allocator, "\\\""),
            '\\' => try buf.appendSlice(allocator, "\\\\"),
            '\n' => try buf.appendSlice(allocator, "\\n"),
            '\r' => try buf.appendSlice(allocator, "\\r"),
            '\t' => try buf.appendSlice(allocator, "\\t"),
            else => try buf.append(allocator, c),
        }
    }
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

fn writeStdout(io: std.Io, msg: []const u8) void {
    var buf: [65536]u8 = undefined;
    var w = std.Io.File.stdout().writerStreaming(io, &buf);
    w.interface.writeAll(msg) catch {};
    w.interface.flush() catch {};
}

fn writeStderr(io: std.Io, msg: []const u8) void {
    var buf: [8192]u8 = undefined;
    var w = std.Io.File.stderr().writerStreaming(io, &buf);
    w.interface.writeAll(msg) catch {};
    w.interface.flush() catch {};
}
