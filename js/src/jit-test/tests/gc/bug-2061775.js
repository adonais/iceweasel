gczeal(0);

let W = newGlobal({newCompartment: true});
W.eval(`var wm = new WeakMap; var key = {};`);

var wm2 = new WeakMap;
let idx = -1;

function setup() {
  let sym = Symbol('s');
  idx = getAtomMarkIndex(sym);
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

W.eval(`key = grayRoot()[0];`);
gc();
let marks = getMarks();
assertEq(marks[0] == "black" && getAtomMarkColor(W, idx) == "gray", false);

schedulezone(this);
schedulezone('atoms');
gc('zone');
marks = getMarks();
assertEq(marks[0] == "gray" && marks[1] == "gray", false);
