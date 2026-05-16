const { assertStackTrace } = WasmHelpers;

let e;
let suspending = new WebAssembly.Suspending(() => {
    e = new Error();
    Promise.resolve()
});
let {run} = wasmEvalText(`(module
    (func $suspending (import "" "suspending"))
    (func $a
        call $suspending
    )
    (func $b
        call $a
    )
    (func $c
        call $b
    )
    (func $run (export "run")
        call $c
    )
)`, {"": {suspending}}).exports;
WebAssembly.promising(run)();

print(e.stack);
// TODO: these are not correct, we need to hide self-hosted wasm code.
assertStackTrace(e, ["suspending<","wasm-function[1]","a","b","c","run","wasm-function[2]","wasm-function[1]",""]);
