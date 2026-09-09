function b() { this.c = () => 0; }
if (getBuildConfiguration('debug')) {
    gczeal(0); // Avoid error setting mark stack limit during a GC.
    enqueueMark(new b());
    setMarkStackLimit(16);
}
gc();
