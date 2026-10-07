// |jit-test| skip-if: !("WebAssembly" in this)

const g = newGlobal({newCompartment: true});
g.bin = wasmTextToBinary('(module (func (export "f") (local ' + 'i32 '.repeat(17) + ')))');
const dbg = new Debugger(g);
dbg.onEnterFrame = function(frame) {
  if (frame.type !== "wasmcall") return;
  frame.environment;
};
g.evaluate("var instance = new WebAssembly.Instance(new WebAssembly.Module(bin));");
oomTest(() => { g.instance.exports.f(); });
