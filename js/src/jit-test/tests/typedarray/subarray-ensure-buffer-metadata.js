function test() {
  for (var i = 0; i < 100; i++) {
    if (i === 20) {
      enableTrackAllocations();
    }
    var o = new Int8Array(1).subarray();
    if (i >= 20) {
      var md = getAllocationMetadata(o);
      assertEq(typeof md === "object" && md !== null, true);
      assertEq(md.functionDisplayName, "test");
    }
  }
}
test();
