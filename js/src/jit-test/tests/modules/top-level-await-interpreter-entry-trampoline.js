// |jit-test| module; --emit-interpreter-entry

globalThis.moduleBodyRuns = (globalThis.moduleBodyRuns | 0) + 1;
var result = 0;
for (var i = 0; i < 30; i++) {
  result += await Promise.resolve(i);
}
assertEq(result, 435);
assertEq(globalThis.moduleBodyRuns, 1);
