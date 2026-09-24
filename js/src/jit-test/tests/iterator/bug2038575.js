var out = [];
var arr1 = [1, 2];
var arr2 = [1, 2];
arr2.a = 1;
var toggle = false;
function f(obj, trigger) {
  var cnt = 0;
  for (var key in obj) {
    out[cnt++] = obj[key];
    trigger();
  }
}
function rec(cnt, test) {
  if (cnt == 0) {
    Object.defineProperty(test ? arr1 : arr2, "1", {enumerable: false});
  } else {
    rec(cnt - 1, test);
  }
}
function trigger() {
  if (!toggle) {
    return;
  }
  let lo = 1000;
  let hi = 32768;
  while (hi - lo > 1) {
    let mid = (lo + hi) >> 1;
    try {
      rec(mid, true);
      lo = mid;
    } catch (e) {
      hi = mid;
    }
  }
  try {
    rec(hi - offset, false);
  } catch {}
}
for (var i = 0; i < 2000; i++) {
  f(arr2, trigger);
}
for (var offset = 2; offset < 4; offset++) {
  arr2[1] = 2;
  toggle = true;
  f(arr2, trigger);
  s = out.toString();
}
