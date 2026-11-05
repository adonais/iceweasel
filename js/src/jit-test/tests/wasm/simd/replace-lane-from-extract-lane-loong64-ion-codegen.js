// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("loong64"); include:codegen-loong64-test.js

// A replace_lane fed by an extract_lane of at least its lane size moves the
// lane directly instead of through a general register.

for (const [replace, extract, expected] of [
  ["i8x16.replace_lane 15", "i32x4.extract_lane 3",   "vextrins\\.b \\$vr0, \\$vr1, 0xfc"],
  ["i8x16.replace_lane 2",  "i16x8.extract_lane_s 5", "vextrins\\.b \\$vr0, \\$vr1, 0x2a"],
  ["i8x16.replace_lane 7",  "i8x16.extract_lane_u 9", "vextrins\\.b \\$vr0, \\$vr1, 0x79"],
  ["i16x8.replace_lane 1",  "i32x4.extract_lane 2",   "vextrins\\.h \\$vr0, \\$vr1, 0x14"],
  ["i32x4.replace_lane 0",  "i32x4.extract_lane 3",   "vextrins\\.w \\$vr0, \\$vr1, 0x3" ],
  ["i64x2.replace_lane 1",  "i64x2.extract_lane 0",   "vextrins\\.d \\$vr0, \\$vr1, 0x10"],
  ["i64x2.replace_lane 0",  "i64x2.extract_lane 1",   "vextrins\\.d \\$vr0, \\$vr1, 0x1" ],
]) {
  codegenTestLOONG64_adhoc(
    `(module
       (func (export "f") (param v128 v128) (result v128)
         (${replace} (local.get 0) (${extract} (local.get 1)))))`,
    "f",
    expected);
}

// Self-replacements.
for (const [replace, extract, expected] of [
  ["i8x16.replace_lane 15", "i32x4.extract_lane 3",   "vextrins\\.b \\$vr0, \\$vr0, 0xfc"],
  ["i8x16.replace_lane 2",  "i16x8.extract_lane_s 5", "vextrins\\.b \\$vr0, \\$vr0, 0x2a"],
  ["i8x16.replace_lane 7",  "i8x16.extract_lane_u 9", "vextrins\\.b \\$vr0, \\$vr0, 0x79"],
  ["i16x8.replace_lane 1",  "i32x4.extract_lane 2",   "vextrins\\.h \\$vr0, \\$vr0, 0x14"],
  ["i32x4.replace_lane 0",  "i32x4.extract_lane 3",   "vextrins\\.w \\$vr0, \\$vr0, 0x3" ],
  ["i64x2.replace_lane 1",  "i64x2.extract_lane 0",   "vextrins\\.d \\$vr0, \\$vr0, 0x10"],
  ["i64x2.replace_lane 0",  "i64x2.extract_lane 1",   "vextrins\\.d \\$vr0, \\$vr0, 0x1" ],
]) {
  codegenTestLOONG64_adhoc(
    `(module
       (func (export "f") (param v128) (result v128)
         (${replace} (local.get 0) (${extract} (local.get 0)))))`,
    "f",
    expected);
}

// Here, lane movement would have rewritten the original register for local 0.
// If it must live out of the movement, a new register has to be allocated.
for (const [replace, extract, op, liveOut, expected] of [
  [
    "i8x16.replace_lane 15", "i32x4.extract_lane 3", "i8x16.add", true,
    `vori\\.b \\$vr2, \\$vr0, 0x0
     vextrins\\.b \\$vr2, \\$vr1, 0xfc
     vadd\\.b \\$vr0, \\$vr2, \\$vr0`
  ],
  [
    "i16x8.replace_lane 1", "i32x4.extract_lane 2", "i16x8.add", false,
    `vextrins\\.h \\$vr0, \\$vr1, 0x14
     vadd\\.h \\$vr0, \\$vr0, \\$vr1`
  ],
  [
    "i32x4.replace_lane 0", "i32x4.extract_lane 1", "i32x4.add", true,
    `vori\\.b \\$vr2, \\$vr0, 0x0
     vextrins\\.w \\$vr2, \\$vr1, 0x1
     vadd\\.w \\$vr0, \\$vr2, \\$vr0`
  ],
  [
    "i32x4.replace_lane 0", "i32x4.extract_lane 1", "i32x4.add", false,
    `vextrins\\.w \\$vr0, \\$vr1, 0x1
     vadd\\.w \\$vr0, \\$vr0, \\$vr1`
  ],
]) {
  codegenTestLOONG64_adhoc(
    `(module
       (func (export "f") (param v128 v128) (result v128)
         (${op}
           (${replace} (local.get 0) (${extract} (local.get 1)))
           (local.get ${liveOut ? 0 : 1}))))`,
    "f",
    expected);
}
