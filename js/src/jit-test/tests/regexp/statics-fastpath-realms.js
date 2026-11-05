// |jit-test| --fast-warmup

// Each realm has its own statics, so alternating realms running the same
// source on the same input must keep them separate.

const g1 = newGlobal({ sameCompartmentAs: this });
const g2 = newGlobal({ sameCompartmentAs: this });
g1.evaluate("function run(s) { return /(\\w)(\\d)/g.exec(s); }");
g2.evaluate("function run(s) { return /(\\w)(\\d)/g.exec(s); }");

const shared = "a1 b2 c3";
for (let i = 0; i < 200; i++) {
  const other = "z" + (i % 10) + " y9";
  g1.run(shared);
  g2.run(other);
  g1.run(shared);
  assertEq(g1.RegExp.$1, "a");
  assertEq(g1.RegExp.$2, "1");
  assertEq(g1.RegExp.input, shared);
  assertEq(g2.RegExp.$1, "z");
  assertEq(g2.RegExp.$2, String(i % 10));
  assertEq(g2.RegExp.input, other);

  g2.run(shared);
  assertEq(g2.RegExp.$1, "a");
  assertEq(g1.RegExp.input, shared);
}
