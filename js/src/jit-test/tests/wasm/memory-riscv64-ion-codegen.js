// |jit-test| test-also=--wasm-compiler=optimizing --disable-wasm-huge-memory; skip-if: !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("riscv64"); include:codegen-riscv64-test.js

// Test that loads/stores at friendly constant offsets yield expected code.
//
// WASM HeapReg is "s7".

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 1000))))`,
    "f",
    `lw        a0, 1000\\(s7\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load offset=1000 (i32.const 1000))))`,
    "f",
    `lw        a0, 2000\\(s7\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store (i32.const 1000) (local.get 0))))`,
    "f",
    `sw        a0, 1000\\(s7\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store offset=1000 (i32.const 1000) (local.get 0))))`,
    "f",
    `sw        a0, 2000\\(s7\\)`);

// Unfriendly offsets are first loaded into a scratch register.

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 4000))))`,
    "f",
    `addi      t4, s7, 2000
     lw        a0, 2000\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load offset=2000 (i32.const 4000))))`,
    "f",
    `lui       t4, 0x1
     add       t4, s7, t4
     lw        a0, 1904\\(t4\\)`);

// Stores

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store (i32.const 4000) (local.get 0))))`,
    "f",
    `addi      t4, s7, 2000
     sw        a0, 2000\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store offset=1000 (i32.const 4000) (local.get 0))))`,
    "f",
    `lui       t4, 0x1
     add       t4, s7, t4
     sw        a0, 904\\(t4\\)`);

// Various special cases.

// Offset is largest positive Int32 which requires no full materialization.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 0x7fff_f7ff))))`,
    "f",
    `lui       t4, 0x7ffff
     add       t4, s7, t4
     lw        a0, 2047\\(t4\\)`,
    {no_prefix: true});

// Offset is smallest positive Int32 which requires full materialization.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 0x7fff_f800))))`,
    "f",
    `lui       t4, 0xfff80000
     addiw     t4, t4, -2048
     add       t4, s7, t4
     lw        a0, 0\\(t4\\)`,
    {no_prefix: true});

// Offset is INT32_MAX.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 0x7fff_ffff))))`,
    "f",
    `lui       t4, 0xfff80000
     addiw     t4, t4, -1
     add       t4, s7, t4
     lw        a0, 0\\(t4\\)`,
    {no_prefix: true});

// Static offset and dynamic offset are INT32_MAX.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load offset=0x7fff_ffff (i32.const 0x7fff_ffff))))`,
    "f",
    `(li        t4, 1
     slli      t4, t4, 32
     addi      t4, t4, -2)
  | (li        t4, -2
     zext.w    t4, t4)
     add       t5, s7, t4
     lw        a0, 0\\(t5\\)`,
    {no_prefix: true});

// Offset is negative.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const -1))))`,
    "f",
    `li        t4, -1
     srli      t4, t4, 32
     add       t5, s7, t4
     lw        a0, 0\\(t5\\)`,
    {no_prefix: true});

// Offset is INT32_MIN.
codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (result i32)
         (i32.load (i32.const 0x8000_0000))))`,
    "f",
    `(li        t4, 1
     slli      t4, t4, 31)
  | (bseti     t4, zero, 31)
     add       t5, s7, t4
     lw        a0, 0\\(t5\\)`,
     {no_prefix: true});
