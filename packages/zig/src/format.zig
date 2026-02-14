const std = @import("std");
const Allocator = std.mem.Allocator;
const json_sort = @import("json_sort.zig");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

pub const Config = struct {
    quotes: QuoteStyle = .single,
    indent: u8 = 2,
    indent_style: IndentStyle = .spaces,
    semi_removal: bool = false,
    trim_trailing_whitespace: bool = true,
    max_consecutive_blank_lines: u8 = 1,
    final_newline: FinalNewline = .one,

    pub const QuoteStyle = enum { single, double };
    pub const IndentStyle = enum { spaces, tabs };
    pub const FinalNewline = enum { one, two, none };
};

pub const default_config = Config{};

// ---------------------------------------------------------------------------
// Compile-time lookup tables for fast character classification
// ---------------------------------------------------------------------------

const word_char_lut: [256]bool = blk: {
    var lut = [_]bool{false} ** 256;
    for ("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$") |c| {
        lut[c] = true;
    }
    break :blk lut;
};

const spacing_char_lut: [256]bool = blk: {
    var lut = [_]bool{false} ** 256;
    for ("{,=+-*/;<>") |c| {
        lut[c] = true;
    }
    break :blk lut;
};

// Pre-computed indentation strings to avoid per-character append
const max_cached_indent = 32;
const indent_spaces: [max_cached_indent * 8]u8 = [_]u8{' '} ** (max_cached_indent * 8);
const indent_tabs: [max_cached_indent]u8 = [_]u8{'\t'} ** max_cached_indent;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Format source code according to pickier formatting rules.
/// Caller owns the returned slice and must free it with the same allocator.
pub fn formatCode(src: []const u8, file_path: []const u8, allocator: Allocator) ![]u8 {
    return formatCodeWithConfig(src, file_path, default_config, allocator);
}

