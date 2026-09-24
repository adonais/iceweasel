// Regression test for the rooting of the wasm throw stub's owner.
//
// While popping frames for an exception, HandleException must keep the
// innermost wasm instance alive: the throw stub it is about to return into is
// owned by that instance's code.

const table = new WebAssembly.Table({element: "anyfunc", initial: 1});

// Reaches the tail-calling instance only through the table, so the collapsed
// frame is the only thing that could otherwise keep it alive.
const driver = wasmEvalText(`(module
  (type $t (func (result i32)))
  (import "m" "table" (table 1 funcref))
  (func (export "f") (result i32)
    i32.const 0
    call_indirect (type $t))
)`, {m: {table}}).exports.f;

var armed = false;

// A proxy, so that the call is routed through an exit stub rather than being
// specialized to a plain JS function.
const go = new Proxy(function() {
  if (!armed) {
    return 42;
  }
  // Drop the last reference to the tail-calling instance, then propagate an
  // exception back out through its exit stub.
  table.set(0, null);
  throw "from import";
}, {});

function install() {
  var ins = wasmEvalText(`(module
    (import "m" "go" (func $go (result i32)))
    (func (export "f") (result i32)
      return_call $go)
  )`, {m: {go}});
  table.set(0, ins.exports.f);
  // `ins` is now unreachable except through table[0].
}

// Unwinding the frame of `run` closes this iterator, and the close hook
// collects while the exit stub is still on the stack.
const iterable = {
  [Symbol.iterator]() {
    return {
      next() { return {value: undefined, done: false}; },
      return() {
        if (armed) {
          gc();
        }
        return {};
      }
    };
  }
};

function run() {
  var [value = driver()] = iterable;
  return value;
}

install();

// Warm up without arming, so `run` gets compiled and the lazy stubs exist.
for (var i = 0; i < 100; i++) {
  assertEq(run(), 42);
}

armed = true;
var caught = null;
try {
  run();
} catch (e) {
  caught = e;
}
assertEq(caught, "from import");
