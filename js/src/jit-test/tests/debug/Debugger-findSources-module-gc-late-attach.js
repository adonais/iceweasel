// findSources() must find a JS module source when the debugger attaches after
// evaluation and GC.

load(libdir + "asserts.js");

const g = newGlobal({newCompartment: true});

const m = g.parseModule(`export const x = 1;`);
moduleLink(m);
moduleEvaluate(m);
drainJobQueue();

gc();

const dbg = new Debugger(g);
const sources = dbg.findSources();
assertEq(sources.length, 1);