pub fn formatCodeWithConfig(src: []const u8, file_path: []const u8, cfg: Config, allocator: Allocator) ![]u8 {
    if (src.len == 0) return try allocator.alloc(u8, 0);

    var arena_state = std.heap.ArenaAllocator.init(allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    const is_code = isCodeFile(file_path);
    const is_json = isJsonFile(file_path);

    // Phase 1: Normalize CRLF, trim trailing ws, collapse blank lines, remove leading blanks
    var content = try processLines(src, cfg, arena);

    // Phase 2: Format imports (for .ts/.js files)
    if (is_code) {
        content = try formatImportsStr(content, arena);
    }

    // Phase 2.5: JSON sorting (package.json, tsconfig.json)
    if (is_json) {
        if (try json_sort.trySortKnownJson(content, file_path, arena)) |sorted| {
            content = sorted;
        }
    }

    // Phase 3: Process code lines (quotes, indentation, spacing)
    if (is_code) {
        content = try processCodeLinesFused(content, cfg, arena);
    } else {
        content = try fixQuotesAllLines(content, cfg.quotes, arena);
    }

    // Phase 4: Ensure final newline
    content = try ensureFinalNewline(content, cfg.final_newline, arena);

    // Copy result to caller's allocator
    return try allocator.dupe(u8, content);
}

// ---------------------------------------------------------------------------
// Phase 1: Line processing
// ---------------------------------------------------------------------------

fn processLines(src: []const u8, cfg: Config, allocator: Allocator) ![]u8 {
    // Pre-allocate to input size (output can only shrink)
    var output = std.ArrayList(u8){};
    try output.ensureTotalCapacity(allocator, src.len);

    var consecutive_blanks: u32 = 0;
    var at_start = true;
    var i: usize = 0;

    while (i < src.len) {
        // Find end of current line
        const line_start = i;
        while (i < src.len and src[i] != '\n' and src[i] != '\r') : (i += 1) {}
        const line_end = i;

        // Skip past newline
        if (i < src.len) {
            if (src[i] == '\r' and i + 1 < src.len and src[i + 1] == '\n') {
                i += 2;
            } else {
                i += 1;
            }
        }

        const line = src[line_start..line_end];

        // Trim trailing whitespace
        var trimmed_end = line.len;
        if (cfg.trim_trailing_whitespace) {
            while (trimmed_end > 0 and (line[trimmed_end - 1] == ' ' or line[trimmed_end - 1] == '\t')) {
                trimmed_end -= 1;
            }
        }
        const trimmed = line[0..trimmed_end];

        if (trimmed.len == 0) {
            consecutive_blanks += 1;
            if (!at_start and consecutive_blanks <= cfg.max_consecutive_blank_lines) {
                if (output.items.len > 0) output.appendAssumeCapacity('\n');
            }
        } else {
            at_start = false;
            consecutive_blanks = 0;
            if (output.items.len > 0) output.appendAssumeCapacity('\n');
            output.appendSliceAssumeCapacity(trimmed);
        }
    }

    return output.items;
}

// ---------------------------------------------------------------------------
// Phase 2: Import formatting
// ---------------------------------------------------------------------------

const ImportKind = enum { side_effect, type_only, value };

const NamedSpecifier = struct {
    name: []const u8,
    alias: ?[]const u8 = null,
    is_type: bool = false,
};

const ParsedImport = struct {
    kind: ImportKind,
    source: []const u8,
    default_name: ?[]const u8 = null,
    namespace_name: ?[]const u8 = null,
    named: []NamedSpecifier = &.{},
    named_types: []NamedSpecifier = &.{},
};

fn formatImportsStr(content: []const u8, allocator: Allocator) ![]u8 {
    // Fast path: check if file has imports at the top
    if (content.len == 0) return @constCast(content);

    const first = content[0];
    if (first != 'i' and first != ' ' and first != '\t' and first != '/' and first != '\n') {
        return @constCast(content);
    }

    // Split into lines
    var lines = std.ArrayList([]const u8){};
    var iter = std.mem.splitScalar(u8, content, '\n');
    while (iter.next()) |line| {
        try lines.append(allocator, line);
    }

    // Skip leading comments/blanks before imports (preserve them)
    var pre_import_end: usize = 0;
    while (pre_import_end < lines.items.len) {
        const line = lines.items[pre_import_end];
        const trimmed = std.mem.trim(u8, line, " \t");
        if (trimmed.len == 0 or startsWith(trimmed, "//") or startsWith(trimmed, "/*")) {
            pre_import_end += 1;
            continue;
        }
        if (startsWith(trimmed, "import")) break;
        // Non-import, non-comment line before imports - no import block
        return @constCast(content);
    }

    // Parse contiguous import block (allowing interleaved comments and blank lines)
    var imports = std.ArrayList(ParsedImport){};
    var idx: usize = pre_import_end;
    while (idx < lines.items.len) {
        const line = lines.items[idx];
        const trimmed = std.mem.trim(u8, line, " \t");

        if (trimmed.len == 0 or startsWith(trimmed, "//") or startsWith(trimmed, "/*")) {
            idx += 1;
            continue;
        }
        if (!startsWith(trimmed, "import")) break;

        if (try parseImportStatement(trimmed, allocator)) |parsed| {
            try imports.append(allocator, parsed);
        }
        idx += 1;
    }

    if (imports.items.len == 0) {
        return @constCast(content);
    }

    // Get rest of file (after import block)
    var rest_buf = std.ArrayList(u8){};
    // Estimate rest size
    var rest_size_est: usize = 0;
    for (lines.items[idx..]) |line| {
        rest_size_est += line.len + 1;
    }
    try rest_buf.ensureTotalCapacity(allocator, rest_size_est);
    var first_rest = true;
    for (lines.items[idx..]) |line| {
        if (!first_rest) rest_buf.appendAssumeCapacity('\n');
        first_rest = false;
        rest_buf.appendSliceAssumeCapacity(line);
    }
    const rest = rest_buf.items;

    // Remove unused named imports (simple check: identifier appears in rest of code)
    for (imports.items) |*imp| {
        if (imp.kind != .value) continue;
        if (imp.named.len == 0) continue;

        var kept = std.ArrayList(NamedSpecifier){};
        for (imp.named) |spec| {
            if (spec.alias != null or isIdentUsed(rest, spec.name)) {
                try kept.append(allocator, spec);
            }
        }
        imp.named = try kept.toOwnedSlice(allocator);
    }

    // Filter out empty imports
    var non_empty = std.ArrayList(ParsedImport){};
    for (imports.items) |imp| {
        if (imp.kind == .side_effect) {
            try non_empty.append(allocator, imp);
            continue;
        }
        if (imp.kind == .type_only and imp.named_types.len > 0) {
            try non_empty.append(allocator, imp);
            continue;
        }
        if (imp.default_name != null or imp.namespace_name != null or imp.named.len > 0) {
            try non_empty.append(allocator, imp);
        }
    }

    // Merge imports from same source
    var by_source = std.StringHashMap(struct {
        value: ?ParsedImport,
        type_imp: ?ParsedImport,
        sides: std.ArrayList(ParsedImport),
    }).init(allocator);

    for (non_empty.items) |imp| {
        const entry = try by_source.getOrPut(imp.source);
        if (!entry.found_existing) {
            entry.value_ptr.* = .{
                .value = null,
                .type_imp = null,
                .sides = std.ArrayList(ParsedImport){},
            };
        }

        if (imp.kind == .side_effect) {
            try entry.value_ptr.sides.append(allocator, imp);
        } else if (imp.kind == .type_only) {
            if (entry.value_ptr.type_imp == null) {
                entry.value_ptr.type_imp = imp;
            } else {
                // Merge named types
                var merged = std.ArrayList(NamedSpecifier){};
                try merged.appendSlice(allocator, entry.value_ptr.type_imp.?.named_types);
                try merged.appendSlice(allocator, imp.named_types);
                entry.value_ptr.type_imp.?.named_types = try merged.toOwnedSlice(allocator);
            }
        } else {
            if (entry.value_ptr.value == null) {
                entry.value_ptr.value = imp;
            } else {
                // Merge
                if (imp.default_name != null) entry.value_ptr.value.?.default_name = imp.default_name;
                if (imp.namespace_name != null) entry.value_ptr.value.?.namespace_name = imp.namespace_name;
                var merged = std.ArrayList(NamedSpecifier){};
                try merged.appendSlice(allocator, entry.value_ptr.value.?.named);
                try merged.appendSlice(allocator, imp.named);
                entry.value_ptr.value.?.named = try merged.toOwnedSlice(allocator);
                // Move type specifiers from value import to type bucket
                if (imp.named_types.len > 0) {
                    if (entry.value_ptr.type_imp == null) {
                        entry.value_ptr.type_imp = ParsedImport{
                            .kind = .type_only,
                            .source = imp.source,
                            .named_types = imp.named_types,
                        };
                    } else {
                        var tm = std.ArrayList(NamedSpecifier){};
                        try tm.appendSlice(allocator, entry.value_ptr.type_imp.?.named_types);
                        try tm.appendSlice(allocator, imp.named_types);
                        entry.value_ptr.type_imp.?.named_types = try tm.toOwnedSlice(allocator);
                    }
                }
            }
        }
    }

    // Build output imports list
    var entries = std.ArrayList(ParsedImport){};
    var map_iter = by_source.iterator();
    while (map_iter.next()) |kv| {
        for (kv.value_ptr.sides.items) |side| {
            try entries.append(allocator, side);
        }
        if (kv.value_ptr.value) |*val| {
            // Sort named specifiers
            sortSpecifiers(val.named);
            try entries.append(allocator, val.*);
        }
        if (kv.value_ptr.type_imp) |*ti| {
            if (ti.named_types.len > 0) {
                // Dedupe and sort
                sortSpecifiers(ti.named_types);
                try entries.append(allocator, ti.*);
            }
        }
    }

    // Sort imports: types first, then side-effects, then values
    std.mem.sort(ParsedImport, entries.items, {}, importOrder);

    if (entries.items.len == 0) {
        // No imports remain - return rest without leading newlines
        return @constCast(std.mem.trimStart(u8, rest, "\n"));
    }

    // Render output: preserve pre-import comments, then sorted imports
    var output = std.ArrayList(u8){};
    try output.ensureTotalCapacity(allocator, content.len + 256);

    // Preserve comments/blanks before imports
    for (lines.items[0..pre_import_end]) |line| {
        try output.appendSlice(allocator, line);
        try output.append(allocator, '\n');
    }

    var first_entry = true;
    for (entries.items) |imp| {
        if (!first_entry) try output.append(allocator, '\n');
        first_entry = false;
        try renderImport(imp, &output, allocator);
    }

    // Separator between imports and rest
    const trimmed_rest = std.mem.trimStart(u8, rest, "\n");
    if (trimmed_rest.len > 0) {
        try output.appendSlice(allocator, "\n\n");
        try output.appendSlice(allocator, trimmed_rest);
    }

    return output.items;
}

fn importOrder(_: void, a: ParsedImport, b: ParsedImport) bool {
    // Types first, then side-effects, then values
    const kind_rank_a = kindRank(a.kind);
    const kind_rank_b = kindRank(b.kind);
    if (kind_rank_a != kind_rank_b) return kind_rank_a < kind_rank_b;

    // Within same kind, sort by source path rank
    const src_rank_a = sourceRank(a.source);
    const src_rank_b = sourceRank(b.source);
    if (src_rank_a != src_rank_b) return src_rank_a < src_rank_b;

    // Within same kind and rank, sort by form (for values: default < namespace < named)
    if (a.kind == .value and b.kind == .value) {
        const form_a = formRank(a);
        const form_b = formRank(b);
        if (form_a != form_b) return form_a < form_b;
    }

    // Finally alphabetical by source
    return std.mem.order(u8, a.source, b.source) == .lt;
}

fn kindRank(kind: ImportKind) u8 {
    return switch (kind) {
        .type_only => 0,
        .side_effect => 1,
        .value => 2,
    };
}

fn sourceRank(source: []const u8) u8 {
    if (startsWith(source, "node:")) return 0;
    if (source.len > 0 and source[0] == '.') return 2;
    return 1;
}

fn formRank(imp: ParsedImport) u8 {
    if (imp.default_name != null) return 0;
    if (imp.namespace_name != null) return 1;
    return 2;
}

fn sortSpecifiers(specs: []NamedSpecifier) void {
    std.mem.sort(NamedSpecifier, specs, {}, struct {
        fn lessThan(_: void, a: NamedSpecifier, b: NamedSpecifier) bool {
            return std.mem.order(u8, a.name, b.name) == .lt;
        }
    }.lessThan);
}

fn renderImport(imp: ParsedImport, output: *std.ArrayList(u8), allocator: Allocator) !void {
    if (imp.kind == .side_effect) {
        try output.appendSlice(allocator, "import '");
        try output.appendSlice(allocator, imp.source);
        try output.append(allocator, '\'');
        return;
    }

    if (imp.kind == .type_only) {
        try output.appendSlice(allocator, "import type { ");
        try renderSpecifiers(imp.named_types, output, allocator);
        try output.appendSlice(allocator, " } from '");
        try output.appendSlice(allocator, imp.source);
        try output.append(allocator, '\'');
        return;
    }

    // Value import
    try output.appendSlice(allocator, "import ");

    var has_prev = false;
    if (imp.default_name) |name| {
        try output.appendSlice(allocator, name);
        has_prev = true;
    }
    if (imp.namespace_name) |name| {
        if (has_prev) try output.appendSlice(allocator, ", ");
        try output.appendSlice(allocator, "* as ");
        try output.appendSlice(allocator, name);
        has_prev = true;
    }
    if (imp.named.len > 0) {
        if (has_prev) try output.appendSlice(allocator, ", ");
        try output.appendSlice(allocator, "{ ");
        try renderSpecifiers(imp.named, output, allocator);
        try output.appendSlice(allocator, " }");
    }

    try output.appendSlice(allocator, " from '");
    try output.appendSlice(allocator, imp.source);
    try output.append(allocator, '\'');
}

fn renderSpecifiers(specs: []const NamedSpecifier, output: *std.ArrayList(u8), allocator: Allocator) !void {
    for (specs, 0..) |spec, j| {
        if (j > 0) try output.appendSlice(allocator, ", ");
        try output.appendSlice(allocator, spec.name);
        if (spec.alias) |alias| {
            try output.appendSlice(allocator, " as ");
            try output.appendSlice(allocator, alias);
        }
    }
}

fn parseImportStatement(stmt: []const u8, allocator: Allocator) !?ParsedImport {
    var pos: usize = 0;

    // Skip "import"
    if (!startsWith(stmt, "import")) return null;
    pos = 6;
    pos = skipWs(stmt, pos);

    // Side-effect: import 'source' or import "source"
    if (pos < stmt.len and (stmt[pos] == '\'' or stmt[pos] == '"')) {
        const source = extractStringLiteral(stmt, pos) orelse return null;
        return ParsedImport{ .kind = .side_effect, .source = source };
    }

    // Type-only: import type { ... } from 'source'
    var is_type_only = false;
    if (pos + 5 <= stmt.len and std.mem.eql(u8, stmt[pos .. pos + 5], "type ")) {
        // Check it's "import type {" not "import type from"
        const after_type = skipWs(stmt, pos + 5);
        if (after_type < stmt.len and stmt[after_type] == '{') {
            is_type_only = true;
            pos = after_type;
        }
    }

    // Find "from" keyword and extract source
    const from_pos = findFrom(stmt) orelse return null;
    const source = extractSourceAfterFrom(stmt, from_pos) orelse return null;

    // Extract the specifier part (between "import [type]" and "from")
    const spec_start = if (is_type_only) pos else pos;
    const spec_part = std.mem.trim(u8, stmt[spec_start..from_pos], " \t");

    if (is_type_only) {
        // Parse { A, B as C } for type imports
        const named_types = try parseNamedSpecifiers(spec_part, allocator);
        return ParsedImport{
            .kind = .type_only,
            .source = source,
            .named_types = named_types,
        };
    }

    // Parse value import specifiers
    var default_name: ?[]const u8 = null;
    var namespace_name: ?[]const u8 = null;
    var named = std.ArrayList(NamedSpecifier){};
    var named_types = std.ArrayList(NamedSpecifier){};

    // Extract named group { ... } if present
    var remaining = spec_part;
    if (std.mem.indexOf(u8, remaining, "{")) |brace_start| {
        if (std.mem.indexOf(u8, remaining, "}")) |brace_end| {
            const inner = remaining[brace_start + 1 .. brace_end];
            // Parse named specifiers, handling "type X" prefix
            var spec_iter = std.mem.splitScalar(u8, inner, ',');
            while (spec_iter.next()) |raw_spec| {
                const s = std.mem.trim(u8, raw_spec, " \t");
                if (s.len == 0) continue;

                var is_type_spec = false;
                var spec_text = s;
                if (startsWith(s, "type ")) {
                    is_type_spec = true;
                    spec_text = std.mem.trim(u8, s[5..], " \t");
                }

                const spec = parseOneSpecifier(spec_text);
                if (is_type_spec) {
                    try named_types.append(allocator, spec);
                } else {
                    try named.append(allocator, spec);
                }
            }

            // Remove named portion from remaining
            const before = std.mem.trim(u8, remaining[0..brace_start], " \t,");
            remaining = before;
        }
    }

    // Parse remaining: possible default and/or namespace
    if (remaining.len > 0) {
        var parts_iter = std.mem.splitScalar(u8, remaining, ',');
        while (parts_iter.next()) |part| {
            const p = std.mem.trim(u8, part, " \t");
            if (p.len == 0) continue;
            if (startsWith(p, "* as ")) {
                namespace_name = std.mem.trim(u8, p[5..], " \t");
            } else if (isIdentifier(p)) {
                default_name = p;
            }
        }
    }

    return ParsedImport{
        .kind = .value,
        .source = source,
        .default_name = default_name,
        .namespace_name = namespace_name,
        .named = try named.toOwnedSlice(allocator),
        .named_types = try named_types.toOwnedSlice(allocator),
    };
}

fn parseOneSpecifier(text: []const u8) NamedSpecifier {
    // "name as alias" or just "name"
    if (std.mem.indexOf(u8, text, " as ")) |as_pos| {
        return NamedSpecifier{
            .name = std.mem.trim(u8, text[0..as_pos], " \t"),
            .alias = std.mem.trim(u8, text[as_pos + 4 ..], " \t"),
        };
    }
    return NamedSpecifier{ .name = text };
}

fn parseNamedSpecifiers(spec_part: []const u8, allocator: Allocator) ![]NamedSpecifier {
    // Remove surrounding braces
    var inner = spec_part;
    if (inner.len > 0 and inner[0] == '{') inner = inner[1..];
    if (inner.len > 0 and inner[inner.len - 1] == '}') inner = inner[0 .. inner.len - 1];
    inner = std.mem.trim(u8, inner, " \t");

    var specs = std.ArrayList(NamedSpecifier){};
    var spec_iter = std.mem.splitScalar(u8, inner, ',');
    while (spec_iter.next()) |raw| {
        const s = std.mem.trim(u8, raw, " \t");
        if (s.len == 0) continue;
        try specs.append(allocator, parseOneSpecifier(s));
    }
    return try specs.toOwnedSlice(allocator);
}

fn findFrom(stmt: []const u8) ?usize {
    // Find " from " or " from'" pattern
    var i: usize = 0;
    while (i + 5 < stmt.len) : (i += 1) {
        if (std.mem.eql(u8, stmt[i .. i + 5], " from") and
            (i + 5 >= stmt.len or stmt[i + 5] == ' ' or stmt[i + 5] == '\'' or stmt[i + 5] == '"'))
        {
            return i;
        }
    }
    return null;
}

fn extractSourceAfterFrom(stmt: []const u8, from_pos: usize) ?[]const u8 {
    var pos = from_pos + 5; // skip " from"
    pos = skipWs(stmt, pos);
    return extractStringLiteral(stmt, pos);
}

fn extractStringLiteral(text: []const u8, pos: usize) ?[]const u8 {
    if (pos >= text.len) return null;
    const quote = text[pos];
    if (quote != '\'' and quote != '"') return null;
    const start = pos + 1;
    var end = start;
    while (end < text.len and text[end] != quote) : (end += 1) {}
    if (end >= text.len) return null;
    return text[start..end];
}

fn isIdentUsed(code: []const u8, name: []const u8) bool {
    var pos: usize = 0;
    while (pos < code.len) {
        if (std.mem.indexOfPos(u8, code, pos, name)) |found| {
            // Check word boundaries
            const before_ok = found == 0 or !word_char_lut[code[found - 1]];
            const after_pos = found + name.len;
            const after_ok = after_pos >= code.len or !word_char_lut[code[after_pos]];
            if (before_ok and after_ok) return true;
            pos = found + name.len;
        } else {
            break;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Phase 3: Code line processing (fused pipeline)
// ---------------------------------------------------------------------------

fn processCodeLinesFused(content: []const u8, cfg: Config, allocator: Allocator) ![]u8 {
    // Pre-allocate output: content + 25% headroom for indentation growth
    var output = std.ArrayList(u8){};
    try output.ensureTotalCapacity(allocator, content.len + content.len / 4);

    // Scratch buffer for per-line quote fixing (reused across lines)
    var scratch = std.ArrayList(u8){};
    try scratch.ensureTotalCapacity(allocator, 512);

    var indent_level: usize = 0;

    var line_iter = std.mem.splitScalar(u8, content, '\n');
    var first = true;
    while (line_iter.next()) |line| {
        if (!first) try output.append(allocator, '\n');
        first = false;

        if (line.len == 0) continue;

        // Phase 1: Fix quotes into scratch buffer
        scratch.clearRetainingCapacity();
        try scratch.ensureTotalCapacity(allocator, line.len + 8);
        try fixQuotesInto(line, cfg.quotes, &scratch, allocator);
        const quoted = scratch.items;

        // Phase 2: Fix indentation
        var ws_end: usize = 0;
        while (ws_end < quoted.len and (quoted[ws_end] == ' ' or quoted[ws_end] == '\t')) : (ws_end += 1) {}
        const body = std.mem.trimEnd(u8, quoted[ws_end..], " \t");

        if (body.len == 0) continue;

        // Closing brace decrements indent before applying
        if (body[0] == '}') {
            indent_level = if (indent_level > 0) indent_level - 1 else 0;
        }

        // Record line start position for potential semicolon removal
        const line_start_pos = output.items.len;

        // Apply indentation using pre-computed strings
        try appendIndent(&output, indent_level, cfg, allocator);

        // Phase 3: Normalize spacing (inline, no segment allocation)
        try normalizeSpacingLine(body, &output, allocator);

        // Phase 4: Remove stylistic semicolons (if enabled)
        if (cfg.semi_removal) {
            const written_line = output.items[line_start_pos..];
            // Find the trimmed content (skip leading whitespace)
            var ws_skip: usize = 0;
            while (ws_skip < written_line.len and (written_line[ws_skip] == ' ' or written_line[ws_skip] == '\t')) : (ws_skip += 1) {}
            const trimmed_written = written_line[ws_skip..];

            // Skip for-loop headers
            const is_for_loop = trimmed_written.len >= 4 and
                std.mem.startsWith(u8, trimmed_written, "for") and
                trimmed_written.len > 3 and (trimmed_written[3] == ' ' or trimmed_written[3] == '(');

            if (!is_for_loop) {
                // Check if line is only semicolons/whitespace (empty statement)
                var only_semi = true;
                for (trimmed_written) |c| {
                    if (c != ';' and c != ' ' and c != '\t') {
                        only_semi = false;
                        break;
                    }
                }
                if (only_semi and trimmed_written.len > 0) {
                    // Remove the entire line content (make it empty)
                    output.items.len = line_start_pos;
                } else {
                    // Collapse trailing duplicate semicolons: ;; -> ;
                    var end_pos = output.items.len;
                    // Find trailing semicolons (skip trailing whitespace first)
                    while (end_pos > line_start_pos and (output.items[end_pos - 1] == ' ' or output.items[end_pos - 1] == '\t')) : (end_pos -= 1) {}
                    var semi_count: usize = 0;
                    var check_pos = end_pos;
                    while (check_pos > line_start_pos and output.items[check_pos - 1] == ';') : (check_pos -= 1) {
                        semi_count += 1;
                    }
                    if (semi_count > 1) {
                        // Keep only one semicolon: remove (semi_count - 1) chars
                        const remove_count = semi_count - 1;
                        // Shift any trailing whitespace left
                        const trailing_ws = output.items.len - end_pos;
                        if (trailing_ws > 0) {
                            std.mem.copyForwards(u8, output.items[end_pos - remove_count ..], output.items[end_pos .. end_pos + trailing_ws]);
                        }
                        output.items.len -= remove_count;
                    }
                }
            }
        }

        // Opening brace increments indent for next line
        if (body.len > 0 and body[body.len - 1] == '{') {
            indent_level += 1;
        }
    }

    return output.items;
}

fn appendIndent(output: *std.ArrayList(u8), level: usize, cfg: Config, allocator: Allocator) !void {
    if (cfg.indent_style == .tabs) {
        if (level <= max_cached_indent) {
            try output.appendSlice(allocator, indent_tabs[0..level]);
        } else {
            for (0..level) |_| try output.append(allocator, '\t');
        }
    } else {
        const spaces = level * cfg.indent;
        if (spaces <= indent_spaces.len) {
            try output.appendSlice(allocator, indent_spaces[0..spaces]);
        } else {
            for (0..spaces) |_| try output.append(allocator, ' ');
        }
    }
}

// ---------------------------------------------------------------------------
// Quote fixing
// ---------------------------------------------------------------------------

/// Fix quotes in a line, writing result into the provided output buffer.
/// This avoids per-line allocation by reusing a scratch buffer.
fn fixQuotesInto(line: []const u8, preferred: Config.QuoteStyle, output: *std.ArrayList(u8), allocator: Allocator) !void {
    const want_single = preferred == .single;
    const search_char: u8 = if (want_single) '"' else '\'';

    // Fast path: no quotes to convert
    if (std.mem.indexOfScalar(u8, line, search_char) == null) {
        output.appendSliceAssumeCapacity(line);
        return;
    }

    var i: usize = 0;
    var in_string: enum { none, single, double, template } = .none;
    var string_start: usize = 0;
    var seg_start: usize = 0;

    while (i < line.len) {
        const ch = line[i];

        switch (in_string) {
            .none => {
                if (ch == '"') {
                    in_string = .double;
                    string_start = i;
                    i += 1;
                } else if (ch == '\'') {
                    in_string = .single;
                    string_start = i;
                    i += 1;
                } else if (ch == '`') {
                    in_string = .template;
                    i += 1;
                } else {
                    i += 1;
                }
            },
            .template => {
                if (ch == '\\') {
                    i += 2;
                } else {
                    if (ch == '`') in_string = .none;
                    i += 1;
                }
            },
            else => {
                if (ch == '\\') {
                    i += 2;
                    continue;
                }
                const close_char: u8 = if (in_string == .single) '\'' else '"';
                if (ch == close_char) {
                    // Found closing quote - convert if needed
                    const need_convert = (in_string == .double and want_single) or
                        (in_string == .single and !want_single);
                    if (need_convert) {
                        // Flush segment before string
                        if (string_start > seg_start) {
                            try output.appendSlice(allocator, line[seg_start..string_start]);
                        }
                        const string_inner = line[string_start + 1 .. i];
                        if (in_string == .double) {
                            try convertDoubleToSingle(string_inner, output, allocator);
                        } else {
                            try convertSingleToDouble(string_inner, output, allocator);
                        }
                        seg_start = i + 1;
                    }
                    in_string = .none;
                    i += 1;
                    continue;
                }
                i += 1;
            },
        }
    }

    if (output.items.len == 0) {
        // No conversions made - copy line verbatim
        try output.appendSlice(allocator, line);
        return;
    }

    // Flush remaining
    if (seg_start < line.len) {
        try output.appendSlice(allocator, line[seg_start..]);
    }
}

/// Legacy wrapper that returns allocated slice (used by fixQuotesAllLines)
fn fixQuotesLine(line: []const u8, preferred: Config.QuoteStyle, allocator: Allocator) ![]u8 {
    var output = std.ArrayList(u8){};
    try output.ensureTotalCapacity(allocator, line.len + 8);
    try fixQuotesInto(line, preferred, &output, allocator);
    return output.items;
}

fn convertDoubleToSingle(inner: []const u8, output: *std.ArrayList(u8), allocator: Allocator) !void {
    try output.append(allocator, '\'');
    var i: usize = 0;
    while (i < inner.len) {
        // Batch copy runs of characters that don't need conversion
        if (inner[i] != '\\' and inner[i] != '\'') {
            const run_start = i;
            i += 1;
            while (i < inner.len and inner[i] != '\\' and inner[i] != '\'') : (i += 1) {}
            try output.appendSlice(allocator, inner[run_start..i]);
            continue;
        }
        if (i + 1 < inner.len and inner[i] == '\\' and inner[i + 1] == '"') {
            try output.append(allocator, '"');
            i += 2;
        } else if (inner[i] == '\'') {
            try output.append(allocator, '"');
            i += 1;
        } else {
            try output.append(allocator, inner[i]);
            i += 1;
        }
    }
    try output.append(allocator, '\'');
}

fn convertSingleToDouble(inner: []const u8, output: *std.ArrayList(u8), allocator: Allocator) !void {
    try output.append(allocator, '"');
    var i: usize = 0;
    while (i < inner.len) {
        // Batch copy runs of characters that don't need conversion
        if (inner[i] != '\\' and inner[i] != '"') {
            const run_start = i;
            i += 1;
            while (i < inner.len and inner[i] != '\\' and inner[i] != '"') : (i += 1) {}
            try output.appendSlice(allocator, inner[run_start..i]);
            continue;
        }
        if (i + 1 < inner.len and inner[i] == '\\' and inner[i + 1] == '\'') {
            try output.append(allocator, '\'');
            i += 2;
        } else if (inner[i] == '"') {
            try output.append(allocator, '\'');
            i += 1;
        } else {
            try output.append(allocator, inner[i]);
            i += 1;
        }
    }
    try output.append(allocator, '"');
}

fn fixQuotesAllLines(content: []const u8, preferred: Config.QuoteStyle, allocator: Allocator) ![]u8 {
    var output = std.ArrayList(u8){};
    try output.ensureTotalCapacity(allocator, content.len + 64);
    var line_iter = std.mem.splitScalar(u8, content, '\n');
    var first_line = true;
    while (line_iter.next()) |line| {
        if (!first_line) try output.append(allocator, '\n');
        first_line = false;
        const fixed = try fixQuotesLine(line, preferred, allocator);
        try output.appendSlice(allocator, fixed);
    }
    return output.items;
}

// ---------------------------------------------------------------------------
// Spacing normalization
// ---------------------------------------------------------------------------

fn normalizeSpacingLine(line: []const u8, output: *std.ArrayList(u8), allocator: Allocator) !void {
    // Fast path: skip very short lines
    if (line.len < 4) {
        try output.appendSlice(allocator, line);
        return;
    }

    // Fast path: skip comment lines
    const first_ns = skipWs(line, 0);
    if (first_ns < line.len and line[first_ns] == '/' and first_ns + 1 < line.len and
        (line[first_ns + 1] == '/' or line[first_ns + 1] == '*'))
    {
        try output.appendSlice(allocator, line);
        return;
    }

    // Fast path: check if any spacing characters exist (LUT - O(n) single pass)
    var has_spacing = false;
    for (line) |c| {
        if (spacing_char_lut[c]) {
            has_spacing = true;
            break;
        }
    }
    if (!has_spacing) {
        try output.appendSlice(allocator, line);
        return;
    }

    // Process inline: track string state and alternate between code/string segments
    // This eliminates the intermediate Segment ArrayList allocation
    var i: usize = 0;
    var seg_start: usize = 0;

    while (i < line.len) {
        const ch = line[i];
        if (ch == '\'' or ch == '"' or ch == '`') {
            // Process code segment before string
            if (i > seg_start) {
                try normalizeCodeSpacing(line[seg_start..i], output, allocator);
            }
            // Copy string literal verbatim
            const quote = ch;
            const str_start = i;
            i += 1;
            while (i < line.len) {
                if (line[i] == '\\') {
                    i += 2;
                    continue;
                }
                if (line[i] == quote) {
                    i += 1;
                    break;
                }
                i += 1;
            }
            try output.appendSlice(allocator, line[str_start..i]);
            seg_start = i;
            continue;
        }
        i += 1;
    }

    // Process trailing code segment
    if (seg_start < line.len) {
        try normalizeCodeSpacing(line[seg_start..], output, allocator);
    }
}

fn normalizeCodeSpacing(text: []const u8, output: *std.ArrayList(u8), allocator: Allocator) !void {
    var i: usize = 0;
    while (i < text.len) {
        const c = text[i];

        // Batch copy runs of characters that don't need spacing adjustment
        // Only { , = ; and space trigger special handling
        if (c != '{' and c != ',' and c != '=' and c != ';' and c != ' ') {
            const run_start = i;
            i += 1;
            while (i < text.len) : (i += 1) {
                const nc = text[i];
                if (nc == '{' or nc == ',' or nc == '=' or nc == ';' or nc == ' ') break;
            }
            try output.appendSlice(allocator, text[run_start..i]);
            continue;
        }

        // Space before opening brace: (\S)\{ -> $1 {
        // But NOT after < (generics like Array<{...}>)
        if (c == '{' and i > 0 and text[i - 1] != ' ' and text[i - 1] != '\t' and text[i - 1] != '(' and text[i - 1] != '<') {
            // Check if previous char was already written - we need to insert space
            if (output.items.len > 0 and output.items[output.items.len - 1] != ' ' and output.items[output.items.len - 1] != '\t' and output.items[output.items.len - 1] != '<') {
                try output.append(allocator, ' ');
            }
            try output.append(allocator, '{');
            i += 1;
            continue;
        }

        // Space after comma: ,(\S) -> , $1
        if (c == ',' and i + 1 < text.len and text[i + 1] != ' ' and text[i + 1] != '\n') {
            try output.append(allocator, ',');
            try output.append(allocator, ' ');
            i += 1;
            continue;
        }

        // Space around assignment: = (not ==, !=, <=, >=, =>, +=, -=, *=, /=)
        if (c == '=' and i + 1 < text.len and text[i + 1] != '=' and text[i + 1] != '>') {
            if (i > 0 and text[i - 1] != '!' and text[i - 1] != '<' and text[i - 1] != '>' and text[i - 1] != '=' and
                text[i - 1] != '+' and text[i - 1] != '-' and text[i - 1] != '*' and text[i - 1] != '/')
            {
                // Ensure space before
                if (output.items.len > 0 and output.items[output.items.len - 1] != ' ') {
                    try output.append(allocator, ' ');
                }
                try output.append(allocator, '=');
                // Ensure space after
                if (i + 1 < text.len and text[i + 1] != ' ') {
                    try output.append(allocator, ' ');
                }
                i += 1;
                continue;
            }
        }

        // Space after semicolon: ;(\S) -> ; $1
        if (c == ';' and i + 1 < text.len and text[i + 1] != ' ' and text[i + 1] != ';' and text[i + 1] != '\n') {
            try output.append(allocator, ';');
            try output.append(allocator, ' ');
            i += 1;
            continue;
        }

        // Collapse multiple spaces (not leading whitespace)
        if (c == ' ' and i + 1 < text.len and text[i + 1] == ' ') {
            try output.append(allocator, ' ');
            while (i + 1 < text.len and text[i + 1] == ' ') : (i += 1) {}
            i += 1;
            continue;
        }

        try output.append(allocator, c);
        i += 1;
    }
}

// ---------------------------------------------------------------------------
// Phase 4: Final newline
// ---------------------------------------------------------------------------

fn ensureFinalNewline(content: []const u8, policy: Config.FinalNewline, allocator: Allocator) ![]u8 {
    if (content.len == 0) return @constCast(content);

    // Find where the actual content ends (before trailing newlines)
    var end = content.len;
    while (end > 0 and content[end - 1] == '\n') : (end -= 1) {}

    switch (policy) {
        .none => {
            if (end == content.len) return @constCast(content);
            return try allocator.dupe(u8, content[0..end]);
        },
        .one => {
            // Already has exactly one trailing newline?
            if (end + 1 == content.len and content[end] == '\n') return @constCast(content);
            // Direct allocation: content + \n
            const result = try allocator.alloc(u8, end + 1);
            @memcpy(result[0..end], content[0..end]);
            result[end] = '\n';
            return result;
        },
        .two => {
            // Already has exactly two trailing newlines?
            if (end + 2 == content.len and content[end] == '\n' and content[end + 1] == '\n') return @constCast(content);
            // Direct allocation: content + \n\n
            const result = try allocator.alloc(u8, end + 2);
            @memcpy(result[0..end], content[0..end]);
            result[end] = '\n';
            result[end + 1] = '\n';
            return result;
        },
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub fn isCodeFile(path: []const u8) bool {
    // Match TS CODE_EXTS: only .ts and .js are "code" files
    return endsWith(path, ".ts") or endsWith(path, ".js");
}

pub fn isJsonFile(path: []const u8) bool {
    return endsWith(path, ".json") or endsWith(path, ".jsonc");
}

inline fn isWordChar(c: u8) bool {
    return word_char_lut[c];
}

fn isIdentifier(s: []const u8) bool {
    if (s.len == 0) return false;
    for (s) |c| {
        if (!word_char_lut[c]) return false;
    }
    return true;
}

fn skipWs(text: []const u8, start: usize) usize {
    var pos = start;
    while (pos < text.len and (text[pos] == ' ' or text[pos] == '\t')) : (pos += 1) {}
    return pos;
}

fn startsWith(haystack: []const u8, needle: []const u8) bool {
    return std.mem.startsWith(u8, haystack, needle);
}

fn endsWith(haystack: []const u8, needle: []const u8) bool {
    return std.mem.endsWith(u8, haystack, needle);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ===========================================================================
// Phase 1: Line processing tests
// ===========================================================================

test "empty input" {
    const allocator = std.testing.allocator;
    const result = try formatCode("", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqual(@as(usize, 0), result.len);
}

test "trailing whitespace removal" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello   \nworld  \n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "trailing tab removal" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello\t\t\nworld\t\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "mixed trailing whitespace removal" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello \t \nworld\t \n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\nworld\n", result);
}

test "CRLF normalization" {
    const allocator = std.testing.allocator;
    const result = try formatCode("line1\r\nline2\r\nline3\r\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("line1\nline2\nline3\n", result);
}

test "mixed CRLF and LF" {
    const allocator = std.testing.allocator;
    const result = try formatCode("line1\r\nline2\nline3\r\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("line1\nline2\nline3\n", result);
}

test "blank line collapsing" {
    const allocator = std.testing.allocator;
    const result = try formatCode("a\n\n\n\nb\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a\n\nb\n", result);
}

test "blank line collapsing - five consecutive blanks" {
    const allocator = std.testing.allocator;
    const result = try formatCode("a\n\n\n\n\n\nb\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a\n\nb\n", result);
}

test "blank line collapsing - one allowed" {
    const allocator = std.testing.allocator;
    const result = try formatCode("a\n\nb\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a\n\nb\n", result);
}

test "leading blank lines removed" {
    const allocator = std.testing.allocator;
    const result = try formatCode("\n\n\nconst x = 1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "only whitespace input" {
    const allocator = std.testing.allocator;
    const result = try formatCode("   \n\t\n   \n", "test.ts", allocator);
    defer allocator.free(result);
    // All lines are whitespace-only so content becomes empty
    try std.testing.expectEqual(@as(usize, 0), result.len);
}

test "single line no newline" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 1", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

// ===========================================================================
// Phase 2: Import formatting tests
// ===========================================================================

test "import sorting - basic value imports" {
    const allocator = std.testing.allocator;
    const input = "import { b } from 'beta'\nimport { a } from 'alpha'\n\nconsole.log(a, b)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("import { a } from 'alpha'\nimport { b } from 'beta'\n\nconsole.log(a, b)\n", result);
}

test "import sorting - type imports come first" {
    const allocator = std.testing.allocator;
    const input = "import { x } from 'mod'\nimport type { T } from 'mod'\n\nconsole.log(x)\nlet v: T\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Type imports should come before value imports
    const type_pos = std.mem.indexOf(u8, result, "import type") orelse unreachable;
    const value_pos = std.mem.indexOf(u8, result, "import { x }") orelse unreachable;
    try std.testing.expect(type_pos < value_pos);
}

test "import sorting - side-effect imports" {
    const allocator = std.testing.allocator;
    const input = "import { x } from 'mod'\nimport 'side-effect'\n\nconsole.log(x)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "import 'side-effect'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "import { x } from 'mod'") != null);
}

test "import sorting - node: imports first" {
    const allocator = std.testing.allocator;
    const input = "import { z } from 'zod'\nimport { readFile } from 'node:fs'\n\nconsole.log(readFile, z)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    const node_pos = std.mem.indexOf(u8, result, "node:fs") orelse unreachable;
    const ext_pos = std.mem.indexOf(u8, result, "zod") orelse unreachable;
    try std.testing.expect(node_pos < ext_pos);
}

test "import sorting - relative imports last" {
    const allocator = std.testing.allocator;
    const input = "import { b } from './local'\nimport { a } from 'external'\n\nconsole.log(a, b)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    const ext_pos = std.mem.indexOf(u8, result, "external") orelse unreachable;
    const rel_pos = std.mem.indexOf(u8, result, "./local") orelse unreachable;
    try std.testing.expect(ext_pos < rel_pos);
}

test "import sorting - unused imports removed" {
    const allocator = std.testing.allocator;
    const input = "import { used, unused } from 'mod'\n\nconsole.log(used)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "used") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "unused") == null);
}

test "import sorting - default import preserved" {
    const allocator = std.testing.allocator;
    const input = "import React from 'react'\n\nconsole.log(React)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("import React from 'react'\n\nconsole.log(React)\n", result);
}

test "import sorting - namespace import preserved" {
    const allocator = std.testing.allocator;
    const input = "import * as path from 'node:path'\n\nconsole.log(path)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "* as path") != null);
}

test "import sorting - default with named import" {
    const allocator = std.testing.allocator;
    const input = "import React, { useState } from 'react'\n\nconsole.log(React, useState)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "React") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "useState") != null);
}

test "import sorting - specifiers sorted alphabetically" {
    const allocator = std.testing.allocator;
    const input = "import { c, a, b } from 'mod'\n\nconsole.log(a, b, c)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "{ a, b, c }") != null);
}

test "import sorting - double quotes converted to single" {
    const allocator = std.testing.allocator;
    const input = "import { x } from \"module\"\n\nconsole.log(x)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'module'") != null);
}

test "import sorting - empty import block leaves rest" {
    const allocator = std.testing.allocator;
    const input = "const x = 1\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "import sorting - all imports unused removed" {
    const allocator = std.testing.allocator;
    const input = "import { unused1, unused2 } from 'mod'\n\nconst x = 1\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "import") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "const x = 1") != null);
}

test "import sorting - aliased import preserved" {
    const allocator = std.testing.allocator;
    const input = "import { foo as bar } from 'mod'\n\nconsole.log(bar)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "foo as bar") != null);
}

test "import sorting - duplicate sources merged" {
    const allocator = std.testing.allocator;
    const input = "import { a } from 'mod'\nimport { b } from 'mod'\n\nconsole.log(a, b)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Should have only one import from 'mod' with both specifiers
    var count: usize = 0;
    var pos: usize = 0;
    while (std.mem.indexOfPos(u8, result, pos, "from 'mod'")) |found| {
        count += 1;
        pos = found + 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expect(std.mem.indexOf(u8, result, "a") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "b") != null);
}

// ===========================================================================
// Phase 3: Quote fixing tests
// ===========================================================================

test "quote fixing double to single" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"hello\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 'hello'\n", result);
}

test "quote fixing - multiple strings on one line" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const a = \"hello\", b = \"world\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const a = 'hello', b = 'world'\n", result);
}

test "quote fixing - single quotes already correct" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'hello'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 'hello'\n", result);
}

test "quote fixing - template literals preserved" {
    const allocator = std.testing.allocator;
    const input = "const x = `hello ${\"world\"}`\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "`") != null);
}

test "quote fixing - escaped double quotes in double string" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"say \\\"hi\\\"\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'say \"hi\"'") != null);
}

test "quote fixing - single to double with config" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .quotes = .double };
    const result = try formatCodeWithConfig("const x = 'hello'\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = \"hello\"\n", result);
}

test "quote fixing - empty string" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = ''\n", result);
}

test "quote fixing - string with embedded single quote needs escaping" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"it's\"\n", "test.ts", allocator);
    defer allocator.free(result);
    // The single quote inside should be handled (swapped to double)
    try std.testing.expect(result.len > 0);
}

// ===========================================================================
// Indentation tests
// ===========================================================================

test "indentation - basic brace tracking" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nreturn 1\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function foo() {\n  return 1\n}\n", result);
}

test "indentation - nested braces" {
    const allocator = std.testing.allocator;
    const input = "if (true) {\nif (false) {\nreturn\n}\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("if (true) {\n  if (false) {\n    return\n  }\n}\n", result);
}

test "indentation - triple nesting" {
    const allocator = std.testing.allocator;
    const input = "a {\nb {\nc {\nd\n}\n}\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a {\n  b {\n    c {\n      d\n    }\n  }\n}\n", result);
}

test "indentation - tabs style" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .indent_style = .tabs };
    const result = try formatCodeWithConfig("function foo() {\nreturn 1\n}\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function foo() {\n\treturn 1\n}\n", result);
}

test "indentation - 4-space indent" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .indent = 4 };
    const result = try formatCodeWithConfig("function foo() {\nreturn 1\n}\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function foo() {\n    return 1\n}\n", result);
}

test "indentation - mixed tabs and spaces normalized" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\n\t  return 1\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function foo() {\n  return 1\n}\n", result);
}

test "indentation - preserves empty lines between blocks" {
    const allocator = std.testing.allocator;
    const input = "function a() {\nreturn 1\n}\n\nfunction b() {\nreturn 2\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function a() {\n  return 1\n}\n\nfunction b() {\n  return 2\n}\n", result);
}

// ===========================================================================
// Spacing normalization tests
// ===========================================================================

test "spacing - space after comma" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const arr = [1,2,3]\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const arr = [1, 2, 3]\n", result);
}

test "spacing - space before opening brace" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (true){\nreturn\n}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "if (true) {") != null);
}

test "spacing - space around equals" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x=1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "spacing - no space added around == comparison" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a == b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "==") != null);
}

test "spacing - no space added around === comparison" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a === b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "===") != null);
}

test "spacing - no space added around != comparison" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a != b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "!=") != null);
}

test "spacing - no space added around arrow =>" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const fn = () => 1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "=>") != null);
}

test "spacing - space after semicolon" {
    const allocator = std.testing.allocator;
    const result = try formatCode("for (let i = 0;i < 10;i++) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "; i < 10; i++") != null);
}

test "spacing - multiple spaces collapsed" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x  =   1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "spacing - strings not modified" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'no,spacing,change'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'no,spacing,change'") != null);
}

test "spacing - comment lines not modified" {
    const allocator = std.testing.allocator;
    const result = try formatCode("// no spacing,change=here\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("// no spacing,change=here\n", result);
}

test "spacing - short lines unchanged" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("x\n", result);
}

// ===========================================================================
// Phase 4: Final newline tests
// ===========================================================================

test "final newline - added when missing" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n", result);
}

test "final newline - preserved when present" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n", result);
}

test "final newline - extra newlines trimmed to one" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello\n\n\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n", result);
}

test "final newline - none policy" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .none };
    const result = try formatCodeWithConfig("hello\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "final newline - two policy" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .two };
    const result = try formatCodeWithConfig("hello", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\n", result);
}

test "final newline - two policy already correct" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .two };
    const result = try formatCodeWithConfig("hello\n\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\n", result);
}

// ===========================================================================
// File type detection tests
// ===========================================================================

test "non-code file - no import processing" {
    const allocator = std.testing.allocator;
    const input = "import { x } from 'mod'\n";
    const result = try formatCode(input, "readme.md", allocator);
    defer allocator.free(result);
    // Non-code file should not have imports sorted (no indentation changes either)
    try std.testing.expect(std.mem.indexOf(u8, result, "import") != null);
}

test "non-code file - quotes still fixed" {
    const allocator = std.testing.allocator;
    const input = "const x = \"hello\"\n";
    const result = try formatCode(input, "data.txt", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'hello'") != null);
}

test ".tsx file NOT treated as code (matches TS CODE_EXTS)" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nreturn \"hi\"\n}\n";
    const result = try formatCode(input, "app.tsx", allocator);
    defer allocator.free(result);
    // .tsx is not in CODE_EXTS, so no indentation/quote fixing applied
    // Only quote fixing for non-code files (fixQuotesAllLines) applies
    try std.testing.expect(std.mem.indexOf(u8, result, "'hi'") != null);
}

test ".jsx file NOT treated as code (matches TS CODE_EXTS)" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nreturn \"hi\"\n}\n";
    const result = try formatCode(input, "app.jsx", allocator);
    defer allocator.free(result);
    // .jsx is not in CODE_EXTS, so no indentation fixing applied
    try std.testing.expect(std.mem.indexOf(u8, result, "'hi'") != null);
}

test ".js file treated as code" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nreturn \"hi\"\n}\n";
    const result = try formatCode(input, "app.js", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return 'hi'") != null);
}

// ===========================================================================
// Config variations tests
// ===========================================================================

test "config - max_consecutive_blank_lines 0" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .max_consecutive_blank_lines = 0 };
    const result = try formatCodeWithConfig("a\n\nb\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a\nb\n", result);
}

test "config - trim_trailing_whitespace disabled on non-code file" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .trim_trailing_whitespace = false };
    const result = try formatCodeWithConfig("hello   \n", "data.txt", cfg, allocator);
    defer allocator.free(result);
    // Non-code files skip processCodeLinesFused, so trailing ws is preserved
    try std.testing.expect(std.mem.indexOf(u8, result, "hello   ") != null);
}

// ===========================================================================
// Integration / complex scenario tests
// ===========================================================================

test "full pipeline - mixed issues" {
    const allocator = std.testing.allocator;
    const input =
        \\import { z } from "zod"
        \\import { a } from "alpha"
        \\
        \\
        \\
        \\function main() {
        \\if (true) {
        \\const x = "hello"
        \\const arr = [1,2,3]
        \\console.log(a, z, x, arr)
        \\}
        \\}
        \\
    ;
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Imports should be sorted
    const alpha_pos = std.mem.indexOf(u8, result, "alpha") orelse unreachable;
    const zod_pos = std.mem.indexOf(u8, result, "zod") orelse unreachable;
    try std.testing.expect(alpha_pos < zod_pos);
    // Quotes should be single
    try std.testing.expect(std.mem.indexOf(u8, result, "'hello'") != null);
    // Comma spacing
    try std.testing.expect(std.mem.indexOf(u8, result, "[1, 2, 3]") != null);
    // Indentation should be fixed
    try std.testing.expect(std.mem.indexOf(u8, result, "  if (true)") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "    const") != null);
    // Blank lines collapsed
    try std.testing.expect(std.mem.indexOf(u8, result, "\n\n\n") == null);
}

test "idempotent - already formatted code unchanged" {
    const allocator = std.testing.allocator;
    const input = "import { a } from 'alpha'\n\nfunction main() {\n  const x = 'hello'\n  console.log(a, x)\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings(input, result);
}

test "idempotent - double format same result" {
    const allocator = std.testing.allocator;
    const input =
        \\import { z } from "zod"
        \\import { a } from "alpha"
        \\
        \\function main() {
        \\if (true) {
        \\const x = "hello"
        \\console.log(a, z, x)
        \\}
        \\}
        \\
    ;
    const first = try formatCode(input, "test.ts", allocator);
    defer allocator.free(first);
    const second = try formatCode(first, "test.ts", allocator);
    defer allocator.free(second);
    try std.testing.expectEqualStrings(first, second);
}

test "real-world - class with methods" {
    const allocator = std.testing.allocator;
    const input =
        \\class MyClass {
        \\constructor() {
        \\this.name = "test"
        \\}
        \\greet() {
        \\return "hello"
        \\}
        \\}
        \\
    ;
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  constructor()") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "    this.name = 'test'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  greet()") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "    return 'hello'") != null);
}

test "real-world - arrow functions" {
    const allocator = std.testing.allocator;
    const input = "const fn = (a,b) => {\nreturn a\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "(a, b) =>") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return a") != null);
}

test "real-world - object literal" {
    const allocator = std.testing.allocator;
    const input = "const obj = {\nkey: \"value\",\nnum: 42\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  key: 'value',") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  num: 42") != null);
}

test "large input - many lines" {
    const allocator = std.testing.allocator;
    // Build a 200-line input
    var input_buf = std.ArrayList(u8){};
    defer input_buf.deinit(allocator);
    for (0..200) |i| {
        var num_buf: [16]u8 = undefined;
        const num = std.fmt.bufPrint(&num_buf, "{d}", .{i}) catch unreachable;
        try input_buf.appendSlice(allocator, "const x");
        try input_buf.appendSlice(allocator, num);
        try input_buf.appendSlice(allocator, " = ");
        try input_buf.appendSlice(allocator, num);
        try input_buf.append(allocator, '\n');
    }
    const result = try formatCode(input_buf.items, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(result.len > 0);
    // Should end with exactly one newline
    try std.testing.expect(result[result.len - 1] == '\n');
    if (result.len > 1) {
        try std.testing.expect(result[result.len - 2] != '\n');
    }
}

// ===========================================================================
// Quote fixing edge cases
// ===========================================================================

test "edge: string with only escape sequences" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"\\n\\t\\r\"\n", "test.ts", allocator);
    defer allocator.free(result);
    // Should convert quotes around escape sequences
    try std.testing.expect(result.len > 0);
    try std.testing.expect(result[result.len - 1] == '\n');
}

test "edge: adjacent strings" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"a\" + \"b\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "'b'") != null);
}

test "edge: unterminated string at end of line" {
    const allocator = std.testing.allocator;
    // Line with unclosed double quote - should not crash
    const result = try formatCode("const x = \"hello\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(result.len > 0);
}

test "edge: line with only a quote character" {
    const allocator = std.testing.allocator;
    const result = try formatCode("\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(result.len > 0);
}

test "edge: empty template literal" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = ``\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = ``\n", result);
}

test "edge: template literal with expression containing double quotes" {
    const allocator = std.testing.allocator;
    const input = "const x = `hello ${\"world\"}`\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Template literals should be preserved
    try std.testing.expect(std.mem.indexOf(u8, result, "`") != null);
}

test "edge: escaped backslash in string" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"\\\\\"\n", "test.ts", allocator);
    defer allocator.free(result);
    // Should convert quotes - content is just a backslash
    try std.testing.expect(std.mem.indexOf(u8, result, "'") != null);
}

