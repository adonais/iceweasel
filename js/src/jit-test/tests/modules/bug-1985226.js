load(libdir + "asserts.js");

a = parseModule(`import 'b' with { b: 'bar'}`);
assertThrowsInstanceOf(function () {
  moduleLoadAndLink(a);
}, SyntaxError)