// Required --no-threads to crash.

enableTrackAllocations();
newGlobal({newCompartment:true});
gcslice(1);
nukeAllCCWs();