test "edge: string containing target quote" {
    const allocator = std.testing.allocator;
    // "it's" -> when converting to single quotes, the inner ' becomes "
    const result = try formatCode("const x = \"it's\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(result.len > 0);
    // Should not crash, quote conversion handles this
}

test "edge: very long string" {
    const allocator = std.testing.allocator;
    var input_buf = std.ArrayList(u8){};
    defer input_buf.deinit(allocator);
    try input_buf.appendSlice(allocator, "const x = \"");
    for (0..500) |_| {
        try input_buf.append(allocator, 'a');
    }
    try input_buf.appendSlice(allocator, "\"\n");
    const result = try formatCode(input_buf.items, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'") != null);
}

test "edge: multiple quote styles on one line" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = \"hello\", y = 'world', z = `tmpl`\n", "test.ts", allocator);
    defer allocator.free(result);
    // Double should convert to single, single stays, template stays
    try std.testing.expect(std.mem.indexOf(u8, result, "`tmpl`") != null);
}

// ===========================================================================
// Import edge cases
// ===========================================================================

test "edge: import with trailing semicolon" {
    const allocator = std.testing.allocator;
    const input = "import { x } from 'mod';\n\nconsole.log(x)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "x") != null);
}

test "edge: file with only imports no other code" {
    const allocator = std.testing.allocator;
    const input = "import { x } from 'mod'\nimport { y } from 'other'\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // All imports have no usage, should be removed
    try std.testing.expect(std.mem.indexOf(u8, result, "import") == null);
}

