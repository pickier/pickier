const std = @import("std");
const format = @import("format.zig");
const cfg_mod = @import("config.zig");
const walker = @import("walker.zig");
const scanner = @import("scanner.zig");
const dir_mod = @import("directives.zig");
const reporter = @import("reporter.zig");
const rules = @import("rules.zig");
const zig_config = @import("zig-config");

const version = "0.1.0";
const max_file_size = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// CLI parsed options
// ---------------------------------------------------------------------------
const Mode = enum { auto, lint, format };

const CliOptions = struct {
    mode: Mode = .auto,
    check: bool = false,
    write: bool = false,
    fix: bool = false,
    dry_run: bool = false,
    verbose: bool = false,
    reporter: cfg_mod.LintConfig.Reporter = .stylish,
    max_warnings: i32 = -1,
    ext: ?[]const u8 = null,
    config_path: ?[]const u8 = null,
    files: std.ArrayList([]const u8) = .{},
};

// ---------------------------------------------------------------------------
// Entry point (Zig 0.16 Init pattern)
// ---------------------------------------------------------------------------
pub fn main(init: std.process.Init) !void {
    const allocator = init.gpa;
    const io = init.io;

    // Collect args into a slice
    const args = try init.minimal.args.toSlice(init.arena.allocator());

    // Skip program name
    const cmd_args: []const [:0]const u8 = if (args.len > 0) args[1..] else args;

    if (cmd_args.len == 0) {
        printHelp(io);
        return;
    }

    const subcmd: []const u8 = cmd_args[0];

    if (std.mem.eql(u8, subcmd, "version") or std.mem.eql(u8, subcmd, "--version") or std.mem.eql(u8, subcmd, "-v")) {
        writeStdout(io, version ++ "\n");
        return;
    }

    if (std.mem.eql(u8, subcmd, "help") or std.mem.eql(u8, subcmd, "--help") or std.mem.eql(u8, subcmd, "-h")) {
        printHelp(io);
        return;
    }

    if (std.mem.eql(u8, subcmd, "run")) {
        const code = try runCommand(cmd_args[1..], allocator, io);
        if (code != 0) std.process.exit(code);
        return;
    }

    if (std.mem.eql(u8, subcmd, "lint")) {
        var modified_args = std.ArrayList([]const u8){};
        defer modified_args.deinit(allocator);
        try modified_args.append(allocator, "--mode");
        try modified_args.append(allocator, "lint");
        for (cmd_args[1..]) |a| try modified_args.append(allocator, a);
        const code = try runCommandSlice(modified_args.items, allocator, io);
        if (code != 0) std.process.exit(code);
        return;
    }

    if (std.mem.eql(u8, subcmd, "format")) {
        var modified_args = std.ArrayList([]const u8){};
        defer modified_args.deinit(allocator);
        try modified_args.append(allocator, "--mode");
        try modified_args.append(allocator, "format");
        for (cmd_args[1..]) |a| try modified_args.append(allocator, a);
        const code = try runCommandSlice(modified_args.items, allocator, io);
        if (code != 0) std.process.exit(code);
        return;
    }

    // Unknown command
    writeStderr(io, "Unknown command: ");
    writeStderr(io, subcmd);
    writeStderr(io, "\n\n");
    printHelp(io);
    std.process.exit(1);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
fn parseArgs(args: []const []const u8, allocator: std.mem.Allocator) !CliOptions {
    var opts = CliOptions{};

    var i: usize = 0;
    while (i < args.len) : (i += 1) {
        const arg: []const u8 = args[i];
        if (std.mem.eql(u8, arg, "--mode")) {
            i += 1;
            if (i < args.len) {
                const m: []const u8 = args[i];
                if (std.mem.eql(u8, m, "lint")) {
                    opts.mode = .lint;
                } else if (std.mem.eql(u8, m, "format")) {
                    opts.mode = .format;
                } else {
                    opts.mode = .auto;
                }
            }
        } else if (std.mem.eql(u8, arg, "--check")) {
            opts.check = true;
        } else if (std.mem.eql(u8, arg, "--write")) {
            opts.write = true;
        } else if (std.mem.eql(u8, arg, "--fix")) {
            opts.fix = true;
        } else if (std.mem.eql(u8, arg, "--dry-run")) {
            opts.dry_run = true;
        } else if (std.mem.eql(u8, arg, "--verbose")) {
            opts.verbose = true;
        } else if (std.mem.eql(u8, arg, "--reporter")) {
            i += 1;
            if (i < args.len) {
                const r: []const u8 = args[i];
                if (std.mem.eql(u8, r, "json")) {
                    opts.reporter = .json;
                } else if (std.mem.eql(u8, r, "compact")) {
                    opts.reporter = .compact;
                } else {
                    opts.reporter = .stylish;
                }
            }
        } else if (std.mem.eql(u8, arg, "--max-warnings")) {
            i += 1;
            if (i < args.len) {
                opts.max_warnings = std.fmt.parseInt(i32, args[i], 10) catch -1;
            }
        } else if (std.mem.eql(u8, arg, "--ext")) {
            i += 1;
            if (i < args.len) {
                opts.ext = args[i];
            }
        } else if (std.mem.eql(u8, arg, "--config")) {
            i += 1;
            if (i < args.len) {
                opts.config_path = args[i];
            }
        } else if (std.mem.eql(u8, arg, "--cache") or std.mem.eql(u8, arg, "--ignore-path")) {
            if (std.mem.eql(u8, arg, "--ignore-path")) i += 1;
        } else if (!std.mem.startsWith(u8, arg, "--")) {
            try opts.files.append(allocator, arg);
        }
    }

    return opts;
}

// ---------------------------------------------------------------------------
// Run command — main entry point
// ---------------------------------------------------------------------------
fn runCommand(args: []const [:0]const u8, allocator: std.mem.Allocator, io: std.Io) !u8 {
    var plain_args = std.ArrayList([]const u8){};
    defer plain_args.deinit(allocator);
    for (args) |a| try plain_args.append(allocator, a);
    return runCommandSlice(plain_args.items, allocator, io);
}

fn runCommandSlice(args: []const []const u8, allocator: std.mem.Allocator, io: std.Io) !u8 {
    var opts = try parseArgs(args, allocator);
    defer opts.files.deinit(allocator);

    // Load config
    const cfg = loadConfig(opts.config_path, allocator, io);

    // If no files specified, default to "."
    if (opts.files.items.len == 0) {
        try opts.files.append(allocator, ".");
    }

    // Determine effective mode (matching TS run.ts logic)
    const effective_mode: Mode = blk: {
        if (opts.mode != .auto) break :blk opts.mode;
        if (opts.fix or opts.reporter != .stylish or opts.max_warnings >= 0 or opts.dry_run) {
            break :blk .lint;
        }
        break :blk .format;
    };

    // Determine extensions to use
    const extensions = if (opts.ext) |ext_csv|
        try parseExtensions(ext_csv, allocator)
    else if (effective_mode == .lint)
        cfg.lint.extensions
    else
        cfg.format.extensions;

    const ignores = cfg.ignores;

    // Resolve file list — expand directories
    var all_files = std.ArrayList([]const u8){};
    defer {
        for (all_files.items) |f| allocator.free(f);
        all_files.deinit(allocator);
    }

    for (opts.files.items) |file_arg| {
        try walkFiles(file_arg, extensions, ignores, &all_files, allocator, io);
    }

    if (all_files.items.len == 0) {
        if (opts.verbose or cfg.verbose) {
            writeStderr(io, "No matching files found\n");
        }
        return 0;
    }

    return switch (effective_mode) {
        .format => try runFormatMode(&all_files, &cfg, &opts, allocator, io),
        .lint => try runLintMode(&all_files, &cfg, &opts, allocator, io),
        .auto => unreachable,
    };
}

// ---------------------------------------------------------------------------
// Config loading (using zig-config for file discovery + JSONC support)
// ---------------------------------------------------------------------------
fn loadConfig(config_path: ?[]const u8, allocator: std.mem.Allocator, io: std.Io) cfg_mod.PickierConfig {
    // If explicit path provided, try to load it directly
    if (config_path) |path| {
        if (readSmallFile(path, allocator, io)) |content| {
            defer allocator.free(content);
            return cfg_mod.parseJsonConfig(content) catch cfg_mod.default_config;
        }
        return cfg_mod.default_config;
    }

    // Use zig-config for automatic file discovery
    // Searches: ./pickier.json, ./config/pickier.json, ./.config/pickier.json, ~/.config/pickier.json
    // Also supports .jsonc (JSON with comments)
    var result = zig_config.config_loader.loadConfigUntyped(allocator, .{
        .name = "pickier",
        .env_prefix = "PICKIER",
        .cache = false,
    }) catch return cfg_mod.default_config;
    defer result.deinit();

    return cfg_mod.parseJsonValue(result.config, allocator) catch cfg_mod.default_config;
}

/// Read a small file (< 1MB) using std.Io, returns null on failure
fn readSmallFile(path: []const u8, allocator: std.mem.Allocator, io: std.Io) ?[]u8 {
    const cwd = std.Io.Dir.cwd();
    const file = cwd.openFile(io, path, .{}) catch return null;
    defer file.close(io);

    const stat = file.stat(io) catch return null;
    const file_size: usize = @intCast(stat.size);
    if (file_size == 0 or file_size > 1024 * 1024) return null;

    var read_buf: [65536]u8 = undefined;
    var reader = file.reader(io, &read_buf);
    return reader.interface.readAlloc(allocator, file_size) catch null;
}

// ---------------------------------------------------------------------------
// Directory walking (using std.Io for directory access)
// ---------------------------------------------------------------------------
fn walkFiles(
    path: []const u8,
    extensions: []const cfg_mod.Extension,
    ignores: []const []const u8,
    out: *std.ArrayList([]const u8),
    allocator: std.mem.Allocator,
    io: std.Io,
) !void {
    const cwd = std.Io.Dir.cwd();

    // Try to open as directory
    var dir = cwd.openDir(io, path, .{ .iterate = true }) catch |err| {
        switch (err) {
            error.NotDir => {
                // It's a file — check if it matches extensions and isn't ignored
                if (walker.isValidFile(path, extensions, ignores)) {
                    try out.append(allocator, try allocator.dupe(u8, path));
                }
                return;
            },
            else => return, // skip inaccessible paths
        }
    };
    dir.close(io);

    // Iterative directory traversal
    var stack = std.ArrayList([]const u8){};
    defer {
        for (stack.items) |item| allocator.free(item);
        stack.deinit(allocator);
    }
    try stack.append(allocator, try allocator.dupe(u8, path));

    while (stack.items.len > 0) {
        const current_dir = stack.pop() orelse break;
        defer allocator.free(current_dir);

        var iter_dir = cwd.openDir(io, current_dir, .{ .iterate = true }) catch continue;
        defer iter_dir.close(io);

        var iter = iter_dir.iterate();
        while (try iter.next(io)) |entry| {
            const full_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ current_dir, entry.name });

            if (walker.shouldIgnorePath(full_path, ignores)) {
                allocator.free(full_path);
                continue;
            }

            switch (entry.kind) {
                .directory => {
                    if (walker.isCommonIgnoredDir(entry.name)) {
                        allocator.free(full_path);
                        continue;
                    }
                    try stack.append(allocator, full_path);
                },
                .file => {
                    if (cfg_mod.hasMatchingExtension(entry.name, extensions)) {
                        try out.append(allocator, full_path);
                    } else {
                        allocator.free(full_path);
                    }
                },
                else => {
                    allocator.free(full_path);
                },
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Format mode
// ---------------------------------------------------------------------------
fn runFormatMode(
    files: *const std.ArrayList([]const u8),
    cfg: *const cfg_mod.PickierConfig,
    opts: *const CliOptions,
    allocator: std.mem.Allocator,
    io: std.Io,
) !u8 {
    const format_cfg = cfg.toFormatConfig();
    var exit_code: u8 = 0;
    var files_changed: u32 = 0;
    var files_checked: u32 = 0;

    for (files.items) |file_path| {
        files_checked += 1;

        const content = readFileContent(file_path, allocator, io) orelse continue;
        defer allocator.free(content);

        const formatted = format.formatCodeWithConfig(content, file_path, format_cfg, allocator) catch |err| {
            writeStderr(io, "Error formatting ");
            writeStderr(io, file_path);
            var err_buf: [256]u8 = undefined;
            const err_msg = std.fmt.bufPrint(&err_buf, ": {}\n", .{err}) catch ": unknown error\n";
            writeStderr(io, err_msg);
            exit_code = 1;
            continue;
        };
        defer allocator.free(formatted);

        const changed = !std.mem.eql(u8, content, formatted);

        if (opts.check) {
            if (changed) {
                if (opts.verbose or cfg.verbose) {
                    writeStderr(io, "Would format: ");
                    writeStderr(io, file_path);
                    writeStderr(io, "\n");
                }
                exit_code = 1;
                files_changed += 1;
            }
        } else if (opts.write) {
            if (changed) {
                writeFileContent(file_path, formatted, io) catch {
                    writeStderr(io, "Error writing ");
                    writeStderr(io, file_path);
                    writeStderr(io, "\n");
                    exit_code = 1;
                    continue;
                };
                files_changed += 1;
            }
        } else {
            writeStdout(io, formatted);
        }
    }

    // Summary output for check/write modes
    if ((opts.check or opts.write) and (opts.verbose or cfg.verbose)) {
        var summary_buf: [256]u8 = undefined;
        if (opts.check) {
            const msg = std.fmt.bufPrint(&summary_buf, "Checked {d} files, {d} would be reformatted.\n", .{ files_checked, files_changed }) catch "";
            writeStderr(io, msg);
        } else {
            const msg = std.fmt.bufPrint(&summary_buf, "Formatted {d} of {d} files.\n", .{ files_changed, files_checked }) catch "";
            writeStderr(io, msg);
        }
    }

    return exit_code;
}

// ---------------------------------------------------------------------------
// Lint mode — uses scanner.zig, directives.zig, reporter.zig
// ---------------------------------------------------------------------------
fn runLintMode(
    files: *const std.ArrayList([]const u8),
    cfg: *const cfg_mod.PickierConfig,
    opts: *const CliOptions,
    allocator: std.mem.Allocator,
    io: std.Io,
) !u8 {
    const format_cfg = cfg.toFormatConfig();
    var all_issues = std.ArrayList(scanner.LintIssue){};
    defer {
        for (all_issues.items) |issue| {
            _ = issue;
        }
        all_issues.deinit(allocator);
    }

    var total_errors: u32 = 0;
    var total_warnings: u32 = 0;

    for (files.items) |file_path| {
        const content = readFileContent(file_path, allocator, io) orelse continue;
        defer allocator.free(content);

        // Parse disable directives and comment lines
        var suppress = try dir_mod.parseDisableDirectives(content, allocator);
        defer suppress.deinit(allocator);

        var comment_lines = try dir_mod.getCommentLines(content, allocator);
        defer comment_lines.deinit();

        // Scan for built-in lint issues
        var file_issues = try scanner.scanContent(file_path, content, cfg, &suppress, &comment_lines, allocator);
        defer allocator.free(file_issues);

        // Run plugin rules
        var plugin_issues = std.ArrayList(scanner.LintIssue){};
        defer plugin_issues.deinit(allocator);
        try rules.runPluginRules(file_path, content, cfg, &suppress, &plugin_issues, allocator);

        // If fix mode, apply fixes and re-scan
        if (opts.fix) {
            const fixed = try applyBuiltinFixes(content, file_path, cfg, allocator);
            defer if (!std.mem.eql(u8, fixed, content)) allocator.free(fixed);

            const formatted = format.formatCodeWithConfig(fixed, file_path, format_cfg, allocator) catch fixed;
            const should_free_formatted = !std.mem.eql(u8, formatted, fixed) and !std.mem.eql(u8, formatted, content);
            defer if (should_free_formatted) allocator.free(formatted);

            if (!std.mem.eql(u8, formatted, content)) {
                if (!opts.dry_run) {
                    writeFileContent(file_path, formatted, io) catch {};
                }

                // Re-scan after fixing
                var new_suppress = try dir_mod.parseDisableDirectives(formatted, allocator);
                defer new_suppress.deinit(allocator);
                var new_comment_lines = try dir_mod.getCommentLines(formatted, allocator);
                defer new_comment_lines.deinit();

                allocator.free(file_issues);
                file_issues = try scanner.scanContent(file_path, formatted, cfg, &new_suppress, &new_comment_lines, allocator);
            }
        }

        // Count and collect issues (built-in + plugin)
        for (file_issues) |issue| {
            switch (issue.severity) {
                .@"error" => total_errors += 1,
                .warning => total_warnings += 1,
            }
            try all_issues.append(allocator, issue);
        }
        for (plugin_issues.items) |issue| {
            switch (issue.severity) {
                .@"error" => total_errors += 1,
                .warning => total_warnings += 1,
            }
            try all_issues.append(allocator, issue);
        }
    }

    // Report results
    const rep = if (opts.reporter != .stylish) opts.reporter else cfg.lint.reporter;
    const verbose = opts.verbose or cfg.verbose;
    try reporter.reportIssues(all_issues.items, rep, total_errors, total_warnings, verbose, io, allocator);

    if (total_errors > 0) return 1;

    const max_warnings = if (opts.max_warnings >= 0) opts.max_warnings else cfg.lint.max_warnings;
    if (max_warnings >= 0 and total_warnings > @as(u32, @intCast(max_warnings))) return 1;

    return 0;
}

// ---------------------------------------------------------------------------
// Built-in fixes (debugger removal)
// ---------------------------------------------------------------------------
fn applyBuiltinFixes(content: []const u8, file_path: []const u8, cfg: *const cfg_mod.PickierConfig, allocator: std.mem.Allocator) ![]const u8 {
    _ = file_path;
    if (cfg.rules.no_debugger == .off) return content;

    var result = std.ArrayList(u8){};
    defer result.deinit(allocator);

    var pos: usize = 0;
    while (pos < content.len) {
        const line_end = std.mem.indexOfScalarPos(u8, content, pos, '\n') orelse content.len;
        const line = content[pos..line_end];
        const trimmed = std.mem.trimStart(u8, line, " \t");

        if (!std.mem.startsWith(u8, trimmed, "debugger")) {
            try result.appendSlice(allocator, line);
            if (line_end < content.len) try result.append(allocator, '\n');
        }

        pos = if (line_end < content.len) line_end + 1 else content.len;
    }

    return try result.toOwnedSlice(allocator);
}

// ---------------------------------------------------------------------------
// Extension parsing from --ext flag
// ---------------------------------------------------------------------------
fn parseExtensions(ext_csv: []const u8, allocator: std.mem.Allocator) ![]const cfg_mod.Extension {
    var exts = std.ArrayList(cfg_mod.Extension){};
    defer exts.deinit(allocator);

    var iter = std.mem.splitScalar(u8, ext_csv, ',');
    while (iter.next()) |raw| {
        const trimmed = std.mem.trim(u8, raw, " ");
        const name = if (std.mem.startsWith(u8, trimmed, ".")) trimmed[1..] else trimmed;

        if (stringToExtension(name)) |ext| {
            try exts.append(allocator, ext);
        }
    }

    return try exts.toOwnedSlice(allocator);
}

fn stringToExtension(s: []const u8) ?cfg_mod.Extension {
    if (std.mem.eql(u8, s, "ts")) return .ts;
    if (std.mem.eql(u8, s, "js")) return .js;
    if (std.mem.eql(u8, s, "html")) return .html;
    if (std.mem.eql(u8, s, "css")) return .css;
    if (std.mem.eql(u8, s, "json")) return .json;
    if (std.mem.eql(u8, s, "jsonc")) return .jsonc;
    if (std.mem.eql(u8, s, "md")) return .md;
    if (std.mem.eql(u8, s, "yaml")) return .yaml;
    if (std.mem.eql(u8, s, "yml")) return .yml;
    if (std.mem.eql(u8, s, "stx")) return .stx;
    if (std.mem.eql(u8, s, "lock")) return .lock;
    return null;
}

// ---------------------------------------------------------------------------
// File I/O helpers (using std.Io)
// ---------------------------------------------------------------------------
fn readFileContent(file_path: []const u8, allocator: std.mem.Allocator, io: std.Io) ?[]u8 {
    const cwd = std.Io.Dir.cwd();
    const file = cwd.openFile(io, file_path, .{}) catch return null;
    defer file.close(io);

    const stat = file.stat(io) catch return null;
    const file_size: usize = @intCast(stat.size);
    if (file_size == 0 or file_size > max_file_size) return null;

    var read_buf: [65536]u8 = undefined;
    var reader = file.reader(io, &read_buf);
    return reader.interface.readAlloc(allocator, file_size) catch null;
}

fn writeFileContent(file_path: []const u8, content: []const u8, io: std.Io) !void {
    const cwd = std.Io.Dir.cwd();
    const file = try cwd.createFile(io, file_path, .{});
    defer file.close(io);
    var write_buf: [65536]u8 = undefined;
    var w = file.writerStreaming(io, &write_buf);
    try w.interface.writeAll(content);
    try w.interface.flush();
}

// ---------------------------------------------------------------------------
// Stdout/Stderr helpers
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

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------
fn printHelp(io: std.Io) void {
    writeStdout(io,
        \\pickier-zig — Fast formatter and linter (Zig edition)
        \\
        \\USAGE:
        \\  pickier-zig run <files|dirs...> [options]
        \\
        \\COMMANDS:
        \\  run          Run in unified mode (auto, lint, or format)
        \\  version      Show version
        \\  help         Show this help
        \\
        \\OPTIONS:
        \\  --mode <mode>           auto|lint|format (default: auto)
        \\  --check                 Check without writing (format mode)
        \\  --write                 Write changes to files (format mode)
        \\  --fix                   Auto-fix problems (lint mode)
        \\  --dry-run               Simulate fixes without writing (lint mode)
        \\  --reporter <name>       stylish|json|compact (lint mode)
        \\  --max-warnings <n>      Max warnings before non-zero exit (lint mode)
        \\  --ext <exts>            Comma-separated extensions (e.g. ts,js,json)
        \\  --config <path>         Path to pickier config file
        \\  --verbose               Verbose output
        \\
        \\EXAMPLES:
        \\  pickier-zig run . --mode format --check
        \\  pickier-zig run src --mode format --write
        \\  pickier-zig run . --mode lint --fix
        \\  pickier-zig run . --mode lint --reporter json
        \\
    );
}
