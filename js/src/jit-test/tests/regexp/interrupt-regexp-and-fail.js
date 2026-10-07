// |jit-test| skip-if: !('interruptRegexp' in this); exitstatus: 6

gczeal(0);
let re = /(.........).*?\1/;
for (var i = 0; i < 10; i++) {
  assertEq(re.test("abcdefghiabcdefghi"), true);
}

var s0 = "abcdefghi" + "abcdefgh".repeat(10) + "abcdefghi";
setInterruptCallback(() => {
  let re = /s(\s|.)*?e/
  var s = "s" + "a ".repeat(25000) + "e";
  assertEq(re.test(s), true);
  return false;
});
let result = interruptRegexp(/(.........).*?\1/, s0);