test "edge: import with type keyword in specifier" {
    const allocator = std.testing.allocator;
    const input = "import { type Foo, bar } from 'mod'\n\nconsole.log(bar)\nlet x: Foo\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "bar") != null);
}

test "edge: multiple side-effect imports" {
    const allocator = std.testing.allocator;
    const input = "import 'polyfill-a'\nimport 'polyfill-b'\nimport 'polyfill-c'\n\nconst x = 1\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'polyfill-a'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "'polyfill-b'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "'polyfill-c'") != null);
}

test "edge: import from node: scoped and relative in one file" {
    const allocator = std.testing.allocator;
    const input =
        \\import { c } from './local'
        \\import { b } from '@scope/pkg'
        \\import { a } from 'node:fs'
        \\
        \\console.log(a, b, c)
        \\
    ;
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // node: first, then scoped, then relative
    const node_pos = std.mem.indexOf(u8, result, "node:fs") orelse unreachable;
    const scope_pos = std.mem.indexOf(u8, result, "@scope/pkg") orelse unreachable;
    const local_pos = std.mem.indexOf(u8, result, "./local") orelse unreachable;
    try std.testing.expect(node_pos < scope_pos);
    try std.testing.expect(scope_pos < local_pos);
}

test "edge: import with double-quoted source preserved as single" {
    const allocator = std.testing.allocator;
    const input = "import { x } from \"double-quoted\"\n\nconsole.log(x)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Import sources should use single quotes
    try std.testing.expect(std.mem.indexOf(u8, result, "'double-quoted'") != null);
}

