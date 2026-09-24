const COUNT = 100;

const g = newGlobal({newCompartment: true});
const dbg = new Debugger(g);

const mods = [];
for (let i = 0; i < COUNT; i++) {
  const m = g.parseModule(`export const x = ${i};`, `mod${i}.js`);
  moduleLoadAndLink(m);
  moduleEvaluate(m);
  mods.push(m);
}
drainJobQueue();

assertEq(dbg.findSources().length, COUNT);

for (let i = 0; i < COUNT; i++) {
  if (i % 2) {
    mods[i] = null;
  }
}

gczeal(14, 1);
gc();
gczeal(0);

const sources = dbg.findSources();
assertEq(sources.length, COUNT / 2);
for (const source of sources) {
  assertEq(typeof source.text, "string");
}
