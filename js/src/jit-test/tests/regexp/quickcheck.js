const kIterations = 50;

function check(re, str, expected, index) {
  for (let i = 0; i < kIterations; i++) {
    re.lastIndex = 0;
    let m = re.exec(str);
    assertEq(m === null ? null : m[0], expected);
    if (m !== null && index !== undefined) {
      assertEq(m.index, index);
    }
    re.lastIndex = 0;
    assertEq(re.test(str), expected !== null);
  }
}

// Sweep lastIndex over the whole subject, including the position past the last
// character. This covers the cases where fewer than four characters remain for
// the mask, and where none remain at all.
function sweep(re, str, matchAt) {
  for (let i = 0; i < kIterations; i++) {
    for (let li = 0; li <= str.length; li++) {
      re.lastIndex = li;
      let m = re.exec(str);
      assertEq(m === null ? -1 : m.index, li === matchAt ? matchAt : -1);
    }
  }
}

sweep(/abcd/y, "xxabcd", 2);
sweep(/abcd/y, "abcd", 0);
sweep(/a/y, "za", 1);
sweep(/abcd/y, "abc", -1);
sweep(/中bcd/y, "x中bcd", 1);
sweep(/(?<=x)[a-c]/y, "xb", 1);
sweep(/(?<![0-9])[a-c]/y, "b", 0);

// A fixed prefix gives an exact four-character mask; shorter subjects must fall
// back to the bitset rather than reading past the end.
for (const s of ["", "a", "ab", "abc", "abcd", "abcde", "abce"]) {
  check(/^abcd/, s, s.startsWith("abcd") ? "abcd" : null, 0);
}

// An alternation over dissimilar leading characters: no bit is common to all of
// them, so the mask erodes and the bitset carries the rejection.
const punctuator = /--|\+\+|=>|\.{3}|[?~,:;\[\](){}]/y;
for (const op of ["--", "++", "=>", "...", "?", "~", ",", ":", ";", "[", "]",
                  "(", ")", "{", "}"]) {
  check(punctuator, op, op, 0);
}
for (const nonOp of ["a", "Z", "0", " ", "\t", "é", "中"]) {
  check(punctuator, nonOp, null);
}

// A negated class leads the pattern, so the bitset builder materializes the
// complement: every character outside the negated set must still match.
const jsxText = /[^<>{}]+/y;
for (const s of ["abc", " ", "é", "中"]) {
  check(jsxText, s, s, 0);
}
for (const s of ["<", ">", "{", "}"]) {
  check(jsxText, s, null);
}

// Case-insensitive patterns: a bitset built from the pattern character alone
// would wrongly reject the other case.
check(/^hsl/i, "hsl(1)", "hsl", 0);
check(/^hsl/i, "HSL(1)", "HSL", 0);
check(/^hsl/i, "HsL(1)", "HsL", 0);
check(/^hsl/i, "rgb", null);
check(/^ä/i, "Ä!", "Ä", 0);
check(/^ä/i, "x", null);
check(/k/iy, "K", "K", 0);
check(/k/iy, "x", null);

// Characters whose unicode case-fold partner is ASCII (U+212A KELVIN SIGN and
// U+017F LATIN SMALL LETTER LONG S) must not get the ASCII partner rejected.
// Case mappings require the Intl API.
if (typeof Intl !== "undefined") {
  check(/^\u212A/iu, "k", "k", 0);
  check(/^\u212A/iu, "K", "K", 0);
  check(/^\u212A/iu, "x", null);
  check(/^ſ/iu, "s", "s", 0);
  check(/^ſ/iu, "q", null);
}

// A leading lookaround constrains nothing on its own, so the filter has to come
// from the continuation.
check(/^(?![ab])[a-c]/, "c", "c", 0);
check(/^(?![ab])[a-c]/, "a", null);
check(/^(?![ab])[a-c]/, "z", null);
check(/^(?=[ab])[a-c]/, "b", "b", 0);
check(/^(?=[ab])[a-c]/, "c", null);
check(/^(?=a*)b/, "b", "b", 0);
check(/^(?=(?:))d/, "d", "d", 0);
check(/^(?=$|a)a/, "a", "a", 0);

// Two-byte subjects are never filtered, but must still behave.
check(/^[0-9]/, "中5", null);
check(/[0-9]/, "中5", "5", 1);

// A regexp that sees a two-byte subject first compiles twice, and only the
// one-byte compilation fills in the filters. Results must not depend on which
// encoding came first.
const encodingSwitch = /^[a-c]/;
check(encodingSwitch, "中b", null);
check(encodingSwitch, "zzz", null);
check(encodingSwitch, "bbb", "b", 0);

// Backreferences are not statically known.
check(/^(a|b)\1/, "bb", "bb", 0);
check(/^(.)\1/, "éé", "éé", 0);

// Boundary test for the first-character bitset (word 7, bit 31: \xff).
check(/^\xff/, "\xff", "\xff", 0);
check(/^\xff/, "a", null);
check(/^[a-z]/, "\xff", null);

// Dependent string input (slices/substrings):
const longStr = "prefix_abcdef_suffix";
const depMatch = longStr.substring(7, 13);
const depNoMatch = longStr.substring(0, 6);
check(/^abcd/y, depMatch, "abcd", 0);
check(/^abcd/y, depNoMatch, null);

// Boundary tests between ASCII and Latin-1 non-ASCII (word 3, bit 31 vs word 4, bit 0).
check(/^[\x80-\xff]/, "\x80", "\x80", 0);
check(/^[\x80-\xff]/, "\x7f", null);

{
  const re = /abcd/y;
  re.lastIndex = 5;
  assertEq(re.test("a"), false);
  re.lastIndex = 5;
  assertEq(re.exec("a"), null);
}

// Warm up sticky patterns reaching JIT with lastIndex > 0:
for (let i = 0; i < kIterations; i++) {
  const re = /abcd/y;
  re.lastIndex = 2;
  assertEq(re.test("xxabcd"), true);
  re.lastIndex = 2;
  assertEq(re.test("xxabce"), false);
  re.lastIndex = 2;
  assertEq(re.test("xx"), false);
  re.lastIndex = 5;
  assertEq(re.test("xx"), false);
}
