// |jit-test| --fast-warmup

function testCompareString(array) {
  for (var i = 0; i < 1000; i++) {
    var x = array[i % array.length];
    var constant = CONSTANT;

    // Compute expected result without creating an IC with multiple stubs.
    var expected = typeof x === "string" ? (x ?? constant) : (1 ?? 0);

    // Constant is right-hand side operand.
    assertEq(x ?? constant, expected);

    // Constant is left-hand side operand.
    assertEq(constant ?? x, expected);
  }
}

function testCompareInt32(array) {
  for (var i = 0; i < 1000; i++) {
    var x = array[i % array.length];
    var constant = CONSTANT;

    // Compute expected result without creating an IC with multiple stubs.
    var expected = typeof x === "number" && ((x|0)===x) ? (x ?? constant) : (1 ?? 0);

    // Constant is right-hand side operand.
    assertEq(x ?? constant, expected);

    // Constant is left-hand side operand.
    assertEq(constant ?? x, expected);
  }
}

function testCompareObject(array) {
  for (var i = 0; i < 1000; i++) {
    var x = array[i % array.length];
    var constant = CONSTANT;

    // Compute expected result without creating an IC with multiple stubs.
    var expected = typeof x === "object" && x !== null ? (x ?? constant) : (1 ?? 0);

    // Constant is right-hand side operand.
    assertEq(x ?? constant, expected);

    // Constant is left-hand side operand.
    assertEq(constant ?? x, expected);
  }
}

function testCompareUndefined(array) {
  for (var i = 0; i < 1000; i++) {
    var x = array[i % array.length];
    var constant = CONSTANT;

    // Compute expected result without creating an IC with multiple stubs.
    var expected = x ?? undefined;

    // Constant is right-hand side operand.
    assertEq(x ?? constant, expected);

    // Constant is left-hand side operand.
    assertEq(constant ?? x, expected);
  }
}

function testCompareNull(array) {
  for (var i = 0; i < 1000; i++) {
    var x = array[i % array.length];
    var constant = CONSTANT;

    // Compute expected result without creating an IC with multiple stubs.
    var expected = x ?? null;

    // Constant is right-hand side operand.
    assertEq(x ?? constant, expected);

    // Constant is left-hand side operand.
    assertEq(constant ?? x, expected);
  }
}

const operators = [
  "===",
  "!==",
];

const strings = [
  // Empty string.
  "",

  // Single character strings.
  "a", // ASCII
  "a", // Latin-1
  "a", // Two-byte

  // Small strings which can be compared with inline assembly.
  "abc", // ASCII
  "äöü", // Latin-1
  "\u{100}\u{101}\u{102}", // Two-byte

  // Large strings.
  "a".repeat(100), // ASCII
  "ä".repeat(100), // Latin-1
  "\u{100}".repeat(100), // Two-byte
];

const int32s = [
  -0x8000_0000,
  -1,
  0,
  1,
   0x7fff_ffff,
];

const objects = {
  globalThis,
  Math,
};

const values = [
  undefined, null, 123, NaN, false, {}, 0n, "", Symbol(),
];

const strings_and_values = [...strings, ...values];
const int32s_and_values = [...int32s, ...values];
const objects_and_values = [...Object.values(objects), ...values];
const undefined_and_values = [undefined, ...values];
const null_and_values = [null, ...values];

for (let op of operators) {
  for (let string of strings) {
    let source = String(testCompareString).replaceAll("??", op).replaceAll("CONSTANT", `"${string}"`);
    let test = Function(`return ${source}`)();
    test(strings_and_values);
  }

  for (let int32 of int32s) {
    let source = String(testCompareInt32).replaceAll("??", op).replaceAll("CONSTANT", `${int32}`);
    let test = Function(`return ${source}`)();
    test(int32s_and_values);
  }

  for (let object of Object.keys(objects)) {
    let source = String(testCompareObject).replaceAll("??", op).replaceAll("CONSTANT", `${object}`);
    let test = Function(`return ${source}`)();
    test(objects_and_values);
  }

  {
    let source = String(testCompareUndefined).replaceAll("??", op).replaceAll("CONSTANT", `undefined`);
    let test = Function(`return ${source}`)();
    test(undefined_and_values);
  }

  {
    let source = String(testCompareNull).replaceAll("??", op).replaceAll("CONSTANT", `null`);
    let test = Function(`return ${source}`)();
    test(null_and_values);
  }
}
