//! Unit tests of the native engine's rule ports and helpers:
//! `zig test src/native/test_root.zig` (part of `zig build test`).

test {
    _ = @import("directives.zig");
    _ = @import("lexer.zig");
    _ = @import("builtin_lex.zig");
    _ = @import("builtin_quotes.zig");
    _ = @import("builtin_cond_assign.zig");
    _ = @import("nuv_js.zig");
    _ = @import("nuv_pattern.zig");
    _ = @import("rules/pc_rest_walk.zig");
    _ = @import("rules/pc_lexer.zig");
    _ = @import("rules/prefer_const.zig");
    _ = @import("rules/prefer_template.zig");
    _ = @import("rules/re_text.zig");
    _ = @import("rules/st_collate.zig");
    _ = @import("rules/sort_exports.zig");
    _ = @import("rules/no_multi_spaces.zig");
    _ = @import("rules/no_new.zig");
    _ = @import("rules/general_no_new.zig");
    _ = @import("rules/no_regex_spaces.zig");
    _ = @import("rules/pg_import.zig");
    _ = @import("rules/prefer_global_buffer.zig");
}
