var body = "x;".repeat(1000);
var src = `
  var x;
  function f(a) {
    if (a) {
      return 1;
    }
    ${body}
    return 2;
  }
  for (var i = 0; i < 100; i++) {
    f(1);
  }
`;
evaluate(src, {eagerBaselineStrategy: "Aggressive", forceFullParse: true});
evaluate(src, {eagerBaselineStrategy: "JitHints", forceFullParse: true});
evaluate(src, {eagerBaselineStrategy: "None", forceFullParse: true});

// An exception is thrown for invalid values.
var exc = null;
try {
  evaluate(src, {eagerBaselineStrategy: "BadValue"});
} catch (e) {
  exc = e;
}
assertEq(exc.toString().includes("eagerBaselineStrategy must be"), true);
