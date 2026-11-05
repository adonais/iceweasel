// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

// Widening and splat loads load directly into VR without going through GPR.

for (const [op, insn] of [
  ["load8x8_s",  "vsllwil\\.h\\.b"  ],
  ["load8x8_u",  "vsllwil\\.hu\\.bu"],
  ["load16x4_s", "vsllwil\\.w\\.h"  ],
  ["load16x4_u", "vsllwil\\.wu\\.hu"],
  ["load32x2_s", "vsllwil\\.d\\.w"  ],
  ["load32x2_u", "vsllwil\\.du\\.wu"],
]) {
  // Offset is an i32 in GPR.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (param i32) (result v128) (v128.${op} (local.get 0))))`,
    "f",
    `bstrpick\\.d \\$t6, \\$a0, 0x1f, 0x0
     fldx\\.d \\$f0, \\$s7, \\$t6
     ${insn} \\$vr0, \\$vr0, 0x0`);
  // Offset can be encoded as an si12.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (result v128) (v128.${op} (i32.const 16))))`,
    "f",
    `fld\\.d \\$f0, \\$s7, 16
     ${insn} \\$vr0, \\$vr0, 0x0`);
  // Offset can not be encoded as an si12.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (result v128) (v128.${op} (i32.const 4096))))`,
    "f",
    `lu12i\\.w \\$t6, 1
     fldx\\.d \\$f0, \\$s7, \\$t6
     ${insn} \\$vr0, \\$vr0, 0x0`);
}

for (const [op, width] of [
  ["load8_splat",  "b"],
  ["load16_splat", "h"],
  ["load32_splat", "w"],
  ["load64_splat", "d"],
]) {
  // Offset is an i32 in GPR.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (param i32) (result v128) (v128.${op} (local.get 0))))`,
    "f",
    `bstrpick\\.d \\$t6, \\$a0, 0x1f, 0x0
     add\\.d \\$t7, \\$s7, \\$t6
     vldrepl\\.${width} \\$vr0, \\$t7, 0`);
  // Offset can be encoded as an siN.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (result v128) (v128.${op} (i32.const 16))))`,
    "f",
    `vldrepl\\.${width} \\$vr0, \\$s7, 16`);
  // Offset can not be encoded as an siN.
  codegenTestLOONG64_adhoc(
    `(module (memory 1) (func (export "f") (result v128) (v128.${op} (i32.const 4096))))`,
    "f",
    `lu12i\\.w \\$t6, 1
     add\\.d \\$t6, \\$s7, \\$t6
     vldrepl\\.${width} \\$vr0, \\$t6, 0`);
}
