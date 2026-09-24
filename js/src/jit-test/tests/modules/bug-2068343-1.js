const g = newGlobal({newCompartment: true});
const dbg = new Debugger(g);
dbg.onEnterFrame = function(f) {
  if (f.type != "module" || f.script.url != "a.mjs") return;
  f.onPop = function(c) {
    if (c.await) return {throw: "boom"};
  };
};

g.eval(`
  var d = parseModule("await 1;", "d.mjs");
  registerModule("d", d);
  var a = parseModule("import 'd'; await 1;", "a.mjs");
  moduleLoadAndLink(a);
  var result;
  moduleEvaluate(a).then(v => { result = "resolved"; },
                         e => { result = "rejected " + e; });
`);
drainJobQueue();
assertEq(g.result, "rejected boom");
