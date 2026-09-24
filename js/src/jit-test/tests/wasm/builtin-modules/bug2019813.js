// |jit-test| test-also=--setpref=wasm_baseline_debug=true; skip-variant-if: --setpref=wasm_baseline_debug=true, wasmCompileMode() == "ion"

const bytes = wasmTextToBinary(`(module
  (import "wasm:js-string" "length" (func (param externref) (result i32)))
  (import "m" "mem" (memory 0))
)`);

const mod = new WebAssembly.Module(bytes, { builtins: ["js-string"] });
const mem = new WebAssembly.Memory({ initial: 0 });
new WebAssembly.Instance(mod, { m: { mem } });
