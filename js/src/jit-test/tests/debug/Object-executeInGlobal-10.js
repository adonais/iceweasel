load(libdir + "asserts.js");

var g = newGlobal({newCompartment: true});
var dbg = new Debugger;
var gw = dbg.addDebuggee(g);

// executeInGlobal should be able to introduce and persist lexical bindings.

assertEq(gw.executeInGlobal(`let x = 42; x;`).return, 42);
assertEq(gw.executeInGlobal(`x;`).return, 42);

// By contrast, Debugger.Frame.eval is like direct eval, and shouldn't be able
// to introduce new lexical bindings.
dbg.onDebuggerStatement = function (frame) { frame.eval(`let y = 84;`); };
g.eval(`debugger;`);
assertEq(!!gw.executeInGlobal(`y;`).throw, true);

// executeInGlobal is strict by default.
assertEq("throw" in gw.executeInGlobal(`let x = 84; x;`), true);

// REPL mode may reinitialize a binding from an earlier evaluation, while
// duplicate declarations in the same evaluation remain errors.
const allowRedeclare = { allowRedeclaringExistingLexicalBinding: true };
assertEq(gw.executeInGlobal(`let r = 42; r;`).return, 42);
assertEq(gw.executeInGlobal(`let r = 84; r;`, allowRedeclare).return, 84);
assertEq(gw.executeInGlobal(`const c = 1; c;`).return, 1);
assertEq(gw.executeInGlobal(`const c = 2; c;`, allowRedeclare).return, 2);
assertEq(
  "throw" in
    gw.executeInGlobal(`let a = 3; let a = 4;`, allowRedeclare),
  true
);
assertEq(
  "throw" in
    gw.executeInGlobal(`const b = 3; const b = 4;`, allowRedeclare),
  true
);

// Lexical bindings (let / const / class) live in the same environment, so in
// redeclare mode they can replace each other across evaluations. Bindings on
// the global object (var / function) still conflict with lexical ones and those
// throw in both directions.

// var -> let: throws
assertEq(gw.executeInGlobal(`var v1 = 1;`).return, undefined);
assertEq("throw" in gw.executeInGlobal(`let v1 = 2;`, allowRedeclare), true);

// let -> var: throws
assertEq(gw.executeInGlobal(`let v2 = 1;`).return, undefined);
assertEq("throw" in gw.executeInGlobal(`var v2 = 2;`, allowRedeclare), true);

// A block-level function declaration (`{ function f() {} }`) ends up
// creating a global `var`, same as a normal function declaration. So a
// later `let`/`const` of the same name still throws, just like with `var`.
assertEq(gw.executeInGlobal(`{ function bf() {} }`).return, undefined);
assertEq("throw" in gw.executeInGlobal(`let bf = 2;`, allowRedeclare), true);

// class -> let: allowed (both lexical)
assertEq(gw.executeInGlobal(`class C1 {}`).return, undefined);
assertEq(gw.executeInGlobal(`let C1 = 2; C1;`, allowRedeclare).return, 2);

// let -> class: allowed (both lexical)
assertEq(gw.executeInGlobal(`let C2 = 1;`).return, undefined);
assertEq(
  gw.executeInGlobal(`class C2 {} typeof C2;`, allowRedeclare).return,
  "function"
);

// function -> let: throws
assertEq(gw.executeInGlobal(`function f1() {}`).return, undefined);
assertEq("throw" in gw.executeInGlobal(`let f1 = 2;`, allowRedeclare), true);

// let -> function: throws
assertEq(gw.executeInGlobal(`let f2 = 1;`).return, undefined);
assertEq(
  "throw" in gw.executeInGlobal(`function f2() {}`, allowRedeclare),
  true
);

// const -> let: rejected due to the constness mismatch, so a reinitialized
// binding never ends up with a stale writability.
assertEq(gw.executeInGlobal(`const kc = 1;`).return, undefined);
assertEq("throw" in gw.executeInGlobal(`let kc = 2;`, allowRedeclare), true);

