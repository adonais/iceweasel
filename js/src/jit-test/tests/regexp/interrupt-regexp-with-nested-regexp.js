// |jit-test| skip-if: !('interruptRegexp' in this)

gczeal(0);
let re = /(.........).*?\1/;
for (var i = 0; i < 10; i++) {
  assertEq(re.test("abcdefghiabcdefghi"), true);
}

var s = "abcdefghi" + "abcdefgh".repeat(10) + "abcdefghi";

function test() {
  let result = interruptRegexp(/(.........).*?\1/, s);
  assertEq(result[0], s)
  assertEq(result[1], "abcdefghi");
}

let interruptCount = 0;
const TargetInterruptCount = 5;
setInterruptCallback(() => {
  interruptCount++;
  if (interruptCount < TargetInterruptCount) {
    test();
  }
  return true;
});

test();
assertEq(interruptCount, TargetInterruptCount);
