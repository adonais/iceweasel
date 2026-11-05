// |jit-test| --fast-warmup; --enable-legacy-regexp

// A RegExp without legacy features invalidates the statics without updating
// them, so the next execution with the same input and source must restore them.

class MyRegExp extends RegExp {}

const str = "xa(b)c abc";
const plain = /a(b)c/;
const subclassed = new MyRegExp("a(b)c");

for (let i = 0; i < 200; i++) {
  assertEq(plain.test(str), true);
  assertEq(RegExp.$1, "b");
  assertEq(RegExp.leftContext, "xa(b)c ");

  assertEq(subclassed.test(str), true);
  let threw = false;
  try {
    RegExp.$1;
  } catch (e) {
    threw = e instanceof TypeError;
  }
  assertEq(threw, true);

  assertEq(plain.test(str), true);
  assertEq(RegExp.$1, "b");
  assertEq(RegExp.lastMatch, "abc");
}
