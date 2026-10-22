// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("arm64"); include:codegen-arm64-test.js

// Not-equal of an and against zero is one cmtst, also when the zero is shared.

codegenTestARM64_adhoc(
  `(module
     (func (export "f") (param v128 v128) (result v128)
       (i32x4.ne (v128.and (local.get 0) (local.get 1)) (v128.const i64x2 0 0))))`,
  "f",
  "cmtst   v0\\.4s, v0\\.4s, v1\\.4s");

codegenTestARM64_adhoc(
  `(module
     (func (export "f") (param v128 v128) (result v128)
       (i16x8.ne (v128.const i64x2 0 0) (v128.and (local.get 0) (local.get 1)))))`,
  "f",
  "cmtst   v0\\.8h, v0\\.8h, v1\\.8h");

// The zero also used elsewhere.
codegenTestARM64_adhoc(
  `(module
     (func (export "f") (param v128 v128) (result v128)
       (i32x4.add (v128.const i64x2 0 0)
                  (i32x4.ne (v128.and (local.get 0) (local.get 1))
                            (v128.const i64x2 0 0)))))`,
  "f",
  `movi    v2\\.2d, #0x0
cmtst   v0\\.4s, v0\\.4s, v1\\.4s
add     v0\\.4s, v2\\.4s, v0\\.4s`);
