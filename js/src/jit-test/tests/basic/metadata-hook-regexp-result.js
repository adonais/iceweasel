var g = newGlobal({sameCompartmentAs: this});
g.evaluate(`enableTrackAllocations()`);

function f() {
    // Ensure a match stub is created for the zone.
    var re = /abc.+/;
    for (var i = 0; i < 100; i++) {
        assertEq(re.exec("..abcd").index, 2);
    }
    // Allocated match result objects in the realm with the metadata hook
    // must have metadata.
    g.evaluate(`
    function hasFrame(frame, name) {
        for (; frame; frame = frame.parent) {
            if (frame.functionDisplayName === name) {
                return true;
            }
        }
        return false;
    }
    function test() {
        var re = /abc.+/;
        for (var i = 0; i < 100; i++) {
            var obj = re.exec("..abcd");
            assertEq(hasFrame(getAllocationMetadata(obj), "test"), true);
        }
    }
    test();
    `)
}
f();
