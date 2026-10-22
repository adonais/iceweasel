function makeTarget(name) {
  var target = {};
  for (var i = 0; i < 8; i++) {
    target["x" + i] = 1000 + i;
  }
  target[name] = "named";
  return target;
}

function checkCopy(copy, name) {
  var keys = Object.keys(copy);
  assertEq(keys.length, new Set(keys).size);
  assertEq(keys.filter(k => k === name).length, 1);
  assertEq(keys.length, 9);

  for (var i = 0; i < 5; i++) {
    delete copy["x" + i];
  }
  delete copy[name];
  assertEq(copy[name], undefined);
  for (var i = 5; i < 8; i++) {
    assertEq(copy["x" + i], 1000 + i);
  }

  copy[name] = "again";
  copy.extra1 = 1;
  copy.extra2 = 2;
  assertEq(copy[name], "again");
  assertEq(copy.extra1, 1);
  assertEq(copy.extra2, 2);
  for (var i = 5; i < 8; i++) {
    assertEq(copy["x" + i], 1000 + i);
  }
}

function testSpread() {
  for (var trial = 0; trial < 20; trial++) {
    var name = "d" + trial;
    var proxy = newProxyWithDuplicateOwnKeys(makeTarget(name));
    checkCopy({ ...proxy }, name);
  }
}

function testRest() {
  for (var trial = 0; trial < 20; trial++) {
    var name = "r" + trial;
    var proxy = newProxyWithDuplicateOwnKeys(makeTarget(name));
    var { notThere, ...rest } = proxy;
    assertEq(notThere, undefined);
    checkCopy(rest, name);
  }
}

function testExcluded() {
  var proxy = newProxyWithDuplicateOwnKeys(makeTarget("n"));
  var { x0, n, ...rest } = proxy;
  assertEq(x0, 1000);
  assertEq(n, "named");
  var keys = Object.keys(rest);
  assertEq(keys.join(), "x1,x2,x3,x4,x5,x6,x7");
}

function testAfterLiteralEntries() {
  var proxy = newProxyWithDuplicateOwnKeys(makeTarget("lit"));
  var copy = { first: 1, lit: "literal", ...proxy };
  var keys = Object.keys(copy);
  assertEq(keys.length, new Set(keys).size);
  assertEq(keys[0], "first");
  assertEq(copy.lit, "named");
}

function testAssign() {
  var proxy = newProxyWithDuplicateOwnKeys(makeTarget("a"));
  checkCopy(Object.assign({}, proxy), "a");
}

testSpread();
testRest();
testExcluded();
testAfterLiteralEntries();
testAssign();
