// |jit-test| skip-if: !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("riscv64"); include:codegen-riscv64-test.js

const WasmTrapIns = `csrwi     csr_cycle, 0x6`;

// Signed 32-bit division with constants.
const i32_div_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `sext\\.w  a0, a0`,
  },
  {
    divisor: 2,
    expected: `srliw     t4, a0, 31
               addw      t4, t4, a0
               sraiw     a0, t4, 1`,
  },
  {
    divisor: 4,
    expected: `sraiw     t4, a0, 31
               srliw     t4, t4, 30
               addw      t4, t4, a0
               sraiw     a0, t4, 2`,
  },

  // Division by -1 needs an overflow check.
  {
    divisor: -1,
    expected: `lui       t4, 0xfff80000
               bne       a0, t4, 8 -> 0x${HEX}+
               ${WasmTrapIns}
               negw      a0, a0`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               lui       t4, 0x55555
               addiw     t4, t4, 1366
               mul       a0, t0, t4
               srli      a0, a0, 32
               sraiw     t4, t0, 31
               subw      a0, a0, t4`,
  },
  {
    divisor: 5,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               lui       t4, 0x66666
               addiw     t4, t4, 1639
               mul       a0, t0, t4
               srai      a0, a0, 33
               sraiw     t4, t0, 31
               subw      a0, a0, t4`,
  },
  {
    divisor: 7,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               lui       t4, 0xfff92492
               addiw     t4, t4, 1171
               mul       a0, t0, t4
               srli      a0, a0, 32
               addw      a0, a0, t0
               sraiw     a0, a0, 2
               sraiw     t4, t0, 31
               subw      a0, a0, t4`,
  },
  {
    divisor: 9,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               lui       t4, 0x38e39
               addiw     t4, t4, -455
               mul       a0, t0, t4
               srai      a0, a0, 33
               sraiw     t4, t0, 31
               subw      a0, a0, t4`,
  },
];

for (let {divisor, expected} of i32_div_s) {
  let divs32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.div_s (local.get 0) (i32.const ${divisor}))))`
  codegenTestRISCV64_adhoc(divs32, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 1) {
    let divs32 =
      `(module
         (func (export "f") (param i32) (result i32)
           (i32.div_s (local.get 0) (i32.const -${divisor}))))`
    codegenTestRISCV64_adhoc(divs32, 'f', expected + `
      negw      a0, a0`
    );
  }
}

// Unsigned 32-bit division with constants.
const i32_div_u = [
  // Division by zero.
  {
    divisor: 0,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `sext\\.w  a0, a0`,
  },
  {
    divisor: 2,
    expected: `srliw     a0, a0, 1`,
  },
  {
    divisor: 4,
    expected: `srliw     a0, a0, 2`,
  },

  // // Other divisors.
  {
    divisor: 3,
    expected:  `sext\\.w  t1, a0
                sext\\.w  t0, t1
                slli      a0, t0, 32
                lui       t4, 0xfffaaaab
                addiw     t4, t4, -1365
                slli      t4, t4, 32
                mulhu     a0, a0, t4
                srli      a0, a0, 33`,
  },
  {
    divisor: 5,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               slli      a0, t0, 32
               lui       t4, 0xfffccccd
               addiw     t4, t4, -819
               slli      t4, t4, 32
               mulhu     a0, a0, t4
               srli      a0, a0, 34`,
  },
  {
    divisor: 7,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
              (zext\\.w  a0, t0)
            | (slli      a0, t0, 32
               srli      a0, a0, 32)
               lui       t4, 0x24925
               addiw     t4, t4, -1755
               mul       a0, a0, t4
               srli      a0, a0, 32
               sub       t4, t0, a0
               srliw     t4, t4, 1
               add       a0, a0, t4
               srli      a0, a0, 2`,
  },
  {
    divisor: 9,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
              (zext\\.w  a0, t0)
            | (slli      a0, t0, 32
               srli      a0, a0, 32)
               lui       t4, 0x38e39
               addiw     t4, t4, -455
               mul       a0, a0, t4
               srli      a0, a0, 33`,
  },

  // Special case: Zero (additional) shift amount.
  {
    divisor: 641,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
              (zext\\.w  a0, t0)
            | (slli      a0, t0, 32
               srli      a0, a0, 32)
               lui       t4, 0x664
               addiw     t4, t4, -639
               mul       a0, a0, t4
               srli      a0, a0, 32`,
  },
];

for (let {divisor, expected} of i32_div_u) {
  let divu32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.div_u (local.get 0) (i32.const ${divisor}))))`
  codegenTestRISCV64_adhoc(divu32, 'f', expected);
}

