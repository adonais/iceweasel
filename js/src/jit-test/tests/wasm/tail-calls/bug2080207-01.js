function f() { return new Error("x").stack.length; }
const inst = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(
  `(module (import "m" "f" (func $f (result i32)))
           (func (export "ret") (result i32) return_call $f))`)), { m: { f } });
const ret = inst.exports.ret;
function run() {
  let s = 0;
  for (let k = 0; k < 1000; k++) {
    if (k % 50 == 49) gc(null, "shrinking");
    s += ret();
  }
  return s;
}
print("ok", run());