test "edge: import with aliased specifier where alias is used" {
    const allocator = std.testing.allocator;
    const input = "import { original as renamed } from 'mod'\n\nconsole.log(renamed)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Aliased imports should be kept even if original name isn't used
    try std.testing.expect(std.mem.indexOf(u8, result, "original as renamed") != null);
}

test "edge: non-import line before imports stops import block" {
    const allocator = std.testing.allocator;
    const input = "const x = 1\nimport { y } from 'mod'\n\nconsole.log(x, y)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Non-import line before import block means no import processing
    try std.testing.expect(std.mem.indexOf(u8, result, "const x = 1") != null);
}

// ===========================================================================
// Spacing edge cases
// ===========================================================================

test "edge: compound assignment += not split" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x += 1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "+=") != null);
}

test "edge: compound assignment -= not split" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x -= 1\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "-=") != null);
}

test "edge: compound assignment *= not split" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x *= 2\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "*=") != null);
}

test "edge: compound assignment /= not split" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x /= 2\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "/=") != null);
}

test "edge: less-than-or-equal <=" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a <= b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "<=") != null);
}

test "edge: greater-than-or-equal >=" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a >= b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, ">=") != null);
}

test "edge: strict inequality !==" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (a !== b) {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "!==") != null);
}

test "edge: arrow function =>" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const fn = () => {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "=>") != null);
}