// Signed 64-bit division with constants.
const i64_div_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mv        t1, a0
               mv        t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, a0`,
  },
  {
    divisor: 2,
    expected: `srli      t4, a0, 63
               add       t4, t4, a0
               srai      a0, t4, 1`,
  },
  {
    divisor: 4,
    expected: `srai      t4, a0, 63
               srli      t4, t4, 62
               add       t4, t4, a0
               srai      a0, t4, 2`,
  },
  {
    divisor: 0x1_0000_0000,
    expected: `srai      t4, a0, 63
               srli      t4, t4, 32
               add       t4, t4, a0
               srai      a0, t4, 32`,
  },

  // Division by -1 needs an overflow check.
  {
    divisor: -1,
    expected: `(bseti    t4, zero, 63)
            | (li        t4, -1
               slli      t4, t4, 63)
               bne       a0, t4, 8 -> 0x${HEX}+
               ${WasmTrapIns}
               neg       a0, a0`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected:  `mv        t1, a0
                mv        t0, t1
                lui       t4, 0x55555
                addiw?    t4, t4, 1366
                lui       t5, 0x55555
                addiw?    t5, t5, 1365
                slli      t5, t5, 32
                add       t4, t4, t5
                mulh      a0, t0, t4
                srai      t4, t0, 63
                sub       a0, a0, t4`,
  },
  {
    divisor: 5,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0x66666
               addiw?    t4, t4, 1639
               lui       t5, 0x66666
               addiw?    t5, t5, 1638
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      a0, a0, 1
               srai      t4, t0, 63
               sub       a0, a0, t4`,
  },
  {
    divisor: 7,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0x24925
               addiw?    t4, t4, -1755
               lui       t5, 0x49249
               addiw?    t5, t5, 585
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      a0, a0, 1
               srai      t4, t0, 63
               sub       a0, a0, t4`,
  },
  {
    divisor: 9,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0x71c72
               addiw?    t4, t4, -910
               lui       t5, 0x1c71c
               addiw?    t5, t5, 1820
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      t4, t0, 63
               sub       a0, a0, t4`,
  },
  {
    divisor: 0x3_0000_0000,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffaaaab
               addiw?    t4, t4, -1365
               lui       t5, 0x2aaab
               addiw?    t5, t5, -1365
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      a0, a0, 31
               srai      t4, t0, 63
               sub       a0, a0, t4`,
  },
];

for (let {divisor, expected} of i64_div_s) {
  let divs64 =
    `(module
       (func (export "f") (param i64) (result i64)
         (i64.div_s (local.get 0) (i64.const ${divisor}))))`
  codegenTestRISCV64_adhoc(divs64, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 1) {
    let divs64 =
      `(module
         (func (export "f") (param i64) (result i64)
           (i64.div_s (local.get 0) (i64.const -${divisor}))))`
    codegenTestRISCV64_adhoc(divs64, 'f', expected + `
      neg       a0, a0`);
  }
}

// Unsigned 64-bit division with constants.
const i64_div_u = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mv        t1, a0
               mv        t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, a0`,
  },
  {
    divisor: 2,
    expected: `srli      a0, a0, 1`,
  },
  {
    divisor: 4,
    expected: `srli      a0, a0, 2`,
  },
  {
    divisor: 0x1_0000_0000,
    expected: `srli      a0, a0, 32`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected:  `mv        t1, a0
                mv        t0, t1
                lui       t4, 0xfffaaaab
                addiw?    t4, t4, -1365
                slli      t5, t4, 32
                add       t4, t4, t5
                mulhu     a0, t0, t4
                srli      a0, a0, 1`,
  },
  {
    divisor: 5,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffccccd
               addiw?    t4, t4, -819
               slli      t5, t4, 32
               add       t4, t4, t5
               mulhu     a0, t0, t4
               srli      a0, a0, 2`,
  },
  {
    divisor: 7,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfff92492
               addiw?    t4, t4, 1171
               lui       t5, 0x24925
               addiw?    t5, t5, -1755
               slli      t5, t5, 32
               add       t4, t4, t5
               mulhu     a0, t0, t4
               sub       t4, t0, a0
               srli      t4, t4, 1
               add       a0, a0, t4
               srli      a0, a0, 2`,
  },
  {
    divisor: 9,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfff8e38e
               addiw?    t4, t4, 911
               lui       t5, 0xfffe38e4
               addiw?    t5, t5, -1820
               slli      t5, t5, 32
               add       t4, t4, t5
               mulhu     a0, t0, t4
               srli      a0, a0, 3`,
  },
  {
    divisor: 0x3_0000_0000,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffaaaab
               addiw?    t4, t4, -1365
               slli      t5, t4, 32
               add       t4, t4, t5
               mulhu     a0, t0, t4
               srli      a0, a0, 33`,
  },

  // Special case: Zero shift amount.
  {
    divisor: 274177,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0x1ea
               addiw     t4, t4, -1927
               slli      t4, t4, 13
               addi      t4, t4, -1587
               slli      t4, t4, 12
               addi      t4, t4, 257
               mulhu     a0, t0, t4`,
  },
];

for (let {divisor, expected} of i64_div_u) {
  let divu64 =
    `(module
       (func (export "f") (param i64) (result i64)
         (i64.div_u (local.get 0) (i64.const ${divisor}))))`
  codegenTestRISCV64_adhoc(divu64, 'f', expected);
}

//////////////

// Signed 32-bit remainder with constants.
const i32_rem_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, zero`,
  },
  {
    divisor: 2,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0x1
               j         16 -> 0x${HEX}+
               negw      a0, a0
               andi      a0, a0, 0x1
               negw      a0, a0`,
  },
  {
    divisor: 4,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0x3
               j         16 -> 0x${HEX}+
               negw      a0, a0
               andi      a0, a0, 0x3
               negw      a0, a0`,
  },
  {
    divisor: 0x100,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0xff
               j         16 -> 0x${HEX}+
               negw      a0, a0
               andi      a0, a0, 0xff
               negw      a0, a0`,
  },
  {
    divisor: 0x10000,
    expected: `blt       a0, zero, 12|16 -> 0x${HEX}+
              (zext\\.h  a0, a0)
            | (slli      a0, a0, 48
               srli      a0, a0, 48)
               j         16|20 -> 0x${HEX}+
               negw      a0, a0
              (zext\\.h  a0, a0)
            | (slli      a0, a0, 48
               srli      a0, a0, 48)
               negw      a0, a0`,
  },
  {
    divisor: 0x8000_0000,
    expected: `blt       a0, zero, 16 -> 0x${HEX}+
               slli      a0, a0, 33
               srli      a0, a0, 33
               j         20 -> 0x${HEX}+
               negw      a0, a0
               slli      a0, a0, 33
               srli      a0, a0, 33
               negw      a0, a0`,
  },
];

for (let {divisor, expected} of i32_rem_s) {
  let rems32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.rem_s (local.get 0) (i32.const ${divisor}))))`
  codegenTestRISCV64_adhoc(rems32, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 0) {
    let rems32 =
      `(module
         (func (export "f") (param i32) (result i32)
           (i32.rem_s (local.get 0) (i32.const -${divisor}))))`
    codegenTestRISCV64_adhoc(rems32, 'f', expected);
  }
}

