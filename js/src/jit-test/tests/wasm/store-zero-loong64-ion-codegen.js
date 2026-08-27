// |jit-test| test-also=--wasm-compiler=optimizing --disable-wasm-huge-memory; skip-if: !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

// Test that zero stores use $zero directly rather than
// materializing zero into a general-purpose register first.

// i32 scalar stores.

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store (local.get 0) (i32.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.w        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store8 (local.get 0) (i32.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.b        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i32.store16 (local.get 0) (i32.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.h        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

// i64 scalar stores.

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store (local.get 0) (i64.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.d        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store8 (local.get 0) (i64.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.b        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store16 (local.get 0) (i64.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.h        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

codegenTestLOONG64_adhoc(
    `(module
       (memory 1)
       (func (export "f") (param i32)
         (i64.store32 (local.get 0) (i64.const 0))))`,
    "f",
    `bstrpick\\.d   \\$t6, \\$a0, 0x1f, 0x0
     stx\\.w        \\$zero, \\$s7, \\$t6`,
    {no_prefix: true});

// Reference null stores.

codegenTestLOONG64_adhoc(
    `(module
       (type $s (struct (field (mut anyref))))
       (func (export "f") (param (ref $s))
         (struct.set $s 0 (local.get 0) (ref.null any))))`,
    "f",
    `st\\.d         \\$zero, \\$a1, 16`,
    {no_prefix: true, no_suffix: true});

codegenTestLOONG64_adhoc(
    `(module
       (type $s (struct (field (mut funcref))))
       (func (export "f") (param (ref $s))
         (struct.set $s 0 (local.get 0) (ref.null func))))`,
    "f",
    `st\\.d         \\$zero, \\$a1, 16`,
    {no_prefix: true, no_suffix: true});

codegenTestLOONG64_adhoc(
    `(module
       (type $a (array (mut anyref)))
       (func (export "f") (param (ref $a)) (param i32)
         (array.set $a (local.get 0) (local.get 1) (ref.null any))))`,
    "f",
    `alsl\\.d       \\$t6, \\$a4, \\$a1, 0x3
     st\\.d         \\$zero, \\$t6, 0`,
    {no_prefix: true, no_suffix: true});
