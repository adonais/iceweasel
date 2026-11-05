// |jit-test| --fast-warmup; --no-threads

// Bound functions don't have a realm in the spec, so calling a bound function
// must not switch realms. This is observable with a bound proxy.

var proxy = new Proxy(function() {}, {
  apply(target, thisArg, args) { return args; },
  construct(target, args) { return args; }
});
var g = newGlobal({sameCompartmentAs: this});

function checkThisRealm(arr) {
  assertEq(Object.getPrototypeOf(arr), Array.prototype);
}

var bound = g.Function.prototype.bind.call(proxy, null);
var nested1 = g.Function.prototype.bind.call(Function.prototype.bind.call(proxy, null), null);
var nested2 = Function.prototype.bind.call(g.Function.prototype.bind.call(proxy, null), null);

function testCall(f) {
  for (var i = 0; i < 100; i++) {
    checkThisRealm(f(1, 2));
  }
}
testCall(bound);
testCall(nested1);
testCall(nested2);

function testConstruct(f) {
  for (var i = 0; i < 100; i++) {
    checkThisRealm(new f(1, 2));
  }
}
testConstruct(bound);
testConstruct(nested1);
testConstruct(nested2);

function testMegamorphic(f) {
  var fs = [Math.abs, Math.acos, Math.atan, Math.ceil, Math.cos, f];
  for (var i = 0; i < 300; i++) {
    var res = fs[i % fs.length](1, 2);
    if (i % fs.length === fs.length - 1) {
      checkThisRealm(res);
    }
  }
}
testMegamorphic(bound);
testMegamorphic(nested1);
testMegamorphic(nested2);

// fun_call has a realm, so the arguments array is allocated in fun_call's
// realm.
function testFunCall() {
  var f = g.Function.prototype.call.bind(proxy);
  for (var i = 0; i < 100; i++) {
    assertEq(Object.getPrototypeOf(f(null, 1, 2)), g.Array.prototype);
  }
}
testFunCall();
