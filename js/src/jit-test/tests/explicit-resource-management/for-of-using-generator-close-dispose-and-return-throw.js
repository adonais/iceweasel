load(libdir + "asserts.js");

function testSync({ disposeThrows, returnThrows, expected }) {
  const log = [];
  const iter = {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return {
        done: false,
        value: {
          [Symbol.dispose]() {
            log.push("dispose");
            if (disposeThrows) {
              throw "DISPOSE_ERR";
            }
          },
        },
      };
    },
    return() {
      log.push("return");
      if (returnThrows) {
        throw "RETURN_ERR";
      }
      return { done: true };
    },
  };

  const g = (function* () {
    for (using x of iter) {
      {
        let y = 1;
        yield 1;
      }
    }
  })();
  assertEq(g.next().value, 1);

  let caught;
  let result;
  try {
    result = g.return("forced");
  } catch (e) {
    caught = e;
  }
  assertArrayEq(log, ["dispose", "return"]);
  assertEq(caught, expected);
  if (expected === undefined) {
    assertEq(result.value, "forced");
    assertEq(result.done, true);
  }
}

testSync({ disposeThrows: true, returnThrows: true, expected: "DISPOSE_ERR" });
testSync({ disposeThrows: false, returnThrows: true, expected: "RETURN_ERR" });
testSync({ disposeThrows: true, returnThrows: false, expected: "DISPOSE_ERR" });
testSync({ disposeThrows: false, returnThrows: false });

async function testAsync({ disposeThrows, returnThrows, expected }) {
  const log = [];
  const iter = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      return {
        done: false,
        value: {
          async [Symbol.asyncDispose]() {
            log.push("dispose");
            if (disposeThrows) {
              throw "DISPOSE_ERR";
            }
          },
        },
      };
    },
    async return() {
      log.push("return");
      if (returnThrows) {
        throw "RETURN_ERR";
      }
      return { done: true };
    },
  };

  const g = (async function* () {
    for await (await using x of iter) {
      {
        let y = 1;
        yield 1;
      }
    }
  })();
  assertEq((await g.next()).value, 1);

  let caught;
  let result;
  try {
    result = await g.return("forced");
  } catch (e) {
    caught = e;
  }
  assertArrayEq(log, ["dispose", "return"]);
  assertEq(caught, expected);
  if (expected === undefined) {
    assertEq(result.value, "forced");
    assertEq(result.done, true);
  }
}

let completed = false;
let error;
(async () => {
  await testAsync({ disposeThrows: true, returnThrows: true, expected: "DISPOSE_ERR" });
  await testAsync({ disposeThrows: false, returnThrows: true, expected: "RETURN_ERR" });
  await testAsync({ disposeThrows: true, returnThrows: false, expected: "DISPOSE_ERR" });
  await testAsync({ disposeThrows: false, returnThrows: false });
})().then(
  () => {
    completed = true;
  },
  e => {
    error = e;
  }
);
drainJobQueue();
assertEq(error, undefined);
assertEq(completed, true);
