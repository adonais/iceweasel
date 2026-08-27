// |jit-test| test-also=--wasm-compiler=optimizing; skip-if: !wasmDebuggingEnabled()
load(libdir + "wasm.js");

// Memory can grow during debug events, requiring us to update the HeapReg when
// resuming wasm code. We use an i64 memory with no max to force moving grows.

let g = newGlobal({newCompartment: true});
let dbg = new Debugger(g);
let gw = dbg.addDebuggee(g);

g.eval(`
var b = wasmTextToBinary(\`(module
  (memory (export "mem") i64 1)
  (func (export "test") (result i32)
    (i32.load (i64.const 0)))
)\`);
var m = new WebAssembly.Instance(new WebAssembly.Module(b));
var mem = m.exports.mem;
`);

// Install a debug handler that will moving-grow the memory and write a new sentinel.
let grown = false;
dbg.onEnterFrame = function (frame) {
  if (frame.type != 'wasmcall') return;
  frame.onStep = function () {
    if (grown) {
      return;
    }

    const completion = gw.executeInGlobal(`
      mem.grow(100n);                     // force a moving grow
      new Uint8Array(mem.buffer)[0] = 99; // write a new value that test() should observe
    `);
    if (completion.throw) {
      throw completion.throw.unsafeDereference();
    }
    grown = true;
  };
};

var result = g.eval("m.exports.test()");
assertEq(grown, true);
assertEq(result, 99);
