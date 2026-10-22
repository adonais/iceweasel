// Collecting while a return_call from an export to a JS import is in flight.
let n = 0;
const i = new WebAssembly.Instance(
    new WebAssembly.Module(wasmTextToBinary(
        `(module (import "" "f" (func $f)) (func (export "run") return_call $f))`)),
    {"": {f() { if (++n == 48) gc(); }}});
for (let j = 0; j < 55; j++) i.exports.run();
