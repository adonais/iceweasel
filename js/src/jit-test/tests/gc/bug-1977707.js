var x = newGlobal({ newCompartment: true });
x.parent = [];
x.eval("Debugger(parent).onEnterFrame = function (y) { y.eval(0 + 'z') }");
oomTest(function () {
  new WebAssembly.Instance(
    new WebAssembly.Module(wasmTextToBinary('(module (func (export "m")))')),
  ).exports.m();
});