// let -> const: rejected for the same reason, in the opposite direction.
assertEq(gw.executeInGlobal(`let kl = 1;`).return, undefined);
assertEq(
  "throw" in gw.executeInGlobal(`const kl = 2;`, allowRedeclare),
  true
);

// A closure that captures a lexical binding sees the new value after
// a REPL-mode redeclaration and the redeclaration reuses the same slot.
assertEq(
  gw.executeInGlobal(
    `let closureVar = 1; function readClosureVar() { return closureVar; }`
  ).return,
  undefined
);
assertEq(gw.executeInGlobal(`readClosureVar();`).return, 1);
assertEq(
  gw.executeInGlobal(`let closureVar = 2;`, allowRedeclare).return,
  undefined
);
assertEq(gw.executeInGlobal(`readClosureVar();`).return, 2);

// allowRedeclaringExistingLexicalBinding is accepted only by
// executeInGlobal/executeInGlobalWithBindings; passing it to Frame.eval*
// throws, as does combining it with useInnerBindings.
dbg.onDebuggerStatement = function (frame) {
  assertThrowsInstanceOf(
    () => frame.eval(`1;`, allowRedeclare),
    Error
  );
};
g.eval(`debugger;`);

assertThrowsInstanceOf(
  () =>
    gw.executeInGlobalWithBindings(`1;`, {}, {
      allowRedeclaringExistingLexicalBinding: true,
      useInnerBindings: true,
    }),
  Error
);

// Only the redeclaration closes over the binding (reverse of the above).
{
  const gw2 = dbg.addDebuggee(newGlobal({ newCompartment: true }));

  assertEq(gw2.executeInGlobal(`let v1 = 1; v1;`).return, 1);
  assertEq(
    gw2.executeInGlobal(
      `function readV1() { return v1; } let v1 = 2; readV1();`,
      allowRedeclare
    ).return,
    2
  );
  assertEq(gw2.executeInGlobal(`readV1();`).return, 2);
}

// A `const` binding captured by a function, then redeclared and now the closure
// must see the new value after the redeclaration.
{
  const gw3 = dbg.addDebuggee(newGlobal({ newCompartment: true }));

  assertEq(
    gw3.executeInGlobal(
      `const cv = 1; function readCv() { return cv; } readCv();`
    ).return,
    1
  );
  assertEq(
    gw3.executeInGlobal(`const cv = 2; readCv();`, allowRedeclare).return,
    2
  );
  assertEq(gw3.executeInGlobal(`readCv();`).return, 2);
}

// A closure JIT-compiled before the redeclaration must observe the new value.
{
  const gw4 = dbg.addDebuggee(newGlobal({ newCompartment: true }));

  gw4.executeInGlobal(
    `let jitV = 1; function readJitV() { return jitV; }`
  );

  // Warm up readJitV so it hits the JIT compilation threshold with
  // jitV === 1 inlined.
  gw4.executeInGlobal(`
    for (var i = 0; i < 2000; i++) {
      readJitV();
    }
  `);

  gw4.executeInGlobal(`let jitV = 2;`, allowRedeclare);
  assertEq(gw4.executeInGlobal(`readJitV();`).return, 2);
}

// A reader JIT-compiled via onEnterFrame, before the redeclaration resets
// the binding, must still observe the new value after redeclaration.
{
  const gw5 = dbg.addDebuggee(newGlobal({ newCompartment: true }));

  gw5.executeInGlobal(`
    let raceV = 1;
    function readRaceV() {
      return raceV;
    }
  `);

  let first = true;
  dbg.onEnterFrame = f => {
    if (!first) {
      return;
    }
    first = false;
    gw5.executeInGlobal(`
      for (var i = 0; i < 2000; i++) {
        readRaceV();
      }
    `);
  };

  gw5.executeInGlobal(`let raceV = 2;`, allowRedeclare);
  dbg.onEnterFrame = undefined;

  assertEq(gw5.executeInGlobal(`readRaceV();`).return, 2);
}
