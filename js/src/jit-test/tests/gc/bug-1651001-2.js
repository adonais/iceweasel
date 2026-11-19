gczeal(0);
g1 = newGlobal({ sameZoneAs: this });
enableTrackAllocations();
g1.Object;
startgc(1);
recomputeWrappers();
