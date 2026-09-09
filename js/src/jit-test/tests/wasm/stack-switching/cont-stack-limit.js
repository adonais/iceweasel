// |jit-test| skip-if: !wasmStackSwitchingEnabled(); --setpref=wasm_cont_stack_max_vmem=1

// Tests the cap on the virtual memory used by continuation stacks. A cap of one
// byte is too small for even a single stack, and we always allow one, so exactly
// one continuation may be live at a time.

const { makeA, makeB, clear, recur } = wasmEvalText(`(module
  (type $ft (func))
  (type $ct (cont $ft))
  (func $g (type $ft))
  (global $a (mut (ref null $ct)) (ref.null $ct))
  (global $b (mut (ref null $ct)) (ref.null $ct))
  (elem declare func $g $recur)

  (func (export "makeA")
    (global.set $a (cont.new $ct (ref.func $g))))
  (func (export "makeB")
    (global.set $b (cont.new $ct (ref.func $g))))
  (func (export "clear")
    (global.set $a (ref.null $ct))
    (global.set $b (ref.null $ct)))

  (func $recur (type $ft)
    (resume $ct (cont.new $ct (ref.func $recur))))
  (func (export "recur") (call $recur))
)`).exports;

makeA();
assertErrorMessage(() => makeB(), WebAssembly.RuntimeError,
                   /too many continuation stacks/);

// Dropping the continuation returns its stack, so the next one succeeds.
clear();
gc();
makeB();

// Unbounded `resume (cont.new ...)` recursion traps instead of mapping stacks
// until the process runs out of kernel mappings (bug 2058605).
clear();
gc();
assertErrorMessage(() => recur(), WebAssembly.RuntimeError,
                   /too many continuation stacks/);
