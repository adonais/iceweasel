// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("arm64"); include:codegen-arm64-test.js

// A replace_lane fed by an extract_lane of at least its lane size moves the
// lane directly instead of through a general register.

for (const [replace, extract, expected] of [
  ["i8x16.replace_lane 15", "i32x4.extract_lane 3", "mov     v0\\.b\\[15\\], v1\\.b\\[12\\]"],
  ["i8x16.replace_lane 2", "i16x8.extract_lane_s 5", "mov     v0\\.b\\[2\\], v1\\.b\\[10\\]"],
  ["i8x16.replace_lane 7", "i8x16.extract_lane_u 9", "mov     v0\\.b\\[7\\], v1\\.b\\[9\\]"],
  ["i16x8.replace_lane 1", "i32x4.extract_lane 2", "mov     v0\\.h\\[1\\], v1\\.h\\[4\\]"],
  ["i32x4.replace_lane 0", "i32x4.extract_lane 3", "mov     v0\\.s\\[0\\], v1\\.s\\[3\\]"],
  ["i64x2.replace_lane 1", "i64x2.extract_lane 0", "mov     v0\\.d\\[1\\], v1\\.d\\[0\\]"],
]) {
  codegenTestARM64_adhoc(
    `(module
       (func (export "f") (param v128 v128) (result v128)
         (${replace} (local.get 0) (${extract} (local.get 1)))))`,
    "f",
    expected);
}

codegenTestARM64_adhoc(
  `(module
     (func (export "f") (param v128) (result v128)
       (i32x4.replace_lane 1 (local.get 0) (i32x4.extract_lane 2 (local.get 0)))))`,
  "f",
  "mov     v0\\.s\\[1\\], v0\\.s\\[2\\]");
