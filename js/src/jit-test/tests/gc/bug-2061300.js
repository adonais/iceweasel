gczeal(0);

const NT = 300;
const gF = newGlobal({newCompartment: true});
const gC = newGlobal({newCompartment: true});
const gW = newGlobal({newCompartment: true});
const gD = newGlobal({newCompartment: true});

gC.evaluate(`
  var pairs = [];
  for (let i = 0; i < 300; i++) pairs.push(transplantableObject());
  var extras = [];
  for (let i = 0; i < 3000; i++) extras.push({e: i});
`);

gW.evaluate(`
  var arr = [];
  function take(o) { arr.push(o); }
  function dropAll() { arr.length = 0; }
  function groom(n) {
    var pat = String.fromCharCode(0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0xFE, 0xFF);
    var s23 = (pat + pat + pat).substring(0, 23);
    var s15 = (pat + pat).substring(0, 15);
    var opts = { tenured: true };
    var keepStr = new Array(2 * n);
    for (var i = 0; i < n; i++) {
      keepStr[2 * i] = newString(s23, opts);
      keepStr[2 * i + 1] = newString(s15, opts);
    }
    return keepStr;
  }
`);

for (let i = 0; i < 300; i++) gW.take(gC.extras[i]);
for (let i = 0; i < NT; i++) gW.take(gC.pairs[i].object);
for (let i = 300; i < 3000; i++) gW.take(gC.extras[i]);
gW.dropAll();

gF.evaluate(`
  var keep = [];
  for (let i = 0; i < 30000; i++) { let o = {i: i}; keep.push(o); new WeakRef(o); }
`);

minorgc();

schedulezone(gF);
schedulezone(gW);
startgc(1);

let transplanted = 0, slice = 0;
while (gcstate() !== "NotActive" && slice < 30000) {
  gcslice(3000, { dontStart: true });
  slice++;
  let st = gcstate();
  if ((st === "Mark" || st === "Sweep") && transplanted < NT) {
    for (let k = 0; k < 8 && transplanted < NT; k++) {
      gC.pairs[transplanted].transplant(gD);
      transplanted++;
    }
  }
}

gcparam("maxBytes", gcparam("maxBytes"));

gW.groomKeep = gW.groom(60000);

minorgc();
