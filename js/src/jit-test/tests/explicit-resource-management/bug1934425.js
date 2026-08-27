async function foo() {
  let resources = [
    { [Symbol.asyncDispose]: () => 0},
    0
  ];
  try {
    for (await using d of resources);
  } catch {}
}
foo();
