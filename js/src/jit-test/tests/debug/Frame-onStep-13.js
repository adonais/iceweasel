// Stepping over a not-taken "if" that is at the end of the function
// should move to the end of the function, not somewhere in the body
// of the "if".

var g = newGlobal({newCompartment: true});
g.eval(`function f() {        // 1
  var a,c;                    // 2
  debugger;                   // 3
  if(false) {                 // 4
    for(var b=0; b<0; b++) {  // 5
      c = 2;                  // 6
    }                         // 7
  }                           // 8
}                             // 9
`);

var dbg = Debugger(g);
var badStep = false;

dbg.onDebuggerStatement = function(frame) {
  let debugLine = frame.script.getOffsetMetadata(frame.offset).lineNumber;
  assertEq(debugLine, 3);
  frame.onStep = function() {
    // getOffsetMetadata reports the raw source-note position, which can be a
    // nonsense position for intermediate bytecode; the debugger only shows
    // stops at recommended breakpoints, so only assert on those.
    if (!this.script.getOffsetMetadata(this.offset).isBreakpoint) {
      return;
    }
    let foundLine = this.script.getOffsetMetadata(this.offset).lineNumber;
    assertEq(foundLine <= 4 || foundLine >= 8, true);
  };
};

g.eval("f();\n");
