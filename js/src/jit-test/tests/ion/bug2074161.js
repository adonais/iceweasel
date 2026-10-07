function f(x, go, target) {
  var y = x[0] > 255 ? 2048 : -4096;
  var res = 0;
  if (go) {
    y = y >>> 32;
    for (var j = 0; j < 2; j++) {
      for (var k = y >> 19; k < 4096; k++) {
        res = (res + target[k]) | 0;
      }
      y++;
    }
  }
  return res;
}

var ta = new Uint8Array(1);
var target = new Uint32Array(4096);
target.fill(1);
for (var j = 0; j < 3; j++) f([1000], true, target);
for (var j = 0; j < 3000; j++) f(ta, false, target);
var actual = f(ta, true, target);
assertEq(actual, 4096);
