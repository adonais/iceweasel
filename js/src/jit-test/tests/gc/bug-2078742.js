function round(N) {
  var objs = new Array(N);
  for (var i = 0; i < N; i++) {
    objs[i] = {p0:i,p1:1,p2:2,p3:3,p4:4,p5:5,p6:6,p7:7,p8:8,p9:9,p10:10,p11:11,p12:12,p13:13,p14:14,p15:15};
  }
  minorgc();
  for (var i = 0; i < N; i++) {
    if (i % 14) {
      objs[i] = null;
    }
  }
  if (gcstate() != "NotActive") {
    finishgc();
  }
  startgc(1000000, "shrinking");
  while (gcstate() != "NotActive") {
    gcslice(1000000);
  }
  startgc(1);
  reportLargeAllocationFailure(1);
  finishgc();
  return objs;
}

gczeal(0);
for (var r = 0; r < 8; r++) {
  round(400000);
}
