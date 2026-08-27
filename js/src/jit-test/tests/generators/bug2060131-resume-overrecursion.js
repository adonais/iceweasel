// Test for the overrecursion check in the generator-resume prologue.

var keep;

function* gen() {
  {
    let x = 1;
    const capture = () => x; // gives the block its own environment object
    keep = capture;
    yield x; // suspend inside the block
  }
}

function step(g, n) {
  if (n > 0) {
    step(g, n - 1);
    return;
  }
  g.next();
}

function rec(nsteps) {
  var g = gen();
  g.next(); // prime: suspend at the yield inside the block
  step(g, nsteps); // resume from inside the block
  rec(nsteps);
}

var caught = null;
try {
  rec(2);
} catch (e) {
  caught = e;
}
assertEq(caught instanceof InternalError, true);

assertEq(keep(), 1);
