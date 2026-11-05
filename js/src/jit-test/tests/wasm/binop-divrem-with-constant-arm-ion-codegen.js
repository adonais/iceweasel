// |jit-test| skip-if: !hasDisassembler() || wasmCompileMode() != "ion" || !getBuildConfiguration("arm"); include:codegen-arm-test.js

const WasmTrapIns = `constant pool begin \\(length 0\\) \\[undefined insn\\]`;

// Signed 32-bit division with constants.
const i32_div_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mov r2, r0
               mov r1, r2
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: ``,
  },
  {
    divisor: 2,
    expected: `add ip, r0, r0, lsr #31
               mov r0, ip, asr #1`,
  },
  {
    divisor: 4,
    expected: `mov ip, r0, asr #31
               add ip, r0, ip, lsr #30
               mov r0, ip, asr #2`,
  },

  // Division by -1 needs an overflow check.
  {
    divisor: -1,
    expected: `cmp r0, #-2147483648
               bne \\+8 -> 0x${HEX}+
               ${WasmTrapIns}
               rsb r0, r0, #0`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #21846
               movt ip, #21845
               smull ip, r0, ip, r1
               sub r0, r0, r1, asr #31`,
  },
  {
    divisor: 5,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #26215
               movt ip, #26214
               smull ip, r0, ip, r1
               mov r0, r0, asr #1
               sub r0, r0, r1, asr #31`,
  },
  {
    divisor: 7,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #9363
               movt ip, #37449
               smull ip, r0, ip, r1
               add r0, r0, r1
               mov r0, r0, asr #2
               sub r0, r0, r1, asr #31`,
  },
  {
    divisor: 9,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #36409
               movt ip, #14563
               smull ip, r0, ip, r1
               mov r0, r0, asr #1
               sub r0, r0, r1, asr #31`,
  },
];

for (let {divisor, expected} of i32_div_s) {
  let divs32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.div_s (local.get 0) (i32.const ${divisor}))))`
  codegenTestARM_adhoc(divs32, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 1) {
    let divs32 =
      `(module
         (func (export "f") (param i32) (result i32)
           (i32.div_s (local.get 0) (i32.const -${divisor}))))`
    codegenTestARM_adhoc(divs32, 'f', expected + `
      rsb r0, r0, #0`
    );
  }
}

// Unsigned 32-bit division with constants.
const i32_div_u = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mov r2, r0
               mov r1, r2
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: ``,
  },
  {
    divisor: 2,
    expected: `mov r0, r0, lsr #1`,
  },
  {
    divisor: 4,
    expected: `mov r0, r0, lsr #2`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #43691
               movt ip, #43690
               umull ip, r0, ip, r1
               mov r0, r0, lsr #1`,
  },
  {
    divisor: 5,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #52429
               movt ip, #52428
               umull ip, r0, ip, r1
               mov r0, r0, lsr #2`,
  },
  {
    divisor: 7,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #18725
               movt ip, #9362
               umull ip, r0, ip, r1
               sub ip, r1, r0
               mov ip, ip, lsr #1
               add r0, r0, ip
               mov r0, r0, lsr #2`,
  },
  {
    divisor: 9,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #36409
               movt ip, #14563
               umull ip, r0, ip, r1
               mov r0, r0, lsr #1`,
  },

  // Special case: Zero (additional) shift amount.
  {
    divisor: 641,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #15745
               movt ip, #102
               umull ip, r0, ip, r1`,
  },
];

for (let {divisor, expected} of i32_div_u) {
  let divu32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.div_u (local.get 0) (i32.const ${divisor}))))`
  codegenTestARM_adhoc(divu32, 'f', expected);
}

// Signed 32-bit remainder with constants.
const i32_rem_s = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mov r2, r0
               mov r1, r2
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `movs r0, r0
               beq \\+16 -> 0x${HEX}+
               rsbmi r0, r0, #0
               and r0, r0, #0
               rsbmis r0, r0, #0`,
  },
  {
    divisor: 2,
    expected: `movs r0, r0
               beq \\+16 -> 0x${HEX}+
               rsbmi r0, r0, #0
               and r0, r0, #1
               rsbmis r0, r0, #0`,
  },
  {
    divisor: 4,
    expected: `movs r0, r0
               beq \\+16 -> 0x${HEX}+
               rsbmi r0, r0, #0
               and r0, r0, #3
               rsbmis r0, r0, #0`,
  },
  {
    divisor: 0x100,
    expected: `movs r0, r0
               beq \\+16 -> 0x${HEX}+
               rsbmi r0, r0, #0
               and r0, r0, #255
               rsbmis r0, r0, #0`,
  },
  {
    divisor: 0x10000,
    expected: `movs r0, r0
               beq \\+20 -> 0x${HEX}+
               rsbmi r0, r0, #0
               bic r0, r0, #-16777216
               bic r0, r0, #16711680
               rsbmis r0, r0, #0`,
  },
  {
    divisor: 0x80000000,
    expected: `movs r0, r0
               beq \\+16 -> 0x${HEX}+
               rsbmi r0, r0, #0
               bic r0, r0, #-2147483648
               rsbmis r0, r0, #0`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #21846
               movt ip, #21845
               smull ip, r0, ip, r1
               sub r0, r0, r1, asr #31
               mov ip, #3
               mls r0, ip, r0, r1`,
    negative: `mov r2, r0
               mov r1, r2
               movw ip, #21846
               movt ip, #21845
               smull ip, r0, ip, r1
               sub r0, r0, r1, asr #31
               rsb r0, r0, #0
               mvn ip, #2
               mls r0, ip, r0, r1`,
  },
];

for (let {divisor, expected, negative = expected} of i32_rem_s) {
  let rems32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.rem_s (local.get 0) (i32.const ${divisor}))))`
  codegenTestARM_adhoc(rems32, 'f', expected);

  // Test negative divisors, too.
  if (divisor > 0) {
    let rems32 =
      `(module
         (func (export "f") (param i32) (result i32)
           (i32.rem_s (local.get 0) (i32.const -${divisor}))))`
    codegenTestARM_adhoc(rems32, 'f', negative);
  }
}

// Unsigned 32-bit remainder with constants.
const i32_rem_u = [
  // Division by zero.
  {
    divisor: 0,
    expected: `mov r2, r0
               mov r1, r2
               ${WasmTrapIns}`,
  },

  // Power of two divisor
  {
    divisor: 1,
    expected: `and r0, r0, #0`,
  },
  {
    divisor: 2,
    expected: `and r0, r0, #1`,
  },
  {
    divisor: 4,
    expected: `and r0, r0, #3`,
  },
  {
    divisor: 0x100,
    expected: `and r0, r0, #255`,
  },
  {
    divisor: 0x10000,
    expected: `bic r0, r0, #-16777216
               bic r0, r0, #16711680`,
  },
  {
    divisor: 0x80000000,
    expected: `bic r0, r0, #-2147483648`,
  },

  // Other divisors.
  {
    divisor: 3,
    expected: `mov r2, r0
               mov r1, r2
               movw ip, #43691
               movt ip, #43690
               umull ip, r0, ip, r1
               mov r0, r0, lsr #1
               mov ip, #3
               mls r0, ip, r0, r1`,
  },
];

for (let {divisor, expected} of i32_rem_u) {
  let remu32 =
    `(module
       (func (export "f") (param i32) (result i32)
         (i32.rem_u (local.get 0) (i32.const ${divisor}))))`
  codegenTestARM_adhoc(remu32, 'f', expected);
}
