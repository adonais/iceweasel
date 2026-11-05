function f(ta, o) {
  var x = ta[0];
  var t = o.x;
  ta[1] = x;
  return t;
}
function run() {
  with ({}) {}
  var ta = new Float32Array(4);
  ta[0] = 1.5;
  var warm = [{x: 0}, Object.create({x: 0}), Object.create(Object.create({x: 0}))];
  for (var i = 0; i < 3000; i++) {
    f(ta, warm[i % 3]);
  }
  for (var j = 0; j < 2; j++) {
    var g = {};
    g["q" + j] = j;
    Object.defineProperty(g, "x", {get: Date.now, configurable: true});
    for (var i = 0; i < 300; i++) {
      var before = Date.now();
      var r = f(ta, g);
      var after = Date.now();
      if (!(r >= before && r <= after)) {
        throw new Error("o.x returned " + r + ", expected a value in [" + before + ", " + after + "]");
      }
    }
  }
}
run();