// Unigned 32-bit remainder with constants.
const u32_rem_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `sext\\.w  t1, a0
               sext\\.w  t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, zero`,
  },
  {
    divisor: 2,
    expected: `andi      a0, a0, 0x1`,
  },
  {
    divisor: 4,
    expected: `andi      a0, a0, 0x3`,
  },
  {
    divisor: 0x100,
    expected: `andi      a0, a0, 0xff`,
  },
  {
    divisor: 0x10000,
    expected: `(zext\\.h  a0, a0)
             | (slli      a0, a0, 48
                srli      a0, a0, 48)`,
  },
  {
    divisor: 0x8000_0000,
    expected: `slli      a0, a0, 33
               srli      a0, a0, 33`,
  },
];

for (let {divisor, expected} of u32_rem_s) {
  let remu32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.rem_u (local.get 0) (i32.const ${divisor}))))`
  codegenTestRISCV64_adhoc(remu32, 'f', expected);
}

// Signed 64-bit remainder with constants.
const i64_rem_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mv        t1, a0
               mv        t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, zero`,
  },
  {
    divisor: 2,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0x1
               j         16 -> 0x${HEX}+
               neg       a0, a0
               andi      a0, a0, 0x1
               neg       a0, a0`,
  },
  {
    divisor: 4,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0x3
               j         16 -> 0x${HEX}+
               neg       a0, a0
               andi      a0, a0, 0x3
               neg       a0, a0`,
  },
  {
    divisor: 0x100,
    expected: `blt       a0, zero, 12 -> 0x${HEX}+
               andi      a0, a0, 0xff
               j         16 -> 0x${HEX}+
               neg       a0, a0
               andi      a0, a0, 0xff
               neg       a0, a0`,
  },
  {
    divisor: 0x10000,
    expected: `blt       a0, zero, 12|16 -> 0x${HEX}+
              (zext\\.h  a0, a0)
            | (slli      a0, a0, 48
               srli      a0, a0, 48)
               j         16|20 -> 0x${HEX}+
               neg       a0, a0
              (zext\\.h  a0, a0)
            | (slli      a0, a0, 48
               srli      a0, a0, 48)
               neg       a0, a0`,
  },
  {
    divisor: 0x8000_0000,
    expected: `blt       a0, zero, 16 -> 0x${HEX}+
               slli      a0, a0, 33
               srli      a0, a0, 33
               j         20 -> 0x${HEX}+
               neg       a0, a0
               slli      a0, a0, 33
               srli      a0, a0, 33
               neg       a0, a0`,
  },
  {
    divisor: 0x1_0000_0000,
    expected: `blt       a0, zero, 12|16 -> 0x${HEX}+
              (zext\\.w  a0, a0)
            | (slli      a0, a0, 32
               srli      a0, a0, 32)
               j         16|20 -> 0x${HEX}+
               neg       a0, a0
              (zext\\.w  a0, a0)
            | (slli      a0, a0, 32
               srli      a0, a0, 32)
               neg       a0, a0`,
  },
  {
    divisor: 0x8000_0000_0000_0000n,
    expected: `blt       a0, zero, 16 -> 0x${HEX}+
               slli      a0, a0, 1
               srli      a0, a0, 1
               j         20 -> 0x${HEX}+
               neg       a0, a0
               slli      a0, a0, 1
               srli      a0, a0, 1
               neg       a0, a0`,
  },

  // Other divisors.
  {
    divisor: 0x3_0000_0000,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffaaaab
               addiw?    t4, t4, -1365
               lui       t5, 0x2aaab
               addiw?    t5, t5, -1365
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      a0, a0, 31
               srai      t4, t0, 63
               sub       a0, a0, t4
              (sh1add    a0, a0, a0
               slli      a0, a0, 32)
            | (li        t4, 3
               slli      t4, t4, 32
               mul       a0, a0, t4)
               sub       a0, t0, a0`,
    negative: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffaaaab
               addiw?    t4, t4, -1365
               lui       t5, 0x2aaab
               addiw?    t5, t5, -1365
               slli      t5, t5, 32
               add       t4, t4, t5
               mulh      a0, t0, t4
               srai      a0, a0, 31
               srai      t4, t0, 63
               sub       a0, a0, t4
               neg       a0, a0
               li        t4, -3
               slli      t4, t4, 32
               mul       a0, a0, t4
               sub       a0, t0, a0`,
  },
];

