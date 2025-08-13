// |jit-test| --wasm-compiler=none;

load(libdir + "asserts.js");

assertErrorMessage(() => {
  (function (x, y) {
    "use asm";
    var z = y.m;
    function g() {
      z();
    }
    return g;
  })(0, {
    m: function () {
      throw new Error("0");
    },
  })();
}, Error, /0/);
