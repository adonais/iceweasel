gczeal(0);
grayRoot()[0] = Symbol();
gc();
startgc(1);
function f() {
  let v = grayRoot()[0];
  finishgc();
  return typeof v;
}
f();
