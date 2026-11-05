// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

// An i64.const 0 lane replacement should use $zero instead of materializing
// the constant into a GPR.

for (const [replace, expected] of [
  ["i64x2.replace_lane 0 (local.get 0) (i64.const 0)", "vinsgr2vr\\.d \\$vr0, \\$zero, 0x0"],
  ["i64x2.replace_lane 1 (local.get 0) (i64.const 0)", "vinsgr2vr\\.d \\$vr0, \\$zero, 0x1"],
]) {
  codegenTestLOONG64_adhoc(
    `(module
       (func (export "f") (param v128) (result v128)
         (${replace})))`,
    "f",
    expected);
}
