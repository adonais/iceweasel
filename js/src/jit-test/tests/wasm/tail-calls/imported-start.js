// An imported function that ends in a return call to a wider stack-argument
// signature must not leave the import wrapper reading its frame slots with a
// stale stack pointer.
const count = 32;
const args = Array.from({length: count}, (_, i) =>
  `(i64.const ${i + 1})`).join(" ");

const provider = wasmEvalText(`(module
  (global $result (export "result") (mut i64) (i64.const 0))
  (func $save (param ${"i64 ".repeat(count)})
    (global.set $result (local.get ${count - 1})))
  (func (export "start")
    ${args}
    return_call $save)
)`);

wasmEvalText(`(module
  (import "m" "start" (func $start))
  (start $start)
)`, {m: {start: provider.exports.start}});

assertEq(provider.exports.result.value, 32n);
