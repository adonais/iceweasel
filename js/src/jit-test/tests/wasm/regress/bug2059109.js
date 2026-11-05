// |jit-test| skip-if: !wasmCompileMode().includes("baseline")
//
// The Debugger below forces baseline compilation, so this only runs where the
// baseline compiler is available.
//
// Baseline emitTryTable emitted the try_table landing pad without popping the
// try's ref-typed block params, so the pad's stackmaps marked the (dead) param
// spill slot as a live AnyRef. After the param is dropped and collected, that
// slot dangles; a minor GC during exception unwind (here from a Debugger
// onExceptionUnwind hook) then traces the dangling word (use-after-free).
var g = newGlobal({newCompartment: true});
var dbg = new Debugger(g);
dbg.onExceptionUnwind = function(frame, value) {
  var junk = [];
  for (var i = 0; i < 100; i++) junk.push({});  // reuse the freed nursery slot
  minorgc();
};

g.eval(`
  var ins = new WebAssembly.Instance(new WebAssembly.Module(wasmTextToBinary(\`(module
    (tag $a)
    (tag $b)
    (func $thrower throw $b)
    (func (export "test") (param externref) (result i32)
      block $out (result i32)
        block $h
          local.get 0
          try_table (param externref) (result i32) (catch $a $h)
            drop            ;; param is dead; its spill slot is stale from here
            call $thrower   ;; throws $b, not caught by (catch $a)
            i32.const 1
          end
          br $out
        end
        i32.const 2
      end))\`)));
  for (var i = 0; i < 5; i++) {
    try { ins.exports.test({}); } catch (e) {}
  }
`);
