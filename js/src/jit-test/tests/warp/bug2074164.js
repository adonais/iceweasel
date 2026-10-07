// |jit-test| --no-threads; --fast-warmup

function run(target) {
  let g = newGlobal({newCompartment: true});
  g.eval(`
    let numGlobalProps = Object.keys(globalThis).length;
    let padding = ${target} - numGlobalProps;
    var value = 0;
    function nonStrict() { return this; }
    function assign(receiver) {
      value = 1;
      if (nonStrict.call(receiver)) {
        value = 2;
      }
    }
    const object = {};
    for (let i = 0; i < padding; i++) {
      globalThis["property" + i] = i;
    }
    for (let i = 0; i < 100; i++) {
      assign(object);
    }
    assign(1n);
    assertEq(value, 2);
`);
}

let bestGuess = 996;
for (let i = bestGuess - 30; i < bestGuess + 30; i++) {
  run(i);
}
