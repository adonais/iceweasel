gczeal(0);
gcparam('perZoneGCEnabled', 1);

const count = 5;

let g = newGlobal({newCompartment: true});
g.evaluate(`symbols = [];`);

function makeList() {
  let element = {};
  for (let i = 0; i < count; i++) {
    let symbol = Symbol();
    g.symbols.push(symbol);
    let wm = new WeakMap();
    wm.set(symbol, element);
    element = wm;
  }
  return element;
}

function checkList(list) {
  let element = list;
  for (let i = 0; i < count; i++) {
    assertEq(element instanceof WeakMap, true);
    assertEq(nondeterministicGetWeakMapSize(element), 1);
    let key = nondeterministicGetWeakMapKeys(element)[0];
    assertEq(key, g.symbols[count - i - 1]);
    element = element.get(key);
  }

  assertEq(element instanceof WeakMap, false);
}

let list = makeList();
checkList(list);

gc();
gc();

schedulezone(this);
schedulezone('atoms');

startgc(1);
while (gcstate() !== 'NotActive') { gcslice(1000); }

checkList(list);
