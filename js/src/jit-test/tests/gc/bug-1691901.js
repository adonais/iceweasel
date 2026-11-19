gczeal(0);
enableTrackAllocations();
setMarkStackLimit(1);
Function('gc()'.replace(/x/))();
