// Test how stepping interacts with for(;;) statements.

let g = newGlobal({newCompartment: true});

// We want a for(;;) loop whose body is evaluated at least once, to
// see whether the loop head is hit a second time.
g.eval(`function f() {
  let x = 0;
  debugger;                     // +0
  for(;;) {                     // +1
    if (x++ == 1) break;        // +2
  }                             // +3
  debugger;                     // +4
}`);

let dbg = Debugger(g);

function test(s, expected) {
  let result = '';

  dbg.onDebuggerStatement = function(frame) {
    // On the second debugger statement, we're done.
    dbg.onDebuggerStatement = function(frame) {
      frame.onStep = undefined;
    };

    let debugLine = frame.script.getOffsetMetadata(frame.offset).lineNumber;
    frame.onStep = function() {
      // Only examine stops at entry points for the line.
      let lineNo = this.script.getOffsetMetadata(this.offset).lineNumber;
      if (this.script.getPossibleBreakpointOffsets({ line: lineNo }).indexOf(this.offset) < 0) {
        return undefined;
      }

      let delta = this.script.getOffsetMetadata(this.offset).lineNumber - debugLine;
      result += delta;
    };
  };
  g.eval(s);
  assertEq(result, expected);
}

// The bare for(;;) head has no recommended breakpoint under
// getPossibleBreakpoints, so stepping won't report a stop on it.
test('f()', '2224');
