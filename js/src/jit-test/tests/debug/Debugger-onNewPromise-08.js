var M = newGlobal({newCompartment: true});
var g = newGlobal({newCompartment: true});
M.g = g;
M.eval(`
  var dbg1 = new Debugger(g);
  dbg1.onEnterFrame = function(f) {
    if (f.type === "call" && f.callee && f.callee.isAsyncFunction) {
      dbg1.onEnterFrame = undefined;
      return {throw: 1};
    }
  };
`);

var dbg2 = new Debugger(g);
var gw = dbg2.getDebuggees()[0];
dbg2.onNewPromise = function(p) {
  gw.setProperty("p2", p);
  resolvePromise(g.p2, 10);
};

let caught = false;
try {
  g.eval(`
(async function () {})();
`);
} catch (e) {
  caught = true;
}
// Resolving a newly-created unforgeable promise shouldn't crash,
// but throws an error.
assertEq(caught, true);
drainJobQueue();
