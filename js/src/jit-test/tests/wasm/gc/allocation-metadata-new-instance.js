// Instances created after allocation tracking is enabled must record metadata
// for objects they allocate.

enableTrackAllocations();

let {createStruct, createArray} = wasmEvalText(`(module
    (type $s (struct))
    (type $a (array i32))
    (func (export "createStruct") (result anyref)
        struct.new_default $s
    )
    (func (export "createArray") (param i32) (result anyref)
        i32.const 0
        local.get 0
        array.new $a
    )
)`).exports;

function assertWasmFrame(obj) {
  let frame = getAllocationMetadata(obj);
  assertEq(frame.source.endsWith("> WebAssembly.Module"), true);
}

for (let i = 0; i < 20; i++) {
  assertWasmFrame(createStruct());
  assertWasmFrame(createArray(i));
}
