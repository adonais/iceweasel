// |jit-test| slow

var moduleText = `(module
  (type $i16arr (array (mut i16)))
  (func $fromCharCodeArray
    (import "wasm:js-string" "fromCharCodeArray")
    (param (ref null $i16arr) i32 i32)
    (result (ref extern)))
  (func (export "makeArr")
        (param $len i32) (param $val i32) (result (ref $i16arr))
    (array.new $i16arr (local.get $val) (local.get $len))
  )
  (func (export "arrToStr")
        (param $arr (ref null $i16arr)) (param $start i32) (param $end i32)
        (result externref)
    (call $fromCharCodeArray (local.get $arr)
                             (local.get $start) (local.get $end))
  )
)`;

var inst = wasmEvalText(moduleText, {}, {builtins: ['js-string']});

// Set nursery to 4MB for multi-chunk mode (ChunkSize = 1MB).
// After minor GC, chunks 1-3 get ASAN MakeNoAccess poisoning.
gcparam("minNurseryBytes", 4 * 1024 * 1024);
gcparam("maxNurseryBytes", 4 * 1024 * 1024);
gcparam("semispaceNurseryEnabled", 0);

// Array: 80 i16 elements -> storageBytes = 168 bytes (8 header + 160 data).
// This is OOL (exceeds WasmArrayObject_MaxInlineBytes ~96-112) but within
// MaxNurseryTrailerSize (256), so buffer is nursery-allocated.
// Value: 0x100 (non-Latin1) forces char16_t string (no deflation to Latin1).
var ARRAY_ELEMS = 80;
// Substring length 10: fits JSThinInlineString for char16_t (max ~12 chars).
// The inline path allocates the cell first (can GC), then PodCopy from source.
var STR_LEN = 10;

gc();

// Tight loop: each iteration uses ~256 bytes of nursery.
// With 4MB nursery, fills after ~16000 iterations.
// When the nursery fills, there's a window where array+buffer fit in nursery
// but the string cell allocation overflows it:
//   NoGC fails -> CanGC fallback with stale StableWasmArrayObjectElements ->
//   minor GC moves buffer -> PodCopy reads from stale pointer -> UAF.

for (var i = 0; i < 50000; i++) {
  var arr = inst.exports.makeArr(ARRAY_ELEMS, 0x45); // 0x45 == 'E'
  // If we're picking up poisoned data from the old nursery, then either
  // arrToStr should (C++)-assert, or if it doesn't, the assertEq below should
  // fail.
  let str = inst.exports.arrToStr(arr, 0, STR_LEN);
  assertEq(str, "EEEEEEEEEE");
}
