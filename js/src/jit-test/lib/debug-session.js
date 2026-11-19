// Helpers for tests of the shell's debugSessionCreate/debugSessionCommand functions.
// See the Shell DebugSession SMDOC in js/src/shell/DebugSession.cpp.

function pausedEntries(log) {
  return log.filter(e => e.type === "paused");
}

function evaluateResults(log) {
  return log.filter(e => e.type === "evaluate").map(e => e.result);
}
