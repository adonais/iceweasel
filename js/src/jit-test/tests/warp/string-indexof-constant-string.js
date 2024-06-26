// Test case to cover String.prototype.indexOf with a constant search string.
//
// String.prototype.indexOf with a short (≤32 characters) constant string is
// optimised during lowering.

function* characters(...ranges) {
  for (let [start, end] of ranges) {
    for (let i = start; i <= end; ++i) {
      yield i;
    }
  }
}

const ascii = [...characters(
  [0x41, 0x5A], // A..Z
  [0x61, 0x7A], // a..z
  [0x30, 0x39], // 0..9
)];

const latin1 = [...characters(
  [0xC0, 0xFF], // À..ÿ
)];

const twoByte = [...characters(
  [0x100, 0x17E], // Ā..ž
)];

function toRope(s) {
  try {
    return newRope(s[0], s.substring(1));
  } catch {}
  // newRope can fail when |s| fits into an inline string. In that case simply
  // return the input.
  return s;
}

function atomize(s) {
  return Object.keys({[s]: 0})[0];
}

for (let i = 1; i <= 32; ++i) {
  let strings = [ascii, latin1, twoByte].flatMap(codePoints => [
    // Same string as the input.
    String.fromCodePoint(...codePoints.slice(0, i)),

    // Same length as the input, but a different string.
    String.fromCodePoint(...codePoints.slice(1, i + 1)),

    // Shorter string than the input.
    String.fromCodePoint(...codePoints.slice(0, i - 1)),

    // Longer string than the input.
    String.fromCodePoint(...codePoints.slice(0, i + 1)),
  ]).flatMap(x => [
    x,
    toRope(x),
    newString(x, {twoByte: true}),
    atomize(x),
  ]);

  for (let codePoints of [ascii, latin1, twoByte]) {
    let str = String.fromCodePoint(...codePoints.slice(0, i));

    let fn = Function("strings", `
      const expected = strings.map(x => {
        // Prevent Warp compilation when computing the expected results.
        with ({}) ;
        return x.indexOf("${str}") === 0;
      });

      for (let i = 0; i < 250; ++i) {
        let idx = i % strings.length;
        let str = strings[idx];

        let actual = str.indexOf("${str}") === 0;
        if (actual !== expected[idx]) throw new Error();
      }
    `);
    fn(strings);

    let fnNot = Function("strings", `
      const expected = strings.map(x => {
        // Prevent Warp compilation when computing the expected results.
        with ({}) ;
        return x.indexOf("${str}") !== 0;
      });

      for (let i = 0; i < 250; ++i) {
        let idx = i % strings.length;
        let str = strings[idx];

        let actual = str.indexOf("${str}") !== 0;
        if (actual !== expected[idx]) throw new Error();
      }
    `);
    fnNot(strings);
  }
}
