// findSources() must find a JS module source after the original debugger
// detached and a new one re-attached, with a GC in between.

load(libdir + "asserts.js");

const g = newGlobal({newCompartment: true});
const dbg1 = new Debugger(g);

const m = g.parseModule(`export const x = 1;`);
moduleLink(m);
moduleEvaluate(m);
drainJobQueue();

dbg1.removeDebuggee(g);

gc();

const dbg2 = new Debugger(g);
const sources = dbg2.findSources();
assertEq(sources.length, 1);
