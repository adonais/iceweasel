// |jit-test| skip-if: !('interruptRegexp' in this)

gczeal(0);
let re = /(.........).*?\1/;
for (var i = 0; i < 10; i++) {
  assertEq(re.test("abcdefghiabcdefghi"), true);
}

var s = "abcdefghi" + "abcdefgh".repeat(10) + "abcdefghi";
var interrupted = false;
setInterruptCallback(() => {
  interrupted = true;

  let re = /s(\s|.)*?e/
  var s = "s" + "a ".repeat(25000) + "e";
  assertEq(re.test(s), true);

  return true;
});
let result = interruptRegexp(/(.........).*?\1/, s);
assertEq(result[0], s)
assertEq(result[1], "abcdefghi");
assertEq(interrupted, true);
