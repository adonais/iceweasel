// |jit-test| --fuzzing-safe

var body = "";
for (var i = 0; i < 900; i++) {
  body += "for (;;) { yield " + i + "; break; }\n";
}
var g = Function("return function* g() { try { yield 0; } catch (e) {\n" + body + "} }")();
for (var i = 0; i < 300000; i++) {
  for (var v of g()) {}
}
