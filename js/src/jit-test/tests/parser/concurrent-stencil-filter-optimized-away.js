// |jit-test| skip-if: helperThreadCount() === 0

const options = {
  fileName: "test.js",
  lineNumber: 1,
  eagerDelazificationStrategy: "ConcurrentDepthFirst",
};

const script = `
function g() {
  function f() {
    // Optimized out.
    (a = function () {}) => {};
  }
  f()
}
g()
`;

// This code is expected to run and not crash by not-compiling optimized-out
// inner functions.
const job = offThreadCompileToStencil(script, options);
const stencil = finishOffThreadStencil(job);
evalStencil(stencil, options);
