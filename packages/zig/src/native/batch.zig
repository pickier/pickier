//! `pickier-zig lint-batch`: lint files for the TypeScript CLI on every core.
//!
//! Reads one JSON request from stdin -
//!
//!   { "threads": 11,
//!     "format": { "quotes": "single", "indent": 2, "indentStyle": "spaces" },
//!     "builtins": { "quotes": "warning", "indent": "warning", "no-debugger": "error", ... },
//!     "rules": [ { "id": "general/no-unused-vars", "severity": "error", "options": {...} }, ... ],
//!     "files": [ "/abs/a.ts", ... ] }
//!
//! - and writes a JSON array with one entry per file, in the same order: the
//! file's issues (see `lintOne` for the encoding), or `null` when the file
//! could not be read or was declined (the CLI then lints it itself).
//! Exit status 2 means the request asked for something this engine does not
//! implement, and nothing was written.

const std = @import("std");
const types = @import("types.zig");
const pipeline = @import("pipeline.zig");
const registry = @import("registry.zig");

const Allocator = std.mem.Allocator;
const gpa = std.heap.smp_allocator;

const Job = struct {
    io: std.Io,
    files: []const []const u8,
    settings: *const types.Settings,
    next: std.atomic.Value(usize) = .init(0),
    results: []?[]u8,
    failed: std.atomic.Value(bool) = .init(false),
};

pub fn run(io: std.Io, arena: Allocator) !u8 {
    var stdin_buf: [65536]u8 = undefined;
    var reader = std.Io.File.stdin().readerStreaming(io, &stdin_buf);
    const raw = try reader.interface.allocRemaining(arena, .unlimited);
    const request = try std.json.parseFromSliceLeaky(std.json.Value, arena, raw, .{});

    var settings: types.Settings = .{};
    const root = request.object;
    if (root.get("format")) |fmt| {
        if (fmt.object.get("quotes")) |q| settings.quotes = if (std.mem.eql(u8, q.string, "double")) .double else .single;
        if (fmt.object.get("indent")) |n| settings.indent = @intCast(n.integer);
        if (fmt.object.get("indentStyle")) |s| settings.indent_style = if (std.mem.eql(u8, s.string, "tabs")) .tabs else .spaces;
    }
    if (root.get("builtins")) |b| {
        const sev = struct {
            fn of(v: ?std.json.Value) ?types.Severity {
                const value = v orelse return null;
                return if (value == .string) types.Severity.parse(value.string) else null;
            }
        };
        settings.builtins = .{
            .quotes = sev.of(b.object.get("quotes")),
            .indent = sev.of(b.object.get("indent")),
            .no_debugger = sev.of(b.object.get("no-debugger")),
            .no_console = sev.of(b.object.get("no-console")),
            .no_template_curly_in_string = sev.of(b.object.get("no-template-curly-in-string")),
            .no_cond_assign = sev.of(b.object.get("no-cond-assign")),
        };
    }
    var rules: std.ArrayList(types.RuleSetting) = .empty;
    if (root.get("rules")) |list| {
        for (list.array.items) |item| {
            const id = item.object.get("id").?.string;
            if (registry.lookup(id) == null) {
                writeStderr(io, "lint-batch: rule not implemented natively: ");
                writeStderr(io, id);
                writeStderr(io, "\n");
                return 2;
            }
            const options = item.object.get("options");
            try rules.append(arena, .{
                .id = id,
                .severity = if (item.object.get("severity")) |v| (if (v == .string) types.Severity.parse(v.string) else null) else null,
                .options = if (options != null and options.? != .null) options else null,
            });
        }
    }
    settings.rules = rules.items;

    var files: std.ArrayList([]const u8) = .empty;
    for (root.get("files").?.array.items) |f| try files.append(arena, f.string);

    const results = try arena.alloc(?[]u8, files.items.len);
    @memset(results, null);
    var job: Job = .{ .io = io, .files = files.items, .settings = &settings, .results = results };

    const cpus = std.Thread.getCpuCount() catch 1;
    const wanted: usize = if (root.get("threads")) |t| @intCast(@max(1, t.integer)) else cpus;
    const threads = @max(1, @min(wanted, files.items.len));

    // Plain threads with a generous stack: the rules recurse and keep line
    // buffers on the stack, which the small default task stacks overflow.
    const pool = try arena.alloc(?std.Thread, threads);
    for (pool) |*t| t.* = std.Thread.spawn(.{ .stack_size = 16 << 20 }, worker, .{&job}) catch null;
    // Threads that could not start leave their share to this one
    worker(&job);
    for (pool) |t| {
        if (t) |thread| thread.join();
    }

    if (job.failed.load(.acquire)) return 1;

    var out: std.ArrayList(u8) = .empty;
    try out.append(arena, '[');
    for (results, 0..) |r, i| {
        if (i > 0) try out.append(arena, ',');
        try out.appendSlice(arena, r orelse "null");
    }
    try out.appendSlice(arena, "]\n");
    var stdout_buf: [65536]u8 = undefined;
    var w = std.Io.File.stdout().writerStreaming(io, &stdout_buf);
    try w.interface.writeAll(out.items);
    try w.interface.flush();
    return 0;
}

