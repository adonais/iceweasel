let {createStructIL, createStructOOL, createArray, createArrayFixed} = wasmEvalText(`(module
    (type $sIL (struct))
    (type $sOOL (struct (field ${'i32 '.repeat(100)})))
    (type $a (array i32))
    (func (export "createStructIL") (result anyref)
        struct.new_default $sIL
    )
    (func (export "createStructOOL") (result anyref)
        struct.new_default $sOOL
    )
    (func (export "createArray") (param i32) (result anyref)
        i32.const 0
        local.get 0
        array.new $a
    )
    (func (export "createArrayFixed") (result anyref)
        array.new_fixed $a 0
    )
)`).exports;

enableTrackAllocations();

function assertWasmFrame(obj) {
    let frame = getAllocationMetadata(obj);
    assertEq(frame.source.endsWith("> WebAssembly.Module"), true);
}

assertWasmFrame(createStructIL());
assertWasmFrame(createStructOOL());
assertWasmFrame(createArray(0));
assertWasmFrame(createArray(1));
assertWasmFrame(createArray(500));
assertWasmFrame(createArrayFixed());
