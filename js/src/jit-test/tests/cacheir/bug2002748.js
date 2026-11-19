// |jit-test| --blinterp-eager; --more-compartments

gczeal(6);
var x = newGlobal();
Debugger(x);
x.eval("new class { constructor() { Object.keys(Object); } }");
