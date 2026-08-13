load(libdir + "asm.js");

function module(stdlib, foreign, buffer) {
  "use asm";

  var i32 = new stdlib.Int32Array(buffer);

  function zero() {
    return i32[0] | 0;
  }
  return zero;
}

const byteLength = BUF_MIN;
let buffer = new ArrayBuffer(byteLength);
let i32 = new Int32Array(buffer);
let zero = module(globalThis, null, buffer);

const magic = 0xbadf00d;

assertEq(zero(), 0);
assertEq(i32[0], 0);

i32[0] = magic;

assertEq(zero(), magic);
assertEq(i32[0], magic);

assertEq(buffer.detached, false);
assertEq(buffer.byteLength, byteLength);

let copy = buffer.transfer();

assertEq(buffer.detached, true);
assertEq(buffer.byteLength, 0);

assertEq(copy.detached, false);
assertEq(copy.byteLength, byteLength);

// Access returns undefined when detached.
assertEq(zero(), 0);
assertEq(i32[0], undefined);
