// |jit-test| skip-if: !('interruptRegexp' in this)

gczeal(0);
let re = /(.........).*?\1/;
for (var i = 0; i < 10; i++) {
  assertEq(re.test("abcdefghiabcdefghi"), true);
}

var s0 = "abcdefghi" + "abcdefgh".repeat(10) + "abcdefghi";
var interrupted = false;
setInterruptCallback(() => {
  interrupted = true;
  startgc(10,'shrinking');
  finishgc()
  return true;
});
let result = interruptRegexp(/(.........).*?\1/, s0);
assertEq(result[0], s0)
assertEq(result[1], "abcdefghi");
assertEq(interrupted, true);
