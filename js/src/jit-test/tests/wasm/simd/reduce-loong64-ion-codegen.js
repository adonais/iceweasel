// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

const NopIns = `andi         \\$zero, \\$zero, 0x0`;

// Test encoding of the any_true and all_true operations.

for (const [op, insn] of [
  ["v128.any_true",  "vsetnez\\.v"   ],
  ["i8x16.all_true", "vsetallnez\\.b"],
  ["i16x8.all_true", "vsetallnez\\.h"],
  ["i32x4.all_true", "vsetallnez\\.w"],
  ["i64x2.all_true", "vsetallnez\\.d"],
]) {
  codegenTestLOONG64_adhoc(
    `(module (func (export "f") (param v128) (result i32) (${op} (local.get 0))))`,
    "f",
    `${insn} \\$fcc0, \\$vr0
     movcf2gr \\$a0, \\$fcc0`);
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (param i32) (result i32)
       (if (result i32) (${op} (v128.load (local.get 0)))
         (then (i32.const 1)) (else (i32.const 2)))))`,
    "f",
    `bstrpick\\.d    \\$t6, \\$a0, 0x1f, 0x0
     vldx            \\$vr0, \\$t6, \\$s7
     ${insn}         \\$fcc0, \\$vr0
     bceqz           \\$fcc0, \\d+ -> ${HEX}+
     bge             \\$zero, \\$zero, \\d+ -> ${HEX}+
     ${NopIns}
     addi.w          \\$a0, \\$zero, 1
     beq             \\$zero, \\$zero, \\d+ -> ${HEX}+
     ${NopIns}
     addi.w          \\$a0, \\$zero, 2`);
}
