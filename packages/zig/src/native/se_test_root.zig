//! Unit tests of the sort-exports port and the collation it shares:
//! `zig test src/native/se_test_root.zig`.

test {
    _ = @import("rules/st_collate.zig");
    _ = @import("rules/sort_exports.zig");
}
