// |jit-test| skip-if: !hasFunction["currentgc"]

gczeal(0);
gc();

var zones = [];
for (var i = 0; i < 100; i++) {
  var z = newGlobal({newCompartment: true});
  z.eval("var keep=[],tmp=[]; function tenure(n){for(var i=0;i<n;i++)keep.push(new Array(1000).fill(i));} function alloc(n){for(var i=0;i<n;i++)tmp.push(new Array(1000).fill(i));} function clear(){tmp=[];keep.length=Math.floor(keep.length/4);}");
  z.tenure(100);
  zones.push(z);
}
gc();
gc();

for (var iter = 0; iter < 5; iter++) {
  for (var z of zones) z.clear();
  gc();
  startgc(5000);
  var slices = 0;
  var didMark = false;
  while (gcstate() !== "NotActive" && slices < 50000) {
    var st = gcstate();
    if (st == "Mark" && !didMark) {
      for (var z of zones) z.alloc(50);
      didMark = true;
    }
    if (st == "Sweep" && currentgc().sweepGroup >= 2) {
      for (var z of zones) z.alloc(100);
      minorgc();
      abortgc();
      break;
    }
    gcslice(5000);
    slices++;
  }
  minorgc();
  gc();
}
