// |jit-test| --fast-warmup

// Same source with different flags shares the statics' input and source, so
// the lazily replayed match must use the flags of the latest execution. Reading
// the statics clears their lazy source, so the later cases run two executions
// before reading to cover the case where only the flags changed.

const s = "Ab a Ab a";
const insensitive = /a/gi;
const sensitive = /a/g;
const sticky = /a/y;
const unanchored = /a/;

for (let i = 0; i < 500; i++) {
  insensitive.lastIndex = 0;
  assertEq(insensitive.exec(s).index, 0);
  assertEq(RegExp.lastMatch, "A");
  assertEq(RegExp.leftContext, "");

  sensitive.lastIndex = 0;
  assertEq(sensitive.exec(s).index, 3);
  assertEq(RegExp.lastMatch, "a");
  assertEq(RegExp.leftContext, "Ab ");

  sticky.lastIndex = 8;
  assertEq(sticky.exec(s).index, 8);
  assertEq(RegExp.leftContext, "Ab a Ab ");

  assertEq(unanchored.exec(s).index, 3);
  assertEq(RegExp.leftContext, "Ab ");

  assertEq(s.replace(insensitive, "-"), "-b - -b -");
  assertEq(RegExp.leftContext, "Ab a Ab ");
  assertEq(s.replace(/A/g, "-"), "-b a -b a");
  assertEq(RegExp.leftContext, "Ab a ");

  insensitive.lastIndex = 0;
  insensitive.exec(s);
  sensitive.lastIndex = 0;
  sensitive.exec(s);
  assertEq(RegExp.lastMatch, "a");
  assertEq(RegExp.leftContext, "Ab ");

  sensitive.lastIndex = 0;
  sensitive.exec(s);
  insensitive.lastIndex = 0;
  insensitive.exec(s);
  assertEq(RegExp.lastMatch, "A");
  assertEq(RegExp.leftContext, "");

  s.replace(/a/gi, "-");
  s.replace(/a/g, "-");
  assertEq(RegExp.leftContext, "Ab a Ab ");
  assertEq(RegExp.lastMatch, "a");

  unanchored.exec(s);
  sticky.lastIndex = 0;
  sticky.test(s);
  /a/i.exec(s);
  assertEq(RegExp.lastMatch, "A");
  assertEq(RegExp.leftContext, "");
}
