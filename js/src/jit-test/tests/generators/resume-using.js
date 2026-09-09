// |jit-test| --fast-warmup; --no-threads

// Test |using| and |await using| spanning a suspend.

let log = [];

function* syncUsing() {
  using res = { [Symbol.dispose]() { log.push("dispose"); } };
  log.push("a");
  yield 1;
  log.push("b");
  return "end";
}

// The async disposal itself awaits, so it suspends the generator again.
async function* asyncUsing() {
  await using res = {
    [Symbol.asyncDispose]() { log.push("dispose"); return Promise.resolve(); }
  };
  log.push("a");
  yield 1;
  log.push("b");
  return "end";
}

// One disposable per iteration, so a forced return mid-loop has a live resource.
function disposables(n) {
  let i = 0;
  return {
    [Symbol.iterator]() { return this; },
    next() {
      if (i >= n) {
        return { done: true };
      }
      const tag = i++;
      return {
        value: {
          [Symbol.asyncDispose]() {
            log.push("d" + tag);
            return Promise.resolve();
          }
        },
        done: false
      };
    }
  };
}

async function* forAwaitUsing(n) {
  for (await using res of disposables(n)) {
    yield "y";
  }
  return "end";
}

for (let i = 0; i < 200; i++) {
  log = [];
  const g = syncUsing();
  assertEq(g.next().value, 1);
  const r = g.next();
  assertEq(r.done, true);
  assertEq(r.value, "end");
  assertEq(log.join(","), "a,b,dispose");
}

for (let i = 0; i < 200; i++) {
  log = [];
  const g = syncUsing();
  assertEq(g.next().value, 1);
  const r = g.return("stop");
  assertEq(r.done, true);
  assertEq(r.value, "stop");
  assertEq(log.join(","), "a,dispose");
}

let failure = null;
(async function () {
  for (let i = 0; i < 200; i++) {
    log = [];
    const g = asyncUsing();
    assertEq((await g.next()).value, 1);
    const r = await g.next();
    assertEq(r.done, true);
    assertEq(r.value, "end");
    assertEq(log.join(","), "a,b,dispose");
  }

  for (let i = 0; i < 200; i++) {
    log = [];
    const g = asyncUsing();
    assertEq((await g.next()).value, 1);
    const r = await g.return("stop");
    assertEq(r.done, true);
    assertEq(r.value, "stop");
    assertEq(log.join(","), "a,dispose");
  }

  for (let i = 0; i < 200; i++) {
    log = [];
    const g = forAwaitUsing(3);
    assertEq((await g.next()).value, "y");
    const r = await g.return("stop");
    assertEq(r.done, true);
    assertEq(r.value, "stop");
    assertEq(log.join(","), "d0");
  }
})().catch(e => { failure = e; });

drainJobQueue();
assertEq(failure, null);
