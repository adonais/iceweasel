// Test how stepping interacts with for-in/of statements.

var g = newGlobal({newCompartment: true});
var dbg = new Debugger;
var gw = dbg.addDebuggee(g);
var log;
var previous;

dbg.onDebuggerStatement = function (frame) {
  let debugLine = frame.script.getOffsetMetadata(frame.offset).lineNumber;
  log = '';
  previous = '';
  frame.onStep = function() {
    let foundLine = this.script.getOffsetMetadata(this.offset).lineNumber;
    if (this.script.getPossibleBreakpointOffsets({ line: foundLine }).indexOf(this.offset) >= 0) {
      let thisline = (foundLine - debugLine).toString(16);
      if (thisline !== previous) {
        log += thisline;
        previous = thisline;
      }
    }
  };
};

function testOne(decl, loopKind) {
  let body = `var array = [2, 4, 6];
debugger;
for (${decl} iter ${loopKind} array) {
  print(iter);
}
`;
  g.eval(body);
  // The loop head is only a recommended breakpoint on first entry (the
  // one-time iterator setup); per-iteration head revisits are not
  // breakpoints, so they do not appear in the log.
  assertEq(log, "124");
}

for (let decl of ["", "var", "let"]) {
  testOne(decl, "in");
  testOne(decl, "of");
}
