//! Unit tests of the prefer-const and prefer-template ports and their
//! helpers: `zig test src/native/pc_test_root.zig`.

test {
    _ = @import("rules/pc_rest_walk.zig");
    _ = @import("rules/pc_lexer.zig");
    _ = @import("rules/prefer_const.zig");
    _ = @import("rules/prefer_template.zig");
}
