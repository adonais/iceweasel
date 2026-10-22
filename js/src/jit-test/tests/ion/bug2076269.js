// |jit-test| --fast-warmup

function test(numProps) {
  let g = newGlobal({sameCompartmentAs: this});
  g.eval(`
    // Throws when called without arguments, so warm-up never creates the
    // rest array.
    function inner(a = a, ...rest) { return rest; }

    function outer(global, callInner, value, callee, stored, box) {
      let before = global.p0;
      let rest;
      if (callInner) rest = callee(value);
      global.p1 = stored;
      box.rest = rest;
      box.before = before;
    }

    var box = {rest: null, before: 0};
    try { inner(); } catch (e) {}

    for (let i = 0; i < ${numProps}; i++) this["p" + i] = i;
  `);
  let box = g.box;

  for (let i = 0; i < 200; i++) {
    g.p0 = i;
    try { g.outer(g, true, undefined, g.inner, i, box); } catch (e) {}
  }
  for (let i = 0; i < 5000; i++) {
    g.p0 = i;
    g.outer(g, false, 123, g.inner, i, box);
  }

  g.p0 = 7;
  g.p1 = -1;
  g.outer(g, true, 123, g.inner, 12345, box);

  assertEq(g.p1, 12345);
  assertEq(box.rest.length, 0);
}

for (let numProps = 65110; numProps <= 65130; numProps++) {
  test(numProps);
}
