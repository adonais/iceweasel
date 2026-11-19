// |jit-test| --fast-warmup

function testMegamorphic(proto) {
  var g = newGlobal();
  g.evaluate(`
    function setElem(o, i, v) {
      o[i] = v;
    }
    function getElem(o, i) {
      return o[i];
    }
    function push(a, v) {
      return a.push(v);
    }
    var objs = [];
    for (var i = 0; i < 20; i++) {
      var o = {};
      o["p" + i] = i;
      objs.push(o);
      var a = [];
      a["q" + i] = i;
      objs.push(a);
    }
    for (var i = 0; i < 100; i++) {
      for (var o of objs) {
        setElem(o, 0, i);
        assertEq(getElem(o, 1), undefined);
        if (Array.isArray(o)) {
          push(o, i);
          o.length = 1;
        }
      }
    }
    var state = getFuseState();
    assertEq(state.ObjectProtoHasNoIndexedPropsFuse.intact, true);
    assertEq(state.ArrayProtoHasNoIndexedPropsFuse.intact, true);

    if (${proto} === Array.prototype) {
      push(Array.prototype, "x");
    }
    setElem(${proto}, 1, "x");

    state = getFuseState();
    assertEq(state.ObjectProtoHasNoIndexedPropsFuse.intact,
             ${proto} !== Object.prototype);
    assertEq(state.ArrayProtoHasNoIndexedPropsFuse.intact, false);
    for (var o of objs) {
      var expected = (${proto} === Object.prototype || Array.isArray(o))
                     ? "x" : undefined;
      assertEq(getElem(o, 1), expected);
    }
  `);
}
testMegamorphic("Array.prototype");
testMegamorphic("Object.prototype");