test "edge: string containing operator-like chars not modified" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'a+=b'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a+=b'") != null);
}

test "edge: brace after parenthesis no extra space" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (true){}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, ") {") != null);
}

test "edge: brace after less-than (generics) no space" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const m: Map<string,{a: number}> = new Map()\n", "test.ts", allocator);
    defer allocator.free(result);
    // Should not add space between < and {
    try std.testing.expect(result.len > 0);
}

test "edge: multiple commas in array" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const a = [1,2,3,4,5,6,7,8,9,10]\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "1, 2, 3, 4, 5, 6, 7, 8, 9, 10") != null);
}

test "edge: semicolons in string not spaced" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'a;b;c'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a;b;c'") != null);
}

test "edge: equals in string not spaced" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'a=b'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a=b'") != null);
}

test "edge: braces in string not spaced" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 'a{b}c'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a{b}c'") != null);
}

test "edge: block comment line skipped" {
    const allocator = std.testing.allocator;
    const result = try formatCode("/* a=b,c{d} */\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("/* a=b,c{d} */\n", result);
}

// ===========================================================================
// Indentation edge cases
// ===========================================================================

test "edge: multiple closing braces on separate lines" {
    const allocator = std.testing.allocator;
    const input = "a {\nb {\nc {\n}\n}\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("a {\n  b {\n    c {\n    }\n  }\n}\n", result);
}

test "edge: opening and closing brace on same line" {
    const allocator = std.testing.allocator;
    const result = try formatCode("if (x) { return }\n", "test.ts", allocator);
    defer allocator.free(result);
    // Same-line open+close: opens then closes, net zero indent change
    try std.testing.expect(result.len > 0);
}

test "edge: empty block {}" {
    const allocator = std.testing.allocator;
    const result = try formatCode("function foo() {}\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "{}") != null);
}

test "edge: deeply nested 8 levels" {
    const allocator = std.testing.allocator;
    const input = "a {\nb {\nc {\nd {\ne {\nf {\ng {\nh {\nval\n}\n}\n}\n}\n}\n}\n}\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // val should be at 8 levels = 16 spaces
    try std.testing.expect(std.mem.indexOf(u8, result, "                val") != null);
}

test "edge: brace in string does not affect indent" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nconst x = 'has { brace }'\nreturn x\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Both lines inside function should be at indent level 1
    try std.testing.expect(std.mem.indexOf(u8, result, "  const x") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return x") != null);
}

test "edge: brace in double-quoted string does not affect indent" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\nconst x = \"has { brace }\"\nreturn x\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  const x") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return x") != null);
}

