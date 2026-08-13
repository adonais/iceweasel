// |jit-test| --fuzzing-safe

let g = newGlobal({ newCompartment: true });
let dbg = new Debugger(g);
let gDO = dbg.addDebuggee(g);

assertEq(gDO.unsafeDereference, undefined);
