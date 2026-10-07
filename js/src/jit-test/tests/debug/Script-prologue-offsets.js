let g = newGlobal({newCompartment: true});
let dbg = new Debugger(g);
let count = 0;
dbg.onEnterFrame = function(frame) {
  if (frame.type === "eval") {
    return;
  }

  // This test assumes the hello1 and hello2 functions have prologue bytecode.
  assertEq(frame.script.mainOffset > 0, true);

  // Prologue bytecode ops are never marked as break/step points.
  let prologueData = frame.script.getOffsetMetadata(0);
  assertEq(prologueData.isBreakpoint, false);
  assertEq(prologueData.isStepStart, false);

  // getOffsetMetadata reports the prologue op's own position (the function's
  // start), unlike the removed getOffsetLocation which skipped to the first
  // main op.
  if (count == 0) {
    // hello1
    assertEq(prologueData.lineNumber, 2);
    assertEq(prologueData.columnNumber, 18);
  } else {
    // hello2
    assertEq(prologueData.lineNumber, 5);
    assertEq(prologueData.columnNumber, 18);
  }

  // getPossibleBreakpointOffsets shouldn't return prologue offsets. 
  for (let offset of frame.script.getPossibleBreakpointOffsets()) {
    assertEq(offset >= frame.script.mainOffset, true);
  }

  count++;
};
g.eval(`                                // 1
  function hello1(name) {               // 2
    return [].some((r) => r === name);  // 3
  }                                     // 4
  function hello2(name, x=1) {          // 5
    return [].some((r) => r === name);  // 6
  }                                     // 7
  hello1("world");                      // 8
  hello2("world");                      // 9
`);

assertEq(count, 2);
