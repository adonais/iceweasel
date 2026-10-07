// Stepping out of a finally should not appear to
// step backward to some earlier statement.

var g = newGlobal({newCompartment: true});
g.eval(`function f() {
         debugger;              // +0
         var x = 0;             // +1
         try {                  // +2
           x = 1;               // +3
           throw 'something';   // +4
         } catch (e) {          // +5
           x = 2;               // +6
         } finally {            // +7
           x = 3;               // +8
         }                      // +9
         x = 4;                 // +10
       }`);                     // +11

var dbg = Debugger(g);

let foundLines = '';

dbg.onDebuggerStatement = function(frame) {
  let debugLine = frame.script.getOffsetMetadata(frame.offset).lineNumber;
  frame.onStep = function() {
    // Only record a stop when the offset is a recommended breakpoint.
    let foundLine = this.script.getOffsetMetadata(this.offset).lineNumber;
    if (foundLine != debugLine && this.script.getPossibleBreakpointOffsets({ line: foundLine }).indexOf(this.offset) >= 0) {
      foundLines += "," + (foundLine - debugLine);
    }
  };
};

g.f();

// try/catch/finally headers (+2/+5/+7) have no recommended breakpoint
// locations, so stepping no longer reports stops on them.
assertEq(foundLines, ",1,3,4,6,8,10,11");
