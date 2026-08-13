// findSources() must find a JS module source after GC has swept its BaseScript.
// onTopLevelEvaluationFinished clears ScriptSlot, leaving the BaseScript with
// no strong reference, so it can be collected before findSources() runs.

load(libdir + "asserts.js");

const g = newGlobal({newCompartment: true});
const dbg = new Debugger(g);

const m = g.parseModule(`export const x = 1;`);
moduleLink(m);
moduleEvaluate(m);
drainJobQueue();

gc();

const sources = dbg.findSources();
assertEq(sources.length, 1);
