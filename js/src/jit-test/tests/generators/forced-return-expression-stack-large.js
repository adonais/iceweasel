// The number of expression stack values to pop for a forced return can exceed
// JSOp::PopN's uint16 operand for a call with the maximum number of arguments.

evaluate(`
function* f1() {
  yield Math.max(${"0,".repeat(65534)} yield 3);
}
function* f2() {
  for (const x of [1]) {
    yield Math.max(${"0,".repeat(65534)} yield 5);
  }
}
`);
for (var i = 0; i < 5; i++) {
  var it = f1();
  assertEq(it.next().value, 3);
  assertEq(it.return(i).value, i);
  it = f2();
  assertEq(it.next().value, 5);
  assertEq(it.return(i).value, i);
}
