if (!this.enqueueMark) {
  quit(0);
}

enqueueMark([]);
let x = new Proxy([2 ** 22], {
  set: function f(y) {
    y.unshift(1);
    [z, , y] = y;
    oomTest(function () {
      new BigUint64Array(y);
    });
  },
});
x[0] = 1;
x[0] = 1;