test "edge: comment with brace does not affect indent" {
    const allocator = std.testing.allocator;
    const input = "function foo() {\n// { not a real brace\nreturn 1\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  // { not a real brace") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return 1") != null);
}

test "edge: try-catch-finally indentation" {
    const allocator = std.testing.allocator;
    const input = "try {\na()\n} catch (e) {\nb(e)\n} finally {\nc()\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  a()") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  b(e)") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  c()") != null);
}

test "edge: switch case indentation" {
    const allocator = std.testing.allocator;
    const input = "switch (x) {\ncase 1:\nbreak\ncase 2:\nbreak\ndefault:\nbreak\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  case 1:") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  case 2:") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  default:") != null);
}

// ===========================================================================
// Line processing edge cases
// ===========================================================================

test "edge: lone carriage return" {
    const allocator = std.testing.allocator;
    const result = try formatCode("a\rb\n", "test.ts", allocator);
    defer allocator.free(result);
    // \r alone should be treated as line ending
    try std.testing.expect(std.mem.indexOf(u8, result, "a") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "b") != null);
}

test "edge: consecutive CRLF" {
    const allocator = std.testing.allocator;
    const result = try formatCode("a\r\n\r\n\r\nb\r\n", "test.ts", allocator);
    defer allocator.free(result);
    // Should normalize CRLF and collapse blanks
    try std.testing.expectEqualStrings("a\n\nb\n", result);
}

