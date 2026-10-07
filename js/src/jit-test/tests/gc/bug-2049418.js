gczeal(0);

const gB = newGlobal({newCompartment: true});
const gA = newGlobal({newCompartment: true});
const gC = newGlobal({newCompartment: true});
const gD = newGlobal({newCompartment: true});

const NT = 64;
const NFILLER = 200000;

gC.evaluate(`
  var pairs = [];
  for (let i = 0; i < ${NT}; i++) pairs.push(transplantableObject());
  var objects = pairs.map(p => p.object);
`);

gB.evaluate(`
  var savedWRs = [];
  function setup(targets) {
    for (let i = 0; i < targets.length; i++) savedWRs.push(new WeakRef(targets[i]));
  }
`);
gB.setup(gC.objects);

gA.evaluate(`
  function filler(n) {
    let keep = [];
    for (let i = 0; i < n; i++) { let o = {i}; keep.push(o); new WeakRef(o); }
    return keep;
  }
`);

finishgc();
schedulezone(gB);
gc("zone");

let keepA = gA.filler(NFILLER);
gB.eval("savedWRs = undefined; setup = undefined;");

finishgc();
minorgc();

schedulezone(gA);
schedulezone(gB);
startgc(1);

let transplanted = false;
while (gcstate() !== "NotActive") {
  gcslice(10000, {dontStart: true});
  if (!transplanted && gcstate() === "Sweep" && gcstate(gA) === "Sweep" && gcstate(gB) === "MarkBlackOnly") {
    for (let k = 0; k < NT; k++) gC.pairs[k].transplant(gD);
    transplanted = true;
  }
}

minorgc();
