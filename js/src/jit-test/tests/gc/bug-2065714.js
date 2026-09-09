if (!('WebAssembly' in this)) {
  quit();
}

gczeal(0);

function f(a, b, c) {
  (function() {
    gczeal(c[1]);
  })();
}
for (
  let x1 = 0;
  x1 < 1;
  (function () {
    x1++;
  })()
) {}
for (
  let [x2] = (function() {
    return [];
  })();
  (function() {
    return x2--;
  })();
) {}
for (
  let x3 = 15n;
  (function() {
    x3--;
    let [x4] = (function() {
      (function () {
        try {
          (function (y) {
            y.z.length;
          })([], {
            a: {},
          });
        } catch (e) {}
      })({ z: [{}] });
      (function () {
        (function (x) {
          schedulezone("");
        })({
          y: [],
        });
      })({
        d1: [
          { d2: {} },
          { d3: {} },
          { d4: {} },
        ],
      });
      return [];
    })();
    (function () {
      f(
        "abc",
        {
          e1: [
            { e2: {} },
            { e3: {} },
            { e4: {} },
          ],
        },
        [x4, x3],
      );
    })();
    return x3;
  })();
  (() => {
    for (
      let [x5] = (function () {
        (function () {
          return [];
        })();
        return [10];
      })();
      x5;
      (function () {
        (new WebAssembly.Module(wasmTextToBinary("(module)")), x5--);
      })()
    ) {}
  })()
) {
  for (var i = 0; i < 9; i++) {}
}
