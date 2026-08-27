// |jit-test| --fast-warmup

function testCompareTA(ta) {
  function cmp(x, y) {
    return x ?? y;
  }

  for (var i = 0; i < 1000; i++) {
    var x = ta[i&1];
    var y = ta[i&3];

    assertEq(cmp(x, y), x ?? y);

    if (i === 10) {
      // Call with Undefined value to ensure Baseline IC sees different types.
      assertEq(cmp(x, undefined), x ?? undefined);
    }
  }
}

function testCompareString(array) {
  function cmp(x, y) {
    return x ?? y;
  }

  for (var i = 0; i < 1000; i++) {
    var x = String(array[i&1]);
    var y = String(array[i&3]);

    assertEq(cmp(x, y), x ?? y);

    if (i === 10) {
      // Call with Undefined value to ensure Baseline IC sees different types.
      assertEq(cmp(x, undefined), y ?? undefined);
    }
  }
}

function testCompareNumber(array) {
  function cmp(x, y) {
    return x ?? y;
  }

  for (var i = 0; i < 1000; i++) {
    var x = Number(array[i&1]) | 0; // Int32
    var y = Number(array[i&3]) + 0; // Double

    assertEq(cmp(x, y), x ?? y);

    if (i === 10) {
      // Call with Undefined value to ensure Baseline IC sees different types.
      assertEq(cmp(x, undefined), y ?? undefined);
    }
  }
}

const operators = [
  "==", "!=",
  "===", "!==",
  "<", "<=", ">", ">=",
];

const typedArrays = [
  // Int32 values.
  new Int32Array([-1, 0, 1, 100]),
  // Float32 values. (Maybe Float16 at some point.)
  new Float16Array([-1, 0, 1, NaN]),
  // Float32 values.
  new Float32Array([-1, 0, 1, NaN]),
  // Float64 values.
  new Float64Array([-1, 0, 1, NaN]),
  // BigInt values.
  new BigInt64Array([-1n, 0n, 1n, 0x7fff_ffff_ffff_ffffn]),
];

const strings = ["", "a", "ab", "AA"];

const numbers = [-1, 0, 1, NaN];

for (let op of operators) {
  for (let ta of typedArrays) {
    let source = String(testCompareTA).replaceAll("??", op);
    let test = Function(`return ${source}`)();
    test(ta);
  }

  {
    let source = String(testCompareString).replaceAll("??", op);
    let test = Function(`return ${source}`)();
    test(strings);
  }

  {
    let source = String(testCompareNumber).replaceAll("??", op);
    let test = Function(`return ${source}`)();
    test(numbers);
  }
}
