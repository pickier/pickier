//! `pickier-native`: the native lint engine on its own, as shipped inside the
//! pickier npm package for each platform. It takes the same request as
//! `pickier-zig lint-batch` (see native/batch.zig) and needs no other dependency, so
//! it builds with a plain `zig build-exe` for every target.

const std = @import("std");
const batch = @import("native/batch.zig");

pub fn main(init: std.process.Init) !void {
    const code = try batch.run(init.io, init.arena.allocator());
    if (code != 0) std.process.exit(code);
}
