// |jit-test| skip-if: !wasmStackSwitchingEnabled()

// Typed continuation references are not exposable to JS, same as contref.
const { param, result, table, global } = wasmEvalText(`(module
  (type $ft (func))
  (type $ct (cont $ft))
  (func (export "param") (param (ref null $ct)))
  (func (export "result") (result (ref null $ct))
    ref.null $ct)
  (table (export "table") 1 (ref null $ct))
  (global (export "global") (ref null $ct) (ref.null $ct)))`).exports;

const msg = /cannot pass value to or from JS/;
assertErrorMessage(() => param(null), TypeError, msg);
assertErrorMessage(() => result(), TypeError, msg);
assertErrorMessage(() => table.get(0), TypeError, msg);
assertErrorMessage(() => table.set(0, null), TypeError, msg);
assertErrorMessage(() => global.value, TypeError, msg);
