var cnt = 0;
var gBreak = true;
var iterObj = {
  [Symbol.iterator]: function() { return iterObj; },
  next: function() { cnt++; return {done: cnt > 1, value: 0}; },
};
iterObj.return = Object;
var depth = 0;

function f() {
  depth++;
  cnt = 0;
  for (var x of iterObj) {
    if (gBreak) {
      break;
    }
  }
  return 0;
}

function main() {
  with ({}) {}
  // Phase 1: pre-Ion, warm the break/CloseIter path (attach declines: native).
  for (var i = 0; i < 60; i++) { f(); }
  // Phase 2: stop executing CloseIter; let Ion compile with a fresh IC.
  gBreak = false;
  for (var i = 0; i < 4000; i++) { f(); }
  // Phase 3: scripted return method, recursion through the Ion IC stub.
  depth = 0;
  gBreak = true;
  iterObj.return = f;
  try {
    f();
    print("returned normally");
  } catch (e) {
    print("caught: " + e.name + " at depth " + depth);
  }
}
main();
