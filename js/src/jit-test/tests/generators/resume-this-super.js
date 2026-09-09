// |jit-test| --fast-warmup; --no-threads

// Generator methods using |this| and |super| after a suspend.

class B {
  m() { return "B.m"; }
}

class C extends B {
  constructor(x) {
    super();
    this.x = x;
  }
  *g() {
    yield this.x;
    const arrow = () => this.x;
    return super.m() + arrow();
  }
  async *h() {
    yield this.x;
    await null;
    return super.m() + this.x;
  }
}

for (let i = 0; i < 200; i++) {
  const g = new C(7).g();
  assertEq(g.next().value, 7);
  const r = g.next();
  assertEq(r.done, true);
  assertEq(r.value, "B.m7");
}

let failure = null;
(async function () {
  for (let i = 0; i < 200; i++) {
    const h = new C(9).h();
    assertEq((await h.next()).value, 9);
    const r = await h.next();
    assertEq(r.done, true);
    assertEq(r.value, "B.m9");
  }
})().catch(e => { failure = e; });

drainJobQueue();
assertEq(failure, null);
