oomTest(function() {
  new WebAssembly.Module(
    wasmTextToBinary(`
      (type (;0;) (func (param externref i31ref) (result nullexternref f64)))
      (import "imports" "z" (memory (;0;) 1))
      (export "w0" (func 0))
      (func (;0;) (type 0) (param externref i31ref) (result nullexternref f64)
          (local nullexternref i64 i32 i64 f64)
          i64.const 0
          local.set 3
          i32.const 0
          local.set 4
          local.get 4
          local.get 3
          i64.atomic.rmw32.sub_u offset=259
          local.set 5
          local.get 2
          local.get 6
      )
    `)
  );
})
