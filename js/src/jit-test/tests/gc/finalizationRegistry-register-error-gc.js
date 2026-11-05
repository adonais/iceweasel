gczeal(2, 5);

// Objects from this global are wrapped in g with security wrappers, so passing
// them as the target makes register fail.
var g = newGlobal({newCompartment: true, securityWrappers: true});
g.eval("var count = 0;");
var reg = new g.FinalizationRegistry(g.eval("() => count++"));

var targets = [];
for (var n = 1; n < 50; n++) {
  var target = new g.Object();
  targets.push(target);
  reg.register(target, 0, new g.Object());
  var ex = null;
  try {
    reg.register({}, 1);
  } catch (e) {
    ex = e;
  }
  assertEq(ex.message, "Permission denied to access object");
}

targets = null;
target = null;
gc();
drainJobQueue();
assertEq(g.count, 49);
