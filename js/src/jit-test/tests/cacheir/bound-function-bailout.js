// |jit-test| --fast-warmup; --no-threads

// Bailing out from inside a call to a bound function must reconstruct |this| and
// the full argument list (bound arguments followed by actual arguments), for
// each combination of bound and actual argument counts.
//
// The bailout has to happen while the target is inlined into its caller, so it
// is triggered by reshaping |bail| after the callers are compiled: the shape
// guard for |bail.x| then fails inside the inlined target.
//
// Note: the call sites below are deliberately fixed-arity. Spread calls are not
// optimized by CallIRGenerator::tryAttachBoundFunction, so a spread call site
// would not exercise the bound function stubs at all.

const obj = {tag: "obj"};
const bail = {x: 1};

// No bound arguments.
function t0(a, b) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 10);
  assertEq(b, 11);
  return r;
}
const b0 = t0.bind(obj);
function callB0() { return b0(10, 11); }

// One bound argument.
function t1(a, b, c) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 1);
  assertEq(b, 10);
  assertEq(c, 11);
  return r;
}
const b1 = t1.bind(obj, 1);
function callB1() { return b1(10, 11); }

// MaxInlineBoundArgs bound arguments.
function t3(a, b, c, d, e) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 1);
  assertEq(b, 2);
  assertEq(c, 3);
  assertEq(d, 10);
  assertEq(e, 11);
  return r;
}
const b3 = t3.bind(obj, 1, 2, 3);
function callB3() { return b3(10, 11); }

// More than MaxInlineBoundArgs, so the bound arguments live in an array.
function t4(a, b, c, d, e, f) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 1);
  assertEq(b, 2);
  assertEq(c, 3);
  assertEq(d, 4);
  assertEq(e, 10);
  assertEq(f, 11);
  return r;
}
const b4 = t4.bind(obj, 1, 2, 3, 4);
function callB4() { return b4(10, 11); }

// Fewer arguments than the target's arity.
function tUnderflow(a, b, c, d) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 1);
  assertEq(b, undefined);
  assertEq(c, undefined);
  assertEq(d, undefined);
  return r;
}
const bUnderflow = tUnderflow.bind(obj, 1);
function callBUnderflow() { return bUnderflow(); }

// More arguments than the target's arity. Reading |arguments| here forces the
// overflow-argument path in InlineFrameIterator::readFrameArgsAndLocals.
function tOverflow(a) {
  const r = bail.x;
  assertEq(this, obj);
  assertEq(a, 1);
  assertEq(arguments.length, 4);
  assertEq(arguments[1], 2);
  assertEq(arguments[2], 10);
  assertEq(arguments[3], 11);
  return r;
}
const bOverflow = tOverflow.bind(obj, 1, 2);
function callBOverflow() { return bOverflow(10, 11); }

const cases = [callB0, callB1, callB3, callB4, callBUnderflow, callBOverflow];

with ({}) {}
for (var i = 0; i < 200; i++) {
  for (var fn of cases) {
    assertEq(fn(), 1);
  }
}

bail.trigger = true;

for (var fn of cases) {
  assertEq(fn(), 1);
}
