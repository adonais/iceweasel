var g1 = newGlobal({newCompartment:true});
var g2 = newGlobal({newCompartment:true});
var dbg = new Debugger(g1);
g1.eval("function hook() {}");
g2.hook = g1.hook;
dbg.onEnterFrame = function(f) {
  dbg.onEnterFrame = undefined;
  g2.resolveY();
};
g2.eval(`
var resolveY; var pY = new Promise(r => resolveY = r);
var resolveQ; var pQ = new Promise(r => resolveQ = r);
var qDone = false; var qResult;
registerModule("d", parseModule("await 1;", "d.mjs"));
registerModule("y", parseModule("await pY;", "y.mjs"));
registerModule("p", parseModule("import 'd'; hook(); throw 'perr';", "p.mjs"));
var q = parseModule("import 'p'; import 'y'; await pQ; qDone = true;", "q.mjs");
moduleLoadAndLink(q);
moduleEvaluate(q).then(() => { qResult = "resolved"; },
                       e => { qResult = "rejected " + e; });
`);
drainJobQueue();
assertEq(g2.qDone, false);
g2.resolveQ();
drainJobQueue();
assertEq(g2.qResult, "rejected perr");
assertEq(g2.qDone, true);
