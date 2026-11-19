if (!this.enqueueMark) {
  quit(0);
}

gczeal(0);
var wmA = new WeakMap();
var wmB = new WeakMap();
var k = {};
wmB.set(k, {victim: 1});
minorgc();
minorgc();

enqueueMark(wmA);
enqueueMark("drain");
enqueueMark(wmB);
enqueueMark("yield");
wmB = null;

startgc(1);
while (gcstate() === "Prepare" || gcstate() === "MarkRoots") {
  gcslice(1000);
}
gcslice(100000);
gcslice(100000);
while (gcstate() !== "NotActive") {
  gcslice(1000000);
}
