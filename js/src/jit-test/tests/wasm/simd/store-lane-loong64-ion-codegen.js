// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

// Store lane directly from the VR to memory without going through GPR first.

for (const [op, type, lane] of [
  ["store8_lane",  "b", "0xf"],
  ["store16_lane", "h", "0x7"],
  ["store32_lane", "w", "0x3"],
  ["store64_lane", "d", "0x1"],
]) {
  codegenTestLOONG64_adhoc(
    `(module (memory 1)
       (func (export "f") (param i32 v128)
         (v128.${op} ${lane} (local.get 0) (local.get 1))))`,
    "f",
    `bstrpick\\.d \\$t6, \\$a0, 0x1f, 0x0
     add\\.d \\$t7, \\$s7, \\$t6
     vstelm\\.${type} \\$vr0, \\$t7, 0, ${lane}`);
  codegenTestLOONG64_adhoc(
    `(module (memory 1)
       (func (export "f") (param i32 v128)
         (v128.${op} offset=8 ${lane} (local.get 0) (local.get 1))))`,
    "f",
    `bstrpick\\.d \\$t6, \\$a0, 0x1f, 0x0
     add\\.d \\$t7, \\$s7, \\$t6
     vstelm\\.${type} \\$vr0, \\$t7, 8, ${lane}`);
  codegenTestLOONG64_adhoc(
    `(module (memory 1)
       (func (export "f") (param i32 v128)
         (v128.${op} offset=2000 ${lane} (local.get 0) (local.get 1))))`,
    "f",
    `bstrpick\\.d \\$t6, \\$a0, 0x1f, 0x0
     add\\.d \\$t7, \\$s7, \\$t6
     addi\\.d \\$t7, \\$t7, 2000
     vstelm\\.${type} \\$vr0, \\$t7, 0, ${lane}`);
}
