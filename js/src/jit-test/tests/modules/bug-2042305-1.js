// |jit-test| slow
var N = 15000;
var leaf = parseModule("export var x = 1;");
registerModule("m" + (N - 1), leaf);
moduleLoadAndLink(leaf);
for (var i = N - 2; i >= 0; i--) {
  var m = parseModule("export * from 'm" + (i + 1) + "';");
  registerModule("m" + i, m);
  moduleLoadAndLink(m);    // shallow: child already Linked
}
var head = parseModule("import * as ns from 'm0'; ns;");
registerModule("head", head);
try {
  moduleLoadAndLink(head);   // namespace creation -> ModuleGetExportedNames recurses N deep
} catch(e) {
  assertEq(e instanceof InternalError, true);
  assertEq(e.message, "too much recursion");
}
