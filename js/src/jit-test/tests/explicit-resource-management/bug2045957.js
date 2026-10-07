async function* gen() {
  for (await using _ of [{[Symbol.asyncDispose]: () => Promise.resolve()}]) {
    yield 1;
  }
}
let result = 0;
async function test() {
  for (let i = 0; i < 20; i++) {
    const it = gen();
    assertEq((await it.next()).value, 1);
    const res = await it.return(42);
    assertEq(res.done, true);
    result += res.value;
  }
}
test();
drainJobQueue();
assertEq(result, 840);
