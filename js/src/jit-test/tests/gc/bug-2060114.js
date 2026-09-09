// |jit-test| skip-if: helperThreadCount() === 0

// This test can be extremely slow on some platforms.
if (getBuildConfiguration("simulator") ||
    getBuildConfiguration("x86")) {
  quit();
}

gczeal(0);
gczeal(16);

var numObjects = scriptArgs.length > 0 ? parseInt(scriptArgs[0]) : 10000;
var N = scriptArgs.length > 1 ? parseInt(scriptArgs[1]) : 2000000;
var sliceEvery = scriptArgs.length > 2 ? parseInt(scriptArgs[2]) : 128;
var sliceBudget = scriptArgs.length > 3 ? parseInt(scriptArgs[3]) : 200;

var graph = [];
for (var i = 0; i < numObjects; i++) {
  var o = {};
  for (var k = 0; k < 12; k++) {
    o["field_" + i + "_" + k] = k;
  }
  graph.push(o);
}

var syms = [];
for (var i = 0; i < 4000; i++) {
  var s = Symbol("sym" + i);
  syms.push(s);
  graph[i % graph.length][s] = i;
}

var keep = [];
for (var i = 0; i < N; i++) {
  var name = "atom_" + i + "_padpadpadpad";
  var o = {};
  o[name] = i;
  if ((i & 511) === 0) {
    keep.push(o);
    var s2 = Symbol(name);
    syms.push(s2);
    graph[i % graph.length][s2] = i;
  }
  if ((i % sliceEvery) === 0) {
    gcslice(sliceBudget);
  }
}
