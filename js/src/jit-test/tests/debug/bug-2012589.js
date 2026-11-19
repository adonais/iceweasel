const g = newGlobal({newCompartment: true});
g.enableTrackAllocations();
const dbg = new Debugger();
dbg.memory.trackingAllocationSites = true;
dbg.addDebuggee(g);
