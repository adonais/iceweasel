function r() {
    for (var x in undefined) {}
}
enableTrackAllocations();
r();
