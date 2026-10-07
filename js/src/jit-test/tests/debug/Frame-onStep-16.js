// Stepping through a function with a return statement should pause on
// the closing brace of the function.

var g = newGlobal({newCompartment: true});
var dbg = Debugger(g);
var log;

function test(fnStr) {
  log = '';
  g.eval(fnStr);

  dbg.onDebuggerStatement = function(frame) {
    let previousLine = -1;
    frame.onStep = function() {
      let lineNumber = frame.script.getOffsetMetadata(frame.offset).lineNumber;
      // Record each line once per visit; the pause on the closing brace (the
      // point of this test) is preserved, while repeated same-line stops from
      // the removed entry-point semantics collapse into one entry.
      if (lineNumber !== previousLine) {
        log += lineNumber + ' ';
        previousLine = lineNumber;
      }
    };
  };

  g.eval("f(23);");
}

test(`function f(x) {     // 1
    debugger;             // 2
    return 23 + x;        // 3
}                         // 4
`);
assertEq(log, '3 4 ');

test(`function f(x) {     // 1
    debugger;             // 2
    return;               // 3
}                         // 4
`);
assertEq(log, '3 4 ');
