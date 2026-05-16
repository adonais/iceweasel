// |jit-test| --disable-tosource; --setpref=legacy_tosource_lookup=true

// Ensure the object.toSource() path in ValueToSource is enabled if the
// legacy_tosource_lookup pref is true and we're not defining the toSource/uneval
// builtins.

function testPlain() {
  var toSourceCalled = false;
  var obj = {toSource() {
    toSourceCalled = true;
    return "foo";
  }};
  assertEq(valueToSource(obj), "foo");
  assertEq(toSourceCalled, true);
}
testPlain();

function testProxy() {
  var log = [];
  var proxy = new Proxy({}, {get(target, prop) {
    log.push(prop);
    return () => "bar";
  }});
  assertEq(valueToSource(proxy), "bar");
  assertEq(log.length, 1);
  assertEq(log[0], "toSource");
}
testProxy();