for (let {divisor, expected, negative = expected} of i64_rem_s) {
  let rems64 =
    `(module
       (func (export "f") (param i64) (result i64)
         (i64.rem_s (local.get 0) (i64.const ${divisor}))))`
  codegenTestRISCV64_adhoc(rems64, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 0) {
    let rems64 =
      `(module
         (func (export "f") (param i64) (result i64)
           (i64.rem_s (local.get 0) (i64.const -${divisor}))))`
    codegenTestRISCV64_adhoc(rems64, 'f', negative);
  }
}

// Unsigned 64-bit remainder with constants.
const i64_rem_u = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mv        t1, a0
               mv        t0, t1
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `mv        a0, zero`,
  },
  {
    divisor: 2,
    expected: `andi      a0, a0, 0x1`,
  },
  {
    divisor: 4,
    expected: `andi      a0, a0, 0x3`,
  },
  {
    divisor: 0x100,
    expected: `andi      a0, a0, 0xff`,
  },
  {
    divisor: 0x10000,
    expected: `(zext\\.h  a0, a0)
             | (slli      a0, a0, 48
                srli      a0, a0, 48)`,
  },
  {
    divisor: 0x8000_0000,
    expected: `slli      a0, a0, 33
               srli      a0, a0, 33`,
  },
  {
    divisor: 0x1_0000_0000,
    expected: `(zext\\.w  a0, a0)
             | (slli      a0, a0, 32
                srli      a0, a0, 32)`,
  },
  {
    divisor: 0x8000_0000_0000_0000n,
    expected: `slli      a0, a0, 1
               srli      a0, a0, 1`,
  },

  // Other divisors.
  {
    divisor: 0x3_0000_0000,
    expected: `mv        t1, a0
               mv        t0, t1
               lui       t4, 0xfffaaaab
               addiw?    t4, t4, -1365
               slli      t5, t4, 32
               add       t4, t4, t5
               mulhu     a0, t0, t4
               srli      a0, a0, 33
              (sh1add    a0, a0, a0
               slli      a0, a0, 32)
            | (li        t4, 3
               slli      t4, t4, 32
               mul       a0, a0, t4)
               sub       a0, t0, a0`,
  },
];

for (let {divisor, expected} of i64_rem_u) {
  let remu64 =
    `(module
       (func (export "f") (param i64) (result i64)
         (i64.rem_u (local.get 0) (i64.const ${divisor}))))`
  codegenTestRISCV64_adhoc(remu64, 'f', expected);
}
