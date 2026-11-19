function f() {
  var g = newGlobal({newCompartment: true, securityWrappers: true});
  var dbg = new g.Debugger(this);
  var p = new Proxy({}, {ownKeys() { throw new Error("foo"); }});
  var pw = dbg.getNewestFrame().environment.getVariable("p");
  var ex;
  try {
    pw.getOwnPropertyNames();
  } catch (e) {
    ex = e;
  }
  assertEq(ex instanceof g.Error, true);
  assertEq(ex.message, "foo");
}
f();
