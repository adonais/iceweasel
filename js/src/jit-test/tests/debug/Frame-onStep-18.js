// Regression test for bug 1370648.

let g = newGlobal({newCompartment: true});

let dbg = Debugger(g);
let lines = [0, 0, 0, 0, 0];
dbg.onDebuggerStatement = function (frame) {
  let dLine = frame.script.getOffsetMetadata(frame.offset).lineNumber;
  lines[0] = 1;
  frame.onStep = function () {
    let meta = frame.script.getOffsetMetadata(this.offset);
    // The debugger only shows stops at recommended breakpoints; ignore
    // intermediate bytecode whose raw position can be misleading (e.g. jump
    // targets inheriting the position of dead code).
    if (!meta.isBreakpoint) {
      return;
    }
    lines[meta.lineNumber - dLine] = 1;
  };
}

let s = `
      debugger;                 // 0
      if (1 !== 1) {            // 1
        print("dead code!?");   // 2
      }                         // 3
`;
g.eval(s);
assertEq(lines.join(""), "11001");
