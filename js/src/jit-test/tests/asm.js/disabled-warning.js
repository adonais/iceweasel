// asm.js has been removed. "use asm" now silently runs as normal JavaScript
// with no warning emitted.
enableLastWarning();
new Function(`"use asm"; return {};`);
var warning = getLastWarning();
// No warning should be emitted since asm.js warning has been removed
assertEq(warning, null, "no warning should be emitted");
