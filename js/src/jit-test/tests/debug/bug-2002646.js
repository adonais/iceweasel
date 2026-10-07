var x = newGlobal({ newCompartment: true });
Debugger(x).onDebuggerStatement = function (y) {
  y.script.setBreakpoint(y.script.getPossibleBreakpointOffsets({ line: 1 })[0], {
    hit: function () {},
  });
};
x.eval("function* g() { debugger; return; };g().next()");
relazifyFunctions();
