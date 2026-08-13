// |jit-test| error: Error

var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);
var entered = false;

g.root = g.parseModule(`import "javascript:export let x = 1;";`);

dbg.onNewScript = script => {
  if (script.isModule && !entered) {
    entered = true;
    moduleLink(g.root);
  }
};

moduleLink(g.root);
