setJitCompilerOption('ion.warmup.trigger', 3);
setJitCompilerOption('baseline.warmup.trigger', 1);
setJitCompilerOption('offthread-compilation.enable', 0);

var g = newGlobal({newCompartment: true});
var dbg = new Debugger;

g.toggle = function toggle(d) {
  if (d) {
    dbg.addDebuggee(g);
    var frame = dbg.getNewestFrame();
    frame.eval("Object.call(arguments[1])");
  }
};

g.eval("" + function f(d, x) {
  "use strict";
  eval("g(d, x)");
});

g.eval("" + function g(d, x) {
  "use strict";
  for (var i = 0; i < 100; i++);
  toggle(d);
});

g.eval("(" + function test() {
  for (i = 0; i < 15; i++)
    f(false, 42);
  f(true, 42);
} + ")();");