fn worker(job: *Job) void {
    while (true) {
        const i = job.next.fetchAdd(1, .acq_rel);
        if (i >= job.files.len) return;
        job.results[i] = lintOne(job, job.files[i]) catch |err| blk: {
            if (err == error.UnsupportedRule) job.failed.store(true, .release);
            break :blk null;
        };
    }
}

/// One file's issues as a JSON array, or an error if it could not be read.
fn lintOne(job: *Job, path: []const u8) ![]u8 {
    var arena_state = std.heap.ArenaAllocator.init(gpa);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    const file = try std.Io.Dir.cwd().openFile(job.io, path, .{});
    defer file.close(job.io);
    // One read at the file's size; a streaming reader grows its buffer and
    // reads in small pieces, which was a quarter of the run.
    const size: usize = @intCast((try file.stat(job.io)).size);
    const buf = try arena.alloc(u8, size);
    const n = try file.readPositionalAll(job.io, buf, 0);
    const content = buf[0..n];

    const issues = try pipeline.lintFile(arena, path, content, job.settings);

    // `{"s":[strings],"i":[line,column,ruleId,message,severity,help, ...]}`:
    // each issue is six numbers, the strings indexes into `s` (help -1 when
    // there is none, severity 0 error / 1 warning). Rule ids, messages and
    // help repeat across a file's issues; sending each once keeps a run with
    // tens of thousands of issues from being mostly JSON.
    var table: Strings = .{ .index = std.StringHashMap(u32).init(arena) };
    var numbers: std.ArrayList(u8) = .empty;
    for (issues, 0..) |issue, k| {
        if (k > 0) try numbers.append(arena, ',');
        const rule = try table.intern(arena, issue.rule_id);
        const message = try table.intern(arena, issue.message);
        const help: i64 = if (issue.help) |h| try table.intern(arena, h) else -1;
        try numbers.print(arena, "{d},{d},{d},{d},{d},{d}", .{
            issue.line,
            issue.column,
            rule,
            message,
            @as(u8, if (issue.severity == .@"error") 0 else 1),
            help,
        });
    }
    var json: std.ArrayList(u8) = .empty;
    try json.appendSlice(arena, "{\"s\":[");
    for (table.list.items, 0..) |str, k| {
        if (k > 0) try json.append(arena, ',');
        try appendString(&json, arena, str);
    }
    try json.appendSlice(arena, "],\"i\":[");
    try json.appendSlice(arena, numbers.items);
    try json.appendSlice(arena, "]}");
    return gpa.dupe(u8, json.items);
}

/// Strings numbered in the order they are first seen.
const Strings = struct {
    index: std.StringHashMap(u32),
    list: std.ArrayList([]const u8) = .empty,

    fn intern(self: *Strings, allocator: Allocator, s: []const u8) !u32 {
        const gop = try self.index.getOrPut(s);
        if (!gop.found_existing) {
            gop.value_ptr.* = @intCast(self.list.items.len);
            try self.list.append(allocator, s);
        }
        return gop.value_ptr.*;
    }
};

/// A JSON string literal; only what JSON requires is escaped.
fn appendString(out: *std.ArrayList(u8), allocator: Allocator, s: []const u8) !void {
    try out.append(allocator, '"');
    for (s) |c| {
        switch (c) {
            '"' => try out.appendSlice(allocator, "\\\""),
            '\\' => try out.appendSlice(allocator, "\\\\"),
            '\n' => try out.appendSlice(allocator, "\\n"),
            '\r' => try out.appendSlice(allocator, "\\r"),
            '\t' => try out.appendSlice(allocator, "\\t"),
            0...8, 11, 12, 14...0x1f => try out.print(allocator, "\\u{x:0>4}", .{c}),
            else => try out.append(allocator, c),
        }
    }
    try out.append(allocator, '"');
}

fn writeStderr(io: std.Io, msg: []const u8) void {
    var buf: [1024]u8 = undefined;
    var w = std.Io.File.stderr().writerStreaming(io, &buf);
    w.interface.writeAll(msg) catch {};
    w.interface.flush() catch {};
}
