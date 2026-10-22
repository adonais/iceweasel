gczeal(0);
var A = newGlobal({newCompartment: true});
var Z = newGlobal({newCompartment: true});
A.eval(`
  var o = {};
  for (var i = 0; i < 400; i++) o["pad" + i + "Y".repeat(40)] = 1;
  o["de" + "sc" + "X".repeat(2000)] = 1;
  var keys = Object.keys(o);
  var X = keys[keys.length - 1];
  o = null; keys = null;
  var S = null;
  function mk() { S = Symbol(X); }
  function drop() { X = null; S = null; }
`);
Z.A = A;
Z.eval('var s; function grab() { s = A.S; A = null; } function f() { return s.description; }');
schedulezone(Z); schedulezone("atomsx"); startgc(1, "zone");
while (gcstate() == "Prepare") gcslice(1);
A.mk();
Z.grab();
while (gcstate() != "NotActive") gcslice(100);
A.drop();
schedulezone(A); schedulezone("atomsx"); gc("zone");
schedulezone(A); schedulezone("atomsx"); gc("zone");
var junk = [];
for (var i = 0; i < 200000; i++) junk.push(Symbol());
var d = Z.f();
print(typeof d, d.length);
print(String(d).slice(0, 50));
