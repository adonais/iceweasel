// |jit-test| skip-if: !wasmJSPromiseIntegrationEnabled()

function testSingle() {
  var g = newGlobal({newCompartment: true});
  var dbg = new Debugger(g);
  var savedEnv = null;
  var saving = false;
  var wasmEnters = 0;

  dbg.onEnterFrame = function(frame) {
    if (frame.type !== "wasmcall" || !saving) return;
    // The second wasm frame is $inner, the one that suspends.
    if (++wasmEnters === 2 && !savedEnv) {
      savedEnv = frame.environment;
    }
  };

  g.eval(`
    var resolveHold;
    function hold() { return new Promise(r => { resolveHold = r; }); }

    var fill = [];
    for (var k = 0; k < 96; k++) {
      fill.push('(local.set ' + k + ' (i64.const 0x4141414141414141))');
    }
    var bin = wasmTextToBinary(\`(module
      (import "" "hold" (func $hold))
      (func $inner (param i32) (result i32) (local i32 externref)
        (local.set 1 (local.get 0))
        (call $hold)
        (local.get 1))
      (func (export "testA") (param i32) (result i32)
        (call $inner (local.get 0)))
      (func (export "testB") (result i32) (local \${'i64 '.repeat(96)})
        \${fill.join(' ')}
        (call $hold)
        (i32.const 0))
    )\`);
    var inst = new WebAssembly.Instance(new WebAssembly.Module(bin),
                                        {"": {hold: new WebAssembly.Suspending(hold)}});
    var pA = WebAssembly.promising(inst.exports.testA);
    var pB = WebAssembly.promising(inst.exports.testB);
  `);

  // Suspend inside $inner and keep its environment alive.
  saving = true;
  g.eval("var qA = pA(7);");
  saving = false;
  drainJobQueue();

  assertEq(savedEnv !== null, true);
  assertEq(savedEnv.getVariable("var0"), 7);

  // Drop the suspended continuation so the ContObject is finalized and its
  // stack is returned to the arena.
  g.eval("qA = null; resolveHold = null;");
  gc(); gc();
  drainJobQueue();

  assertEq(savedEnv.getVariable("var0").optimizedOut, true);

  // Run a second continuation that recycles the freed slot and fills it with
  // 0x4141414141414141. Reading through a surviving entry here would walk a
  // forged frame.
  g.eval("var qB = pB();");
  drainJobQueue();

  assertEq(savedEnv.getVariable("var0").optimizedOut, true);
}

// Nested variant
function testNested() {
  var g = newGlobal({newCompartment: true});
  var dbg = new Debugger(g);
  var envs = [];
  var saving = false;

  dbg.onEnterFrame = function(frame) {
    if (frame.type !== "wasmcall" || !saving) return;
    envs.push(frame.environment);
  };

  g.eval(`
    var resolveHold;
    function hold() { return new Promise(r => { resolveHold = r; }); }

    var bin = wasmTextToBinary(\`(module
      (import "" "hold" (func $hold))
      (import "" "callInner" (func $callInner))
      (func $deep (param i32) (result i32) (local i32)
        (local.set 1 (local.get 0))
        (call $hold)
        (local.get 1))
      (func (export "inner") (param i32) (result i32)
        (call $deep (local.get 0)))
      (func (export "outer") (result i32)
        (call $callInner)
        (i32.const 1))
    )\`);

    var pInner;
    function callInner() { return pInner(11); }
    var inst = new WebAssembly.Instance(new WebAssembly.Module(bin), {"": {
      hold: new WebAssembly.Suspending(hold),
      callInner: new WebAssembly.Suspending(callInner),
    }});
    pInner = WebAssembly.promising(inst.exports.inner);
    var pOuter = WebAssembly.promising(inst.exports.outer);
  `);

  // outer suspends on inner, which suspends on hold: two nested stacks.
  saving = true;
  g.eval("var q = pOuter();");
  saving = false;
  drainJobQueue();

  assertEq(envs.length, 3);

  // $deep is the innermost frame; its param is still readable while suspended.
  assertEq(envs[2].getVariable("var0"), 11);

  g.eval("q = null; resolveHold = null;");
  gc(); gc();
  drainJobQueue();
  gc();

  for (var env of envs) {
    for (var name of env.names()) {
      var v = env.getVariable(name);
      // Every wasm local on the discarded chain must now read as optimized out
      // rather than off a freed stack.
      assertEq(typeof v === "object" && v !== null && v.optimizedOut === true,
               true);
    }
  }
}

testSingle();
testNested();
