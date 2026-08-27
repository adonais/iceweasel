// |jit-test| skip-if: !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("riscv64"); include:codegen-riscv64-test.js

// Test that storing an i32.const 0 uses zero directly rather than
// materialising zero into a general-purpose register first.

// i32 scalar stores with zero constant

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store (local.get 0) (i32.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sw        zero, 0\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store8 (local.get 0) (i32.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sb        zero, 0\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store16 (local.get 0) (i32.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sh        zero, 0\\(t4\\)`);

// i64 scalar stores with zero constant

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store (local.get 0) (i64.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sd        zero, 0\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store8 (local.get 0) (i64.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sb        zero, 0\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store16 (local.get 0) (i64.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sh        zero, 0\\(t4\\)`);

codegenTestRISCV64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store32 (local.get 0) (i64.const 0))))`,
    "f",
    `add\\.uw  t4, a0, s7
     sw        zero, 0\\(t4\\)`);

// anyref/funcref null stores use zero register directly

codegenTestRISCV64_adhoc(
    `(module
       (type $s (struct (field (mut anyref))))
       (func (export "f") (param (ref $s))
         (struct.set $s 0 (local.get 0) (ref.null any))))`,
    "f",
    `sd        zero, 16\\(a1\\)`,
    {no_prefix: true, no_suffix: true});

codegenTestRISCV64_adhoc(
    `(module
       (type $s (struct (field (mut funcref))))
       (func (export "f") (param (ref $s))
         (struct.set $s 0 (local.get 0) (ref.null func))))`,
    "f",
    `sd        zero, 16\\(a1\\)`,
    {no_prefix: true, no_suffix: true});

codegenTestRISCV64_adhoc(
    `(module
       (type $a (array (mut anyref)))
       (func (export "f") (param (ref $a)) (param i32)
         (array.set $a (local.get 0) (local.get 1) (ref.null any))))`,
    "f",
    `sh3add    t4, t2, a1
     sd        zero, 0\\(t4\\)`,
    {no_prefix: true, no_suffix: true});
