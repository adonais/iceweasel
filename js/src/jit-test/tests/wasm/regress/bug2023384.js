var bin = wasmTextToBinary(`
(module
  (func (export "test")
    (local i32)
    i32.const 1
    if
      local.get 0
      if
        i32.const 1
        local.set 0
      end
      block (result i32)
        local.get 0
        i32.const 0
        local.set 0
        br 0
      end
      if
      end
    end
  )
)
`)
var mod = new WebAssembly.Module(bin);
var ins = new WebAssembly.Instance(mod);
for (var i = 0; i < 100; i++) {
  ins.exports.test();
}
