// A unique symbol is represented by a per-zone local symbol that is wrapped
// when passed between zones. Check that this is not observable: a symbol keeps
// its identity wherever it is seen from.

gczeal(0);

let g1 = newGlobal({newCompartment: true});
g1.g0 = this;

var s1 = Symbol("d1");
var s2 = Symbol("d2");

g1.s1 = s1;
g1.s2 = undefined;

function check() {
  assertEq(typeof s1, 'symbol');
  assertEq(typeof s2, 'symbol');
  assertEq(s1.description, 'd1');
  assertEq(s2.description, 'd2');

  assertEq(s1, g1.s1);
  g1.eval('assertEq(s1, g0.s1)');

  assertEq(g1.s2, undefined);
  g1.s2 = s2;
  assertEq(s2, g1.s2);
  g1.eval('assertEq(s2, g0.s2)');
  g1.s2 = undefined;
}

check();

for (let collect0 of [false, true]) {
  for (let collect1 of [false, true]) {
    for (let collectAtoms of [false, true]) {
      if (collect0) {
        schedulezone(this);
      }
      if (collect1) {
        schedulezone(g1);
      }
      if (collectAtoms) {
        schedulezone('atoms');
      }
      gc('zone');
      check();
    }
  }
}
