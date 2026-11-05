gczeal(0);
grayRoot()[0] = {};
gczeal(17, 0);
startgc(1);
oomAtAllocation(1);
grayRoot();
resetOOMFailure();
finishgc();
grayRoot()[0];
