// |jit-test| --fast-warmup; --no-threads

// Attaching a Debugger while a generator is suspended.

const g = newGlobal({newCompartment: true});
g.eval(`
  function* gen(n) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += i;
      yield s;
    }
    return s;
  }
  function warmUp() {
    for (let i = 0; i < 200; i++) {
      for (const v of gen(4)) {}
    }
  }
  function drain(g) {
    let out = [];
    for (;;) {
      const r = g.next();
      out.push(r.value);
      if (r.done) {
        return out.join(",");
      }
    }
  }
  warmUp();
  var suspended = gen(4);
  suspended.next();
`);

// Making the global a debuggee with an onEnterFrame handler forces the scripts to
// be recompiled with debug instrumentation.
const dbg = Debugger(g);
let hits = 0;
dbg.onEnterFrame = () => { hits++; };

assertEq(g.eval(`drain(suspended);`), "1,3,6,6");
assertEq(hits, 6);

// Back to no debuggee: warm up again and resume another suspended generator.
dbg.onEnterFrame = undefined;
dbg.removeDebuggee(g);

assertEq(g.eval(`
  var suspended2 = gen(4);
  suspended2.next();
  warmUp();
  drain(suspended2);
`), "1,3,6,6");
