const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const zig_config_dep = b.dependency("zig-config", .{
        .target = target,
        .optimize = optimize,
    });

    // Create main module
    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .strip = if (isDebug(optimize)) null else true,
        .imports = &.{
            .{ .name = "zig-config", .module = zig_config_dep.module("zig_config") },
        },
    });

    // Create executable
    const exe = b.addExecutable(.{
        .name = "pickier-zig",
        .root_module = exe_mod,
    });

    b.installArtifact(exe);

    // Run step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    // `zig build run -- <args>`: Zig 0.17 replaced `b.args` with addPassthruArgs()
    if (comptime @hasField(std.Build, "args")) {
        if (b.args) |args| run_cmd.addArgs(args);
    } else {
        run_cmd.addPassthruArgs();
    }

    const run_step = b.step("run", "Run pickier-zig");
    run_step.dependOn(&run_cmd.step);

    // Tests - format.zig (includes json_sort.zig via import)
    const format_test_mod = b.createModule(.{
        .root_source_file = b.path("src/format.zig"),
        .target = target,
        .optimize = optimize,
    });
    const format_tests = b.addTest(.{ .root_module = format_test_mod });
    const run_format_tests = b.addRunArtifact(format_tests);

    // Tests - json_sort.zig (has its own tests)
    const json_sort_test_mod = b.createModule(.{
        .root_source_file = b.path("src/json_sort.zig"),
        .target = target,
        .optimize = optimize,
    });
    const json_sort_tests = b.addTest(.{ .root_module = json_sort_test_mod });
    const run_json_sort_tests = b.addRunArtifact(json_sort_tests);

    // Tests - config.zig
    const config_test_mod = b.createModule(.{
        .root_source_file = b.path("src/config.zig"),
        .target = target,
        .optimize = optimize,
    });
    const config_tests = b.addTest(.{ .root_module = config_test_mod });
    const run_config_tests = b.addRunArtifact(config_tests);

    // Tests - walker.zig
    const walker_test_mod = b.createModule(.{
        .root_source_file = b.path("src/walker.zig"),
        .target = target,
        .optimize = optimize,
    });
    const walker_tests = b.addTest(.{ .root_module = walker_test_mod });
    const run_walker_tests = b.addRunArtifact(walker_tests);

    // Tests - scanner.zig
    const scanner_test_mod = b.createModule(.{
        .root_source_file = b.path("src/scanner.zig"),
        .target = target,
        .optimize = optimize,
    });
    const scanner_tests = b.addTest(.{ .root_module = scanner_test_mod });
    const run_scanner_tests = b.addRunArtifact(scanner_tests);

    // Tests - directives.zig
    const directives_test_mod = b.createModule(.{
        .root_source_file = b.path("src/directives.zig"),
        .target = target,
        .optimize = optimize,
    });
    const directives_tests = b.addTest(.{ .root_module = directives_test_mod });
    const run_directives_tests = b.addRunArtifact(directives_tests);

    // Tests - rules.zig
    const rules_test_mod = b.createModule(.{
        .root_source_file = b.path("src/rules.zig"),
        .target = target,
        .optimize = optimize,
    });
    const rules_tests = b.addTest(.{ .root_module = rules_test_mod });
    const run_rules_tests = b.addRunArtifact(rules_tests);

    // Tests - markdown_rules.zig
    const markdown_rules_test_mod = b.createModule(.{
        .root_source_file = b.path("src/markdown_rules.zig"),
        .target = target,
        .optimize = optimize,
    });
    const markdown_rules_tests = b.addTest(.{ .root_module = markdown_rules_test_mod });
    const run_markdown_rules_tests = b.addRunArtifact(markdown_rules_tests);

    // Tests - lockfile_rules.zig
    const lockfile_rules_test_mod = b.createModule(.{
        .root_source_file = b.path("src/lockfile_rules.zig"),
        .target = target,
        .optimize = optimize,
    });
    const lockfile_rules_tests = b.addTest(.{ .root_module = lockfile_rules_test_mod });
    const run_lockfile_rules_tests = b.addRunArtifact(lockfile_rules_tests);

    // Tests - the native lint engine (JavaScript string helpers, rule ports)
    const native_test_mod = b.createModule(.{
        .root_source_file = b.path("src/native/pc_test_root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const native_tests = b.addTest(.{ .root_module = native_test_mod });
    const run_native_tests = b.addRunArtifact(native_tests);
    const text_test_mod = b.createModule(.{
        .root_source_file = b.path("src/native/text.zig"),
        .target = target,
        .optimize = optimize,
    });
    const text_tests = b.addTest(.{ .root_module = text_test_mod });
    const run_text_tests = b.addRunArtifact(text_tests);

    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_native_tests.step);
    test_step.dependOn(&run_text_tests.step);
    test_step.dependOn(&run_format_tests.step);
    test_step.dependOn(&run_json_sort_tests.step);
    test_step.dependOn(&run_config_tests.step);
    test_step.dependOn(&run_walker_tests.step);
    test_step.dependOn(&run_scanner_tests.step);
    test_step.dependOn(&run_directives_tests.step);
    test_step.dependOn(&run_rules_tests.step);
    test_step.dependOn(&run_markdown_rules_tests.step);
    test_step.dependOn(&run_lockfile_rules_tests.step);
}

/// Zig 0.17 renamed the optimize modes (`.Debug` -> `.debug`); the old names
/// are only deprecated aliases there, so compare against whichever field exists.
fn isDebug(optimize: anytype) bool {
    const Mode = @TypeOf(optimize);
    return optimize == @field(Mode, if (@hasField(Mode, "debug")) "debug" else "Debug");
}
