const std = @import("std");
const Allocator = std.mem.Allocator;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Try to sort a known JSON file (package.json or tsconfig.json).
/// Returns sorted JSON string if applicable, or null if not a known JSON file.
pub fn trySortKnownJson(input: []const u8, file_path: []const u8, allocator: Allocator) !?[]u8 {
    if (isPackageJson(file_path)) {
        return try sortPackageJson(input, allocator);
    }
    if (isTsconfigJson(file_path)) {
        return try sortTsconfigJson(input, allocator);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Package.json sorting
// ---------------------------------------------------------------------------

/// Curated key order for package.json (matches TS format.ts:874-920)
const package_json_order = [_][]const u8{
    "publisher",
    "name",
    "displayName",
    "type",
    "version",
    "private",
    "packageManager",
    "description",
    "author",
    "contributors",
    "license",
    "funding",
    "homepage",
    "repository",
    "bugs",
    "keywords",
    "categories",
    "sideEffects",
    "imports",
    "exports",
    "main",
    "module",
    "unpkg",
    "jsdelivr",
    "types",
    "typesVersions",
    "bin",
    "icon",
    "files",
    "engines",
    "activationEvents",
    "contributes",
    "scripts",
    "peerDependencies",
    "peerDependenciesMeta",
    "dependencies",
    "optionalDependencies",
    "devDependencies",
    "pnpm",
    "overrides",
    "resolutions",
    "husky",
    "simple-git-hooks",
    "lint-staged",
    "eslintConfig",
};

const exports_sub_order = [_][]const u8{ "types", "import", "require", "default" };
const hook_order = [_][]const u8{
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-rewrite",
    "post-checkout",
    "post-merge",
    "pre-push",
    "pre-auto-gc",
};
const hook_containers = [_][]const u8{ "gitHooks", "husky", "simple-git-hooks" };

fn sortPackageJson(input: []const u8, allocator: Allocator) !?[]u8 {
    const parsed = std.json.parseFromSlice(std.json.Value, allocator, input, .{
        .allocate = .alloc_always,
    }) catch return null;
    defer parsed.deinit();

    var root = parsed.value;
    if (root != .object) return null;

    var arena_state = std.heap.ArenaAllocator.init(allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    // Sort top-level keys
    var sorted = try sortObjectKeys(&root.object, &package_json_order, arena);

    // Sort "files" array alphabetically
    if (sorted.getPtr("files")) |files_ptr| {
        if (files_ptr.* == .array) {
            sortStringArray(&files_ptr.array);
        }
    }

    // Sort dependency blocks alphabetically
    var iter = sorted.iterator();
    while (iter.next()) |entry| {
        if (isDepsKey(entry.key_ptr.*)) {
            if (entry.value_ptr.* == .object) {
                entry.value_ptr.* = .{ .object = try sortObjectKeysAlpha(&entry.value_ptr.object, arena) };
            }
        }
    }

    // Sort pnpm.overrides
    if (sorted.get("pnpm")) |pnpm_val| {
        if (pnpm_val == .object) {
            if (pnpm_val.object.getPtr("overrides")) |overrides| {
                if (overrides.* == .object) {
                    overrides.* = .{ .object = try sortObjectKeysAlpha(&overrides.object, arena) };
                }
            }
        }
    }

    // Sort exports sub-keys
    if (sorted.getPtr("exports")) |exports_val| {
        if (exports_val.* == .object) {
            var exp_iter = exports_val.object.iterator();
            while (exp_iter.next()) |exp_entry| {
                if (exp_entry.value_ptr.* == .object) {
                    exp_entry.value_ptr.* = .{ .object = try sortObjectKeys(&exp_entry.value_ptr.object, &exports_sub_order, arena) };
                }
            }
        }
    }

    // Sort git hooks containers
    for (hook_containers) |hk| {
        if (sorted.getPtr(hk)) |hk_val| {
            if (hk_val.* == .object) {
                hk_val.* = .{ .object = try sortObjectKeys(&hk_val.object, &hook_order, arena) };
            }
        }
    }

    return try jsonStringify(std.json.Value{ .object = sorted }, allocator);
}

// ---------------------------------------------------------------------------
// tsconfig.json sorting
// ---------------------------------------------------------------------------

const tsconfig_top_order = [_][]const u8{
    "extends",
    "compilerOptions",
    "references",
    "files",
    "include",
    "exclude",
};

const compiler_options_order = [_][]const u8{
    "incremental",         "composite",
    "tsBuildInfoFile",     "disableSourceOfProjectReferenceRedirect",
    "disableSolutionSearching", "disableReferencedProjectLoad",
    "target",              "jsx",
    "jsxFactory",          "jsxFragmentFactory",
    "jsxImportSource",     "lib",
    "moduleDetection",     "noLib",
    "reactNamespace",      "useDefineForClassFields",
    "emitDecoratorMetadata", "experimentalDecorators",
    "libReplacement",      "baseUrl",
    "rootDir",             "rootDirs",
    "customConditions",    "module",
    "moduleResolution",    "moduleSuffixes",
    "noResolve",           "paths",
    "resolveJsonModule",   "resolvePackageJsonExports",
    "resolvePackageJsonImports", "typeRoots",
    "types",               "allowArbitraryExtensions",
    "allowImportingTsExtensions", "allowUmdGlobalAccess",
    "allowJs",             "checkJs",
    "maxNodeModuleJsDepth", "strict",
    "strictBindCallApply", "strictFunctionTypes",
    "strictNullChecks",    "strictPropertyInitialization",
    "allowUnreachableCode", "allowUnusedLabels",
    "alwaysStrict",        "exactOptionalPropertyTypes",
    "noFallthroughCasesInSwitch", "noImplicitAny",
    "noImplicitOverride",  "noImplicitReturns",
    "noImplicitThis",      "noPropertyAccessFromIndexSignature",
    "noUncheckedIndexedAccess", "noUnusedLocals",
    "noUnusedParameters",  "useUnknownInCatchVariables",
    "declaration",         "declarationDir",
    "declarationMap",      "downlevelIteration",
    "emitBOM",             "emitDeclarationOnly",
    "importHelpers",       "importsNotUsedAsValues",
    "inlineSourceMap",     "inlineSources",
    "mapRoot",             "newLine",
    "noEmit",              "noEmitHelpers",
    "noEmitOnError",       "outDir",
    "outFile",             "preserveConstEnums",
    "preserveValueImports", "removeComments",
    "sourceMap",           "sourceRoot",
    "stripInternal",       "allowSyntheticDefaultImports",
    "esModuleInterop",     "forceConsistentCasingInFileNames",
    "isolatedDeclarations", "isolatedModules",
    "preserveSymlinks",    "verbatimModuleSyntax",
    "erasableSyntaxOnly",  "skipDefaultLibCheck",
    "skipLibCheck",
};

fn sortTsconfigJson(input: []const u8, allocator: Allocator) !?[]u8 {
    const parsed = std.json.parseFromSlice(std.json.Value, allocator, input, .{
        .allocate = .alloc_always,
    }) catch return null;
    defer parsed.deinit();

    var root = parsed.value;
    if (root != .object) return null;

    var arena_state = std.heap.ArenaAllocator.init(allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    var sorted = try sortObjectKeys(&root.object, &tsconfig_top_order, arena);

    // Sort compilerOptions
    if (sorted.getPtr("compilerOptions")) |co_val| {
        if (co_val.* == .object) {
            co_val.* = .{ .object = try sortObjectKeys(&co_val.object, &compiler_options_order, arena) };
        }
    }

    return try jsonStringify(std.json.Value{ .object = sorted }, allocator);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn isPackageJson(path: []const u8) bool {
    // Match /package.json or just "package.json"
    if (std.mem.endsWith(u8, path, "package.json")) {
        if (path.len == "package.json".len) return true;
        const before = path[path.len - "package.json".len - 1];
        return before == '/' or before == '\\';
    }
    return false;
}

fn isTsconfigJson(path: []const u8) bool {
    // Match tsconfig.json, jsconfig.json, tsconfig.*.json
    const basename = getBasename(path);
    if (std.mem.eql(u8, basename, "tsconfig.json") or std.mem.eql(u8, basename, "jsconfig.json")) return true;
    if ((std.mem.startsWith(u8, basename, "tsconfig.") or std.mem.startsWith(u8, basename, "jsconfig.")) and
        std.mem.endsWith(u8, basename, ".json"))
    {
        return true;
    }
    return false;
}

fn getBasename(path: []const u8) []const u8 {
    if (std.mem.lastIndexOfScalar(u8, path, '/')) |pos| {
        return path[pos + 1 ..];
    }
    if (std.mem.lastIndexOfScalar(u8, path, '\\')) |pos| {
        return path[pos + 1 ..];
    }
    return path;
}

fn isDepsKey(key: []const u8) bool {
    // Match: dependencies, devDependencies, peerDependencies, optionalDependencies,
    // bundledDependencies, peerDependenciesMeta, resolutions, overrides
    const deps_keys = [_][]const u8{
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
        "bundledDependencies",
        "peerDependenciesMeta",
        "resolutions",
        "overrides",
    };
    for (deps_keys) |dk| {
        if (std.mem.eql(u8, key, dk)) return true;
    }
    return false;
}

/// Sort an object's keys: ordered keys first, then remaining alphabetically
fn sortObjectKeys(obj: *const std.json.ObjectMap, order: []const []const u8, allocator: Allocator) !std.json.ObjectMap {
    var result = std.json.ObjectMap.init(allocator);

    // Place ordered keys first
    for (order) |key| {
        if (obj.get(key)) |val| {
            try result.put(try allocator.dupe(u8, key), try cloneJsonValue(val, allocator));
        }
    }

    // Collect remaining keys and sort them
    var remaining = std.ArrayList([]const u8){};
    var iter = obj.iterator();
    while (iter.next()) |entry| {
        var found = false;
        // Check if already placed
        if (result.get(entry.key_ptr.*) != null) {
            found = true;
        }
        if (!found) {
            try remaining.append(allocator, entry.key_ptr.*);
        }
    }

    // Sort remaining alphabetically
    std.mem.sort([]const u8, remaining.items, {}, struct {
        fn lessThan(_: void, a: []const u8, b: []const u8) bool {
            return std.mem.order(u8, a, b) == .lt;
        }
    }.lessThan);

    for (remaining.items) |key| {
        if (obj.get(key)) |val| {
            try result.put(try allocator.dupe(u8, key), try cloneJsonValue(val, allocator));
        }
    }

    return result;
}

/// Sort object keys alphabetically
fn sortObjectKeysAlpha(obj: *const std.json.ObjectMap, allocator: Allocator) !std.json.ObjectMap {
    var keys = std.ArrayList([]const u8){};
    var iter = obj.iterator();
    while (iter.next()) |entry| {
        try keys.append(allocator, entry.key_ptr.*);
    }

    std.mem.sort([]const u8, keys.items, {}, struct {
        fn lessThan(_: void, a: []const u8, b: []const u8) bool {
            return std.mem.order(u8, a, b) == .lt;
        }
    }.lessThan);

    var result = std.json.ObjectMap.init(allocator);
    for (keys.items) |key| {
        if (obj.get(key)) |val| {
            try result.put(try allocator.dupe(u8, key), try cloneJsonValue(val, allocator));
        }
    }
    return result;
}

/// Sort string array values alphabetically
fn sortStringArray(arr: *std.json.Array) void {
    // Check all are strings
    for (arr.items) |item| {
        if (item != .string) return;
    }
    std.mem.sort(std.json.Value, arr.items, {}, struct {
        fn lessThan(_: void, a: std.json.Value, b: std.json.Value) bool {
            return std.mem.order(u8, a.string, b.string) == .lt;
        }
    }.lessThan);
}

/// Deep clone a JSON value
fn cloneJsonValue(val: std.json.Value, allocator: Allocator) !std.json.Value {
    return switch (val) {
        .null => .null,
        .bool => |b| .{ .bool = b },
        .integer => |i| .{ .integer = i },
        .float => |f| .{ .float = f },
        .number_string => |s| .{ .number_string = try allocator.dupe(u8, s) },
        .string => |s| .{ .string = try allocator.dupe(u8, s) },
        .array => |arr| {
            var new_arr = std.json.Array.init(allocator);
            try new_arr.ensureTotalCapacity(arr.items.len);
            for (arr.items) |item| {
                try new_arr.append(try cloneJsonValue(item, allocator));
            }
            return .{ .array = new_arr };
        },
        .object => |obj| {
            var new_obj = std.json.ObjectMap.init(allocator);
            var iter = obj.iterator();
            while (iter.next()) |entry| {
                try new_obj.put(
                    try allocator.dupe(u8, entry.key_ptr.*),
                    try cloneJsonValue(entry.value_ptr.*, allocator),
                );
            }
            return .{ .object = new_obj };
        },
    };
}

/// Serialize JSON value to pretty-printed string (2-space indent, matching TS JSON.stringify(x, null, 2))
fn jsonStringify(value: std.json.Value, allocator: Allocator) ![]u8 {
    var buf = std.ArrayList(u8){};
    defer buf.deinit(allocator);
    try buf.ensureTotalCapacity(allocator, 4096);
    try writeJsonValue(value, &buf, allocator, 0);
    return try allocator.dupe(u8, buf.items);
}

fn writeJsonValue(value: std.json.Value, buf: *std.ArrayList(u8), allocator: Allocator, depth: usize) !void {
    switch (value) {
        .null => try buf.appendSlice(allocator, "null"),
        .bool => |b| try buf.appendSlice(allocator, if (b) "true" else "false"),
        .integer => |i| {
            var num_buf: [32]u8 = undefined;
            const slice = std.fmt.bufPrint(&num_buf, "{d}", .{i}) catch "0";
            try buf.appendSlice(allocator, slice);
        },
        .float => |f| {
            var num_buf: [64]u8 = undefined;
            const slice = std.fmt.bufPrint(&num_buf, "{d}", .{f}) catch "0";
            try buf.appendSlice(allocator, slice);
        },
        .number_string => |s| try buf.appendSlice(allocator, s),
        .string => |s| {
            try buf.append(allocator, '"');
            try writeJsonString(s, buf, allocator);
            try buf.append(allocator, '"');
        },
        .array => |arr| {
            if (arr.items.len == 0) {
                try buf.appendSlice(allocator, "[]");
                return;
            }
            try buf.appendSlice(allocator, "[\n");
            for (arr.items, 0..) |item, idx| {
                try writeIndent(buf, allocator, depth + 1);
                try writeJsonValue(item, buf, allocator, depth + 1);
                if (idx + 1 < arr.items.len) {
                    try buf.append(allocator, ',');
                }
                try buf.append(allocator, '\n');
            }
            try writeIndent(buf, allocator, depth);
            try buf.append(allocator, ']');
        },
        .object => |obj| {
            if (obj.count() == 0) {
                try buf.appendSlice(allocator, "{}");
                return;
            }
            try buf.appendSlice(allocator, "{\n");
            var iter = obj.iterator();
            var count: usize = 0;
            const total = obj.count();
            while (iter.next()) |entry| {
                try writeIndent(buf, allocator, depth + 1);
                try buf.append(allocator, '"');
                try writeJsonString(entry.key_ptr.*, buf, allocator);
                try buf.appendSlice(allocator, "\": ");
                try writeJsonValue(entry.value_ptr.*, buf, allocator, depth + 1);
                count += 1;
                if (count < total) {
                    try buf.append(allocator, ',');
                }
                try buf.append(allocator, '\n');
            }
            try writeIndent(buf, allocator, depth);
            try buf.append(allocator, '}');
        },
    }
}

fn writeIndent(buf: *std.ArrayList(u8), allocator: Allocator, depth: usize) !void {
    const spaces = depth * 2;
    var i: usize = 0;
    while (i < spaces) : (i += 1) {
        try buf.append(allocator, ' ');
    }
}

fn writeJsonString(s: []const u8, buf: *std.ArrayList(u8), allocator: Allocator) !void {
    for (s) |c| {
        switch (c) {
            '"' => try buf.appendSlice(allocator, "\\\""),
            '\\' => try buf.appendSlice(allocator, "\\\\"),
            '\n' => try buf.appendSlice(allocator, "\\n"),
            '\r' => try buf.appendSlice(allocator, "\\r"),
            '\t' => try buf.appendSlice(allocator, "\\t"),
            else => {
                if (c < 0x20) {
                    try buf.appendSlice(allocator, "\\u00");
                    const hi: u8 = c >> 4;
                    const lo: u8 = c & 0x0f;
                    try buf.append(allocator, if (hi < 10) '0' + hi else 'a' + hi - 10);
                    try buf.append(allocator, if (lo < 10) '0' + lo else 'a' + lo - 10);
                } else {
                    try buf.append(allocator, c);
                }
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "isPackageJson" {
    try std.testing.expect(isPackageJson("package.json"));
    try std.testing.expect(isPackageJson("/foo/bar/package.json"));
    try std.testing.expect(!isPackageJson("tsconfig.json"));
    try std.testing.expect(!isPackageJson("my-package.json"));
}

test "isTsconfigJson" {
    try std.testing.expect(isTsconfigJson("tsconfig.json"));
    try std.testing.expect(isTsconfigJson("jsconfig.json"));
    try std.testing.expect(isTsconfigJson("tsconfig.build.json"));
    try std.testing.expect(isTsconfigJson("jsconfig.app.json"));
    try std.testing.expect(!isTsconfigJson("package.json"));
}

test "sortPackageJson - basic key ordering" {
    const allocator = std.testing.allocator;
    const input =
        \\{"scripts":{"build":"tsc"},"name":"test","version":"1.0.0"}
    ;
    const result = try sortPackageJson(input, allocator) orelse return error.TestFailed;
    defer allocator.free(result);
    // "name" should come before "scripts" in output
    const name_pos = std.mem.indexOf(u8, result, "\"name\"") orelse return error.TestFailed;
    const scripts_pos = std.mem.indexOf(u8, result, "\"scripts\"") orelse return error.TestFailed;
    try std.testing.expect(name_pos < scripts_pos);
}

test "sortPackageJson - deps sorted alphabetically" {
    const allocator = std.testing.allocator;
    const input =
        \\{"dependencies":{"zlib":"1.0","axios":"2.0","bun":"3.0"}}
    ;
    const result = try sortPackageJson(input, allocator) orelse return error.TestFailed;
    defer allocator.free(result);
    const axios_pos = std.mem.indexOf(u8, result, "\"axios\"") orelse return error.TestFailed;
    const bun_pos = std.mem.indexOf(u8, result, "\"bun\"") orelse return error.TestFailed;
    const zlib_pos = std.mem.indexOf(u8, result, "\"zlib\"") orelse return error.TestFailed;
    try std.testing.expect(axios_pos < bun_pos);
    try std.testing.expect(bun_pos < zlib_pos);
}

test "sortTsconfigJson - basic key ordering" {
    const allocator = std.testing.allocator;
    const input =
        \\{"include":["src"],"compilerOptions":{"strict":true},"extends":"./base.json"}
    ;
    const result = try sortTsconfigJson(input, allocator) orelse return error.TestFailed;
    defer allocator.free(result);
    // "extends" should come before "compilerOptions" which should come before "include"
    const extends_pos = std.mem.indexOf(u8, result, "\"extends\"") orelse return error.TestFailed;
    const co_pos = std.mem.indexOf(u8, result, "\"compilerOptions\"") orelse return error.TestFailed;
    const include_pos = std.mem.indexOf(u8, result, "\"include\"") orelse return error.TestFailed;
    try std.testing.expect(extends_pos < co_pos);
    try std.testing.expect(co_pos < include_pos);
}

test "trySortKnownJson - returns null for non-json files" {
    const allocator = std.testing.allocator;
    const result = try trySortKnownJson("{}", "test.ts", allocator);
    try std.testing.expect(result == null);
}

test "trySortKnownJson - sorts package.json" {
    const allocator = std.testing.allocator;
    const input =
        \\{"version":"1.0","name":"test"}
    ;
    const result = try trySortKnownJson(input, "package.json", allocator) orelse return error.TestFailed;
    defer allocator.free(result);
    const name_pos = std.mem.indexOf(u8, result, "\"name\"") orelse return error.TestFailed;
    const version_pos = std.mem.indexOf(u8, result, "\"version\"") orelse return error.TestFailed;
    try std.testing.expect(name_pos < version_pos);
}
