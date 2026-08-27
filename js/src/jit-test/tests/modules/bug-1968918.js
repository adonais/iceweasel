// |jit-test| error: InternalError: too much recursion
function f() {
  moduleLoadAndLink(parseModule("[]", "", "json"));
  Math.valueOf = f;
  Math.pow(Math);
}
f();

