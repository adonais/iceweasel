// |jit-test| --fast-warmup; --no-threads

// Walking the stack from inside a call to a bound function must report the
// target function, not the bound function. If the bound function ends up in the
// caller frame's callee slot, InlineFrameIterator::findNextFrame casts it to
// JSFunction, which is a bad cast.

const obj = {};

function innerStack(a) {
  return new Error("stack").stack;
}
const boundStack = innerStack.bind(obj);
function outerStack() { return boundStack(1); }

for (let i = 0; i < 500; i++) {
  const stack = outerStack();
  assertEq(stack.includes("innerStack"), true);
  assertEq(stack.includes("outerStack"), true);
}

// Same thing, but the stack is walked while unwinding for an exception.
function innerThrow(a) {
  throw new Error("thrown");
}
const boundThrow = innerThrow.bind(obj);
function outerThrow() {
  try {
    boundThrow(1);
  } catch (e) {
    return e.stack;
  }
  return "no throw";
}

for (let i = 0; i < 500; i++) {
  const stack = outerThrow();
  assertEq(stack.includes("innerThrow"), true);
  assertEq(stack.includes("outerThrow"), true);
}
