// |jit-test| --wasm-compiler=optimizing

const NFILL = 1400;
const NVICT = 8;
const NOVER = 8;

let w = `(module
  (type $s (struct (field i32) (field (ref null $s))))
  (type $qa (array (mut i64)))
  (tag $t)
  (table $tb (export "tb") ${NFILL + 64} externref)
  (func $f (export "f") (param $mode i32) (result i32)
    (local $exn exnref)
    (local $de externref)
`;
for (let k = 0; k < NVICT; k++) w += `    (local $v${k} (ref null $s))\n`;
for (let i = 0; i < NOVER; i++) w += `    (local $a${i} (ref null $qa))\n`;
w += `    (if (i32.eqz (local.get $mode)) (then (return (i32.const 0))))\n`;
for (let k = 0; k < NVICT; k++) {
  w += `    (local.set $v${k} (struct.new $s (i32.const ${100 + k}) (ref.null $s)))\n`;
}
w += `    (local.set $de (extern.convert_any (struct.new $s (i32.const 1) (ref.null $s))))\n`;
w += `    (local.set $exn\n      (block $mk (result exnref)\n        (try_table (catch_all_ref $mk)\n          (throw $t))\n        (unreachable)))\n`;
for (let i = 0; i < NFILL; i++) {
  w += `    (table.set $tb (i32.const ${i}) (local.get $de))\n`;
}
w += `    (block $caught\n      (try_table (catch_all $caught)\n        (throw_ref (local.get $exn))))\n`;
for (let i = 0; i < NOVER; i++) {
  w += `    (local.set $a${i} (array.new $qa (i64.const 0x4141414141414140) (i32.const 12)))\n`;
}
for (let k = 0; k < NVICT; k++) {
  w += `    (table.set $tb (i32.const ${NFILL + k}) (extern.convert_any (local.get $v${k})))\n`;
}
for (let i = 0; i < NOVER; i++) {
  w += `    (table.set $tb (i32.const ${NFILL + 32 + i}) (extern.convert_any (local.get $a${i})))\n`;
}
w += `    (i32.const 0)))`;

try { gcparam("storeBufferEntries", 64); } catch (e) {}
try { gcparam("semispaceNurseryEnabled", 0); } catch (e) {}

const inst = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(w)));
inst.exports.f(0);

for (let attempt = 0; attempt < 20; attempt++) {
  minorgc();
  reportOutOfMemory();
  inst.exports.f(1);
  for (let k = 0; k < NVICT; k++) {
    inst.exports.tb.get(NFILL + k);
  }
}
