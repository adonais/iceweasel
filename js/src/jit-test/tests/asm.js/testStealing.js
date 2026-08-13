load(libdir + "asm.js");
load(libdir + "asserts.js");

var code = USE_ASM + "var i32 = new stdlib.Int32Array(buf); function f() { return i32[0]|0 } return f";

var ab = new ArrayBuffer(BUF_MIN);
new Int32Array(ab)[0] = 42;

var f = asmLink(asmCompile('stdlib', 'ffi', 'buf', code), this, null, ab);
assertEq(f(), 42);

detachArrayBuffer(ab);
assertEq(ab.detached, true);
assertEq(f(), 0);

var ab2 = new ArrayBuffer(BUF_MIN);
new Int32Array(ab2)[0] = 7;
var transferred = serialize(ab2, [ab2]);
assertEq(ab2.detached, true);
assertEq(transferred !== null, true);