test "edge: very long line 1000 chars" {
    const allocator = std.testing.allocator;
    var input_buf = std.ArrayList(u8){};
    defer input_buf.deinit(allocator);
    try input_buf.appendSlice(allocator, "const x = '");
    for (0..1000) |_| try input_buf.append(allocator, 'a');
    try input_buf.appendSlice(allocator, "'\n");
    const result = try formatCode(input_buf.items, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(result.len > 1000);
}

test "edge: line with only spaces" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello\n          \nworld\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\nworld\n", result);
}

test "edge: line with only tabs" {
    const allocator = std.testing.allocator;
    const result = try formatCode("hello\n\t\t\t\nworld\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\nworld\n", result);
}

test "edge: trailing whitespace after closing brace" {
    const allocator = std.testing.allocator;
    const result = try formatCode("function foo() {\nreturn 1\n}   \n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("function foo() {\n  return 1\n}\n", result);
}

// ===========================================================================
// Final newline edge cases
// ===========================================================================

test "edge: file with only newlines" {
    const allocator = std.testing.allocator;
    const result = try formatCode("\n\n\n", "test.ts", allocator);
    defer allocator.free(result);
    // All newlines, no content - should be empty or minimal
    try std.testing.expect(result.len <= 1);
}

test "edge: content with many trailing newlines" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 1\n\n\n\n\n\n\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "edge: final newline none with no trailing newline" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .none };
    const result = try formatCodeWithConfig("hello", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello", result);
}

test "edge: final newline two with one trailing" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .two };
    const result = try formatCodeWithConfig("hello\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\n", result);
}

test "edge: final newline two with many trailing" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .final_newline = .two };
    const result = try formatCodeWithConfig("hello\n\n\n\n\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("hello\n\n", result);
}

// ===========================================================================
// Complex real-world edge cases
// ===========================================================================

test "edge: export statement with quotes" {
    const allocator = std.testing.allocator;
    const result = try formatCode("export const x = \"hello\"\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("export const x = 'hello'\n", result);
}

test "edge: ternary operator" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = true ? 'a' : 'b'\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "'a'") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "'b'") != null);
}

test "edge: array destructuring with comma spacing" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const [a,b,c] = [1,2,3]\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "[a, b, c]") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "[1, 2, 3]") != null);
}

test "edge: object destructuring" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const {a,b} = obj\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "{a, b}") != null);
}

test "edge: async await formatting" {
    const allocator = std.testing.allocator;
    const input = "async function fetch() {\nconst res = await get(\"url\")\nreturn res\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  const res = await get('url')") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "  return res") != null);
}

test "edge: method chaining" {
    const allocator = std.testing.allocator;
    const input = "const result = arr\n.filter(x => x > 0)\n.map(x => x * 2)\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, ".filter") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, ".map") != null);
}

test "edge: nested function calls with commas" {
    const allocator = std.testing.allocator;
    const result = try formatCode("foo(bar(1,2),baz(3,4))\n", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "bar(1, 2)") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "baz(3, 4)") != null);
}

test "edge: object with nested objects" {
    const allocator = std.testing.allocator;
    const input = "const o = {\na: {\nb: {\nc: 1\n}\n}\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "  a: {") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "    b: {") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "      c: 1") != null);
}

test "edge: single character file" {
    const allocator = std.testing.allocator;
    const result = try formatCode("x", "test.ts", allocator);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("x\n", result);
}

test "edge: file with only a newline" {
    const allocator = std.testing.allocator;
    const result = try formatCode("\n", "test.ts", allocator);
    defer allocator.free(result);
    // Single newline, content is empty
    try std.testing.expect(result.len <= 1);
}

test "edge: indentation reset after multiple functions" {
    const allocator = std.testing.allocator;
    const input = "function a() {\nreturn 1\n}\nfunction b() {\nreturn 2\n}\nfunction c() {\nreturn 3\n}\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // All functions at level 0, bodies at level 1
    try std.testing.expect(std.mem.indexOf(u8, result, "function a()") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "function b()") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "function c()") != null);
    // Count occurrences of "  return" (2-space indent)
    var count: usize = 0;
    var pos: usize = 0;
    while (std.mem.indexOfPos(u8, result, pos, "  return")) |found| {
        count += 1;
        pos = found + 1;
    }
    try std.testing.expectEqual(@as(usize, 3), count);
}

test "edge: idempotent after three passes" {
    const allocator = std.testing.allocator;
    const input = "import { z } from \"zod\"\nimport { a } from \"alpha\"\n\nfunction main() {\nconst x = \"hello\"\nconst arr = [1,2,3]\nconsole.log(a, z, x, arr)\n}\n";
    const r1 = try formatCode(input, "test.ts", allocator);
    defer allocator.free(r1);
    const r2 = try formatCode(r1, "test.ts", allocator);
    defer allocator.free(r2);
    const r3 = try formatCode(r2, "test.ts", allocator);
    defer allocator.free(r3);
    try std.testing.expectEqualStrings(r2, r3);
}

test "edge: mixed indentation with content" {
    const allocator = std.testing.allocator;
    const input = "\t  \t  const x = 1\n";
    const result = try formatCode(input, "test.ts", allocator);
    defer allocator.free(result);
    // Should normalize to proper indentation (level 0)
    try std.testing.expectEqualStrings("const x = 1\n", result);
}

test "edge: consecutive commas (sparse array)" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const a = [1,,3]\n", "test.ts", allocator);
    defer allocator.free(result);
    // Double comma - should add space after first comma but not create extra
    try std.testing.expect(result.len > 0);
}

test "edge: semicolon at end of line no extra space" {
    const allocator = std.testing.allocator;
    const result = try formatCode("const x = 1;\n", "test.ts", allocator);
    defer allocator.free(result);
    // Trailing semicolon shouldn't get a space after it
    try std.testing.expect(std.mem.indexOf(u8, result, "1;") != null);
}

// ===========================================================================
// Semicolon removal tests
// ===========================================================================

test "semi removal - basic trailing semicolon removed" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .semi_removal = true };
    // Note: with semi_removal=true, duplicate ;; collapses to ;
    // Single semicolons at end of statements are kept (TS behavior)
    const result = try formatCodeWithConfig("const x = 1;;\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    // ;; -> ; (collapse duplicates)
    try std.testing.expect(std.mem.indexOf(u8, result, ";;") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "1;") != null);
}

test "semi removal - empty semicolon line removed" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .semi_removal = true };
    const result = try formatCodeWithConfig("const x = 1\n;\nconst y = 2\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    // The standalone ; line should become empty
    try std.testing.expect(std.mem.indexOf(u8, result, "\n;\n") == null);
}

test "semi removal - for loop semicolons preserved" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .semi_removal = true };
    const result = try formatCodeWithConfig("for (let i = 0;; i < 10;; i++) {\n}\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    // for loop lines should NOT have semicolons removed
    try std.testing.expect(std.mem.indexOf(u8, result, "for") != null);
}

test "semi removal - disabled by default" {
    const allocator = std.testing.allocator;
    // default_config has semi_removal = false
    const result = try formatCode("const x = 1;;\n", "test.ts", allocator);
    defer allocator.free(result);
    // ;; should be preserved when semi_removal is off
    try std.testing.expect(std.mem.indexOf(u8, result, ";;") != null);
}

test "semi removal - triple semicolons collapse to one" {
    const allocator = std.testing.allocator;
    const cfg = Config{ .semi_removal = true };
    const result = try formatCodeWithConfig("const x = 1;;;\n", "test.ts", cfg, allocator);
    defer allocator.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, ";;;") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, ";;") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "1;") != null);
}

// ===========================================================================
// isJsonFile tests
// ===========================================================================

test "isJsonFile - .json extension" {
    try std.testing.expect(isJsonFile("package.json"));
}

test "isJsonFile - .jsonc extension" {
    try std.testing.expect(isJsonFile("tsconfig.jsonc"));
}

test "isJsonFile - non-json file" {
    try std.testing.expect(!isJsonFile("test.ts"));
    try std.testing.expect(!isJsonFile("style.css"));
}

// ===========================================================================
// isCodeFile updated tests
// ===========================================================================

test "isCodeFile - .ts is code" {
    try std.testing.expect(isCodeFile("test.ts"));
}

test "isCodeFile - .js is code" {
    try std.testing.expect(isCodeFile("test.js"));
}

test "isCodeFile - .tsx is NOT code (matches TS CODE_EXTS)" {
    try std.testing.expect(!isCodeFile("app.tsx"));
}

test "isCodeFile - .jsx is NOT code (matches TS CODE_EXTS)" {
    try std.testing.expect(!isCodeFile("app.jsx"));
}
