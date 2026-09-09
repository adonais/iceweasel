// |jit-test| --fast-warmup; --no-threads; skip-if: getJitCompilerOptions()['blinterp.warmup.trigger'] === 0

// Bound functions created by the specialized Function.prototype.bind stub and
// then immediately called don't escape, so scalar replacement should remove the
// allocation entirely.
//
// assertRecoveredOnBailout is what actually verifies that: without it these
// tests would pass whether or not scalar replacement happened.

// The skip-if above excludes configurations that compile eagerly. Without a
// baseline warm-up phase the specialized bind IC never attaches, so there is no
// template object and hence no MNewBoundFunction to scalar replace, and the
// assertRecoveredOnBailout calls below would fail for that reason rather than
// because scalar replacement is broken.

function target(a, b, c) {
  return this.x + a + b + c;
}

// Plain call, bound function never escapes.
function testCall(i) {
  const obj = {x: 10};
  const b = target.bind(obj, 1, 2);
  assertRecoveredOnBailout(b, true);
  return b(i);
}
for (let i = 0; i < 200; i++) {
  assertEq(testCall(i), 13 + i);
}

// Same, but the bind and the call are one expression.
function testImmediate(i) {
  const obj = {x: 20};
  return target.bind(obj, 3, 4)(i);
}
for (let i = 0; i < 200; i++) {
  assertEq(testImmediate(i), 27 + i);
}

// Bound function created inside a loop.
function testLoop() {
  const obj = {x: 5};
  let total = 0;
  for (let i = 0; i < 300; i++) {
    const b = target.bind(obj, i, 1);
    assertRecoveredOnBailout(b, true);
    total += b(2);
  }
  return total;
}
assertEq(testLoop(), 5 * 300 + (299 * 300 / 2) + 3 * 300);

// Constructing call. tryAttachBoundFunction guards newTarget == callee here, so
// this only scalar-replaces if IsObjectEscaped understands GuardObjectIdentity.
function Ctor(a, b) {
  this.a = a;
  this.b = b;
}

function testConstruct(i) {
  const b = Ctor.bind(null, i);
  assertRecoveredOnBailout(b, true);
  const res = new b(i + 1);
  assertEq(res.a, i);
  assertEq(res.b, i + 1);
}
for (let i = 0; i < 200; i++) {
  testConstruct(i);
}

// A bound function that escapes must not be scalar replaced.
let escaped = null;
function testEscape(i) {
  const b = target.bind({x: 1}, 1, 1);
  escaped = b;
  return b(i);
}
for (let i = 0; i < 200; i++) {
  assertEq(testEscape(i), 3 + i);
}
assertEq(typeof escaped, "function");

// Bailing out while the allocation is recovered must produce a working bound
// function.
function targetBail(a, b, deopt) {
  if (deopt) {
    bailout();
  }
  return a + b;
}

function testBailout(deopt) {
  const b = targetBail.bind(null, 40);
  return b(2, deopt);
}
for (let i = 0; i < 200; i++) {
  assertEq(testBailout(false), 42);
}
assertEq(testBailout(true), 42);
