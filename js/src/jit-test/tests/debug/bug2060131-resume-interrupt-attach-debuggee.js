// Test for an interrupt callback that calls Debugger.getNewestFrame during generator
// resume.

var g = newGlobal({newCompartment: true});
g.eval(`
  var keep;
  function* gen() {
    {
      let x = 1;
      const capture = () => x;   // gives the block its own environment object
      keep = capture;
      while (true) {
        yield x;
      }
    }
  }
  var it = gen();
  it.next();   // suspend inside the block
  for (var i = 0; i < 2000; i++) {
    it.next();
  }
`);

var dbg = null;
var rearm = 0;
var observed = 0;
var bad = 0;

setInterruptCallback(function () {
  if (!dbg) {
    // Add the debuggee now, while the generator may be mid-resume.
    dbg = new Debugger(g);
  }
  var f = dbg.getNewestFrame();
  if (f) {
    observed++;
    if (f.type === "call" && f.callee.name === "gen" && f.offset === 0) {
      bad++;
    }
  }
  if (rearm > 0) {
    rearm--;
    interruptIf(true);
  }
  return true;
});

g.arm = function () {
  rearm = 8;
  interruptIf(true);
};
g.eval(`
  for (var i = 0; i < 200; i++) {
    arm();
    it.next();
  }
`);

assertEq(bad, 0);
assertEq(observed > 50, true);
