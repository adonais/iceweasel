// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("x64") || getBuildConfiguration("simulator") || isAvxPresent(); include:codegen-x64-test.js

// A replace_lane fed by an extract_lane of at least its lane size moves the
// lane without a general register for 16-, 32- and 64-bit lanes.

for (const [replace, extract, expected] of [
  ["i32x4.replace_lane 0", "i32x4.extract_lane 3", `insertps \\$0xC0, %xmm1, %xmm0`],
  ["i32x4.replace_lane 2", "i32x4.extract_lane 1", `insertps \\$0x60, %xmm1, %xmm0`],
  ["i16x8.replace_lane 3", "i16x8.extract_lane_u 3", `pblendw \\$0x08, %xmm1, %xmm0`],
  ["i16x8.replace_lane 4", "i16x8.extract_lane_u 2",
   `pshufd \\$0x55, %xmm1, %xmm15
    pblendw \\$0x10, %xmm15, %xmm0`],
  ["i16x8.replace_lane 1", "i32x4.extract_lane 2",
   `pshufd \\$0xAA, %xmm1, %xmm15
    pslld \\$0x10, %xmm15
    pblendw \\$0x02, %xmm15, %xmm0`],
  ["i16x8.replace_lane 6", "i16x8.extract_lane_s 3",
   `pshufd \\$0x55, %xmm1, %xmm15
    psrld \\$0x10, %xmm15
    pblendw \\$0x40, %xmm15, %xmm0`],
  ["i64x2.replace_lane 1", "i64x2.extract_lane 0", `movlhps %xmm1, %xmm0`],
  ["i64x2.replace_lane 0", "i64x2.extract_lane 1", `movhlps %xmm1, %xmm0`],
  ["i64x2.replace_lane 1", "i64x2.extract_lane 1", `pblendw \\$0xF0, %xmm1, %xmm0`],
  ["i64x2.replace_lane 0", "i64x2.extract_lane 0", `pblendw \\$0x0F, %xmm1, %xmm0`],
]) {
  codegenTestX64_adhoc(
    `(module
       (func (export "f") (param v128 v128) (result v128)
         (${replace} (local.get 0) (${extract} (local.get 1)))))`,
    "f",
    expected);
}

codegenTestX64_adhoc(
  `(module
     (func (export "f") (param v128) (result v128)
       (i32x4.replace_lane 1 (local.get 0) (i32x4.extract_lane 2 (local.get 0)))))`,
  "f",
  `insertps \\$0x90, %xmm0, %xmm0`);

codegenTestX64_adhoc(
  `(module
     (func (export "f") (param v128) (result v128)
       (i64x2.replace_lane 0 (local.get 0) (i64x2.extract_lane 1 (local.get 0)))))`,
  "f",
  `movhlps %xmm0, %xmm0`);
