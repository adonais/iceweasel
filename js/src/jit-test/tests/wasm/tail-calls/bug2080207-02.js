const other = newGlobal({sameCompartmentAs: globalThis});
const callback = other.eval('() => { throw 0; }');
const module = new WebAssembly.Module(wasmTextToBinary(`(module
  (import "" "callback" (func $callback))
  (func (export "run") return_call $callback))`));
const instance = new WebAssembly.Instance(module, {'': {callback}});
try {
  instance.exports.run();
} catch (error) {}
