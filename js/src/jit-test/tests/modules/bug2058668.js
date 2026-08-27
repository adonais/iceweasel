let A = parseModule('import { nope } from "b"; export var x = 1; import "b";', "a.js");
let B = parseModule('import { x } from "a"; export var y = 2; export function f() { return x; }', "b.js");
registerModule("a", A);
registerModule("b", B);
try { moduleLink(A); } catch {}
try {
  let f = getModuleEnvironmentValue(B, "f");
  let s = 0;
  for (let i = 0; i < 5000; i++) { s += (f() === undefined) ? 1 : 0; }
} catch {}
