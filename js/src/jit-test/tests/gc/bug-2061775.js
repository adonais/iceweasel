gczeal(0);

let W = newGlobal({newCompartment: true});
W.eval(`var wm = new WeakMap; var key = {};`);

var wm2 = new WeakMap;

function setup() {
  let sym = Symbol('s');
  W.sym = sym;
  W.eval(`wm.set(key, sym); sym = null;`);
  let O = {victim: true};
  wm2.set(sym, O);
  addMarkObservers([sym, O]);
  O = null;
  sym = null;
}
setup();

function clobber(n) {
  if (n <= 0) return 1;
  let a = [n, n + 1, n + 2, {}, {}, {}];
  return clobber(n - 1) + a.length;
}
clobber(500);

W.eval(`grayRoot().push(key); key = null;`);
gc();
gc();
let marks = getMarks();
assertEq(marks[0], "gray");

W.eval(`key = grayRoot()[0];`);
gc();
marks = getMarks();
assertEq(marks[0], "black");

schedulezone(this);
schedulezone('atoms');
gc('zone');
marks = getMarks();
assertEq(marks[0], "black");
