// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("arm64"); include:codegen-arm64-test.js

// Compares against an all-zero constant use the compare-with-zero forms, also
// when the constant is shared.

for (const [op, expected] of [
  ["i8x16.eq", "cmeq    v0\\.16b, v0\\.16b, #0"],
  ["i16x8.ne", "cmtst   v0\\.8h, v0\\.8h, v0\\.8h"],
  ["i32x4.lt_s", "cmlt    v0\\.4s, v0\\.4s, #0"],
  ["i32x4.gt_u", "cmtst   v0\\.4s, v0\\.4s, v0\\.4s"],
  ["i64x2.ge_s", "cmge    v0\\.2d, v0\\.2d, #0"],
  ["f32x4.gt", "fcmgt   v0\\.4s, v0\\.4s, #0\\.0"],
  ["f64x2.le", "fcmle   v0\\.2d, v0\\.2d, #0\\.0"],
]) {
  codegenTestARM64_adhoc(
    `(module
       (func (export "f") (param v128) (result v128)
         (${op} (local.get 0) (v128.const i64x2 0 0))))`,
    "f",
    expected);
}

// The zero also used elsewhere.
codegenTestARM64_adhoc(
  `(module
     (func (export "f") (param v128 v128) (result v128)
       (i32x4.add (v128.const i64x2 0 0)
                  (i32x4.lt_s (local.get 0) (v128.const i64x2 0 0)))))`,
  "f",
  `movi    v1\\.2d, #0x0
cmlt    v0\\.4s, v0\\.4s, #0
add     v0\\.4s, v1\\.4s, v0\\.4s`);
