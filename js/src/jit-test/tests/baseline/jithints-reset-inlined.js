// |jit-test| --fast-warmup; --blinterp-eager; --monomorphic-inlining=never; --no-threads

if (typeof resetFallbackStubStates !== "function" ||
    typeof oomTest !== "function") {
  quit(0);
}

function f() {
  for (
    var i = 10 ;
    (function () {
      return i--;
    })() ;
  ) {}
  resetFallbackStubStates(f);
  oomTest(f);
}
f();
