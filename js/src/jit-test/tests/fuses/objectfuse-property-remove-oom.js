function f() {
  for (var i = 0; i < 50; i++) {
    var v = {};
    globalProp = v;
    assertEq(globalProp, v);
    if (i == 40) {
      delete this.globalProp;
    }
  }
}
f();
oomTest(f);
