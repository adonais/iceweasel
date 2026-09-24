// |jit-test| skip-if: !getBuildConfiguration("jitspew")

// Test bounds check elimination for WebAssembly GC arrays via Ion MIR
// inspection. The BCE pass removes an array bounds check when the array was
// created in the same function by an array.new* with a constant length and
// the access uses a constant index that is in range.

// Simple array with constant length and constant indices: all checks removed.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new $arr (i32.const 0) (i32.const 10)))
      (array.set $arr (local.get $a) (i32.const 2) (i32.const 100))
      (array.set $arr (local.get $a) (i32.const 5) (i32.const 200))
      (i32.add
        (array.get $arr (local.get $a) (i32.const 2))
        (array.get $arr (local.get $a) (i32.const 5)))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetFirstMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
    "WasmBoundsCheck",
    "WasmBoundsCheck",
    "WasmBoundsCheck",
  ]);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "!WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(), 300);
}

// Two arrays with different constant lengths: all checks removed.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (result i32)
      (local $a1 (ref $arr))
      (local $a2 (ref $arr))
      (local.set $a1 (array.new $arr (i32.const 10) (i32.const 5)))
      (local.set $a2 (array.new $arr (i32.const 20) (i32.const 3)))
      (array.set $arr (local.get $a1) (i32.const 4) (i32.const 111))
      (array.set $arr (local.get $a2) (i32.const 2) (i32.const 222))
      (i32.add
        (array.get $arr (local.get $a1) (i32.const 4))
        (array.get $arr (local.get $a2) (i32.const 2)))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmNewArrayObject",
    "!WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(), 333);
}

// Non-constant array length: the bounds check must be kept.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (param $len i32) (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new $arr (i32.const 0) (local.get $len)))
      (array.get $arr (local.get $a) (i32.const 2))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(10), 0);
}

// Non-constant index: the bounds check must be kept.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (param $idx i32) (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new $arr (i32.const 42) (i32.const 10)))
      (array.get $arr (local.get $a) (local.get $idx))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(5), 42);
}

// Constant index out of bounds (index == length): the check must be kept and
// the access must trap.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test")
      (local $a (ref $arr))
      (local.set $a (array.new $arr (i32.const 0) (i32.const 5)))
      (drop (array.get $arr (local.get $a) (i32.const 5)))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
  ]);

  assertErrorMessage(() => wasmEvalText(wasmText).exports.test(),
                     WebAssembly.RuntimeError, /out of bounds/);
}

// Mixed constant and non-constant accesses: only the non-constant one keeps
// its check.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (param $idx i32) (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new $arr (i32.const 0) (i32.const 10)))
      (array.set $arr (local.get $a) (i32.const 2) (i32.const 100))
      (array.set $arr (local.get $a) (local.get $idx) (i32.const 200))
      (array.get $arr (local.get $a) (i32.const 2))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
    "!WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(5), 100);
}

// array.new_fixed takes its length from the number of operands, which is also
// a constant length: all checks removed.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new_fixed $arr 3
        (i32.const 10) (i32.const 20) (i32.const 30)))
      (array.set $arr (local.get $a) (i32.const 0) (i32.const 100))
      (i32.add
        (array.get $arr (local.get $a) (i32.const 0))
        (array.get $arr (local.get $a) (i32.const 2)))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetFirstMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
    "WasmBoundsCheck",
    "WasmBoundsCheck",
  ]);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "!WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(), 130);
}

// Constant index out of bounds of an array.new_fixed: the check must be kept
// and the access must trap.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test")
      (local $a (ref $arr))
      (local.set $a (array.new_fixed $arr 2 (i32.const 10) (i32.const 20)))
      (drop (array.get $arr (local.get $a) (i32.const 2)))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "WasmBoundsCheck",
  ]);

  assertErrorMessage(() => wasmEvalText(wasmText).exports.test(),
                     WebAssembly.RuntimeError, /out of bounds/);
}

// array.new_default with a constant length: all checks removed.
{
  const wasmText = `(module
    (type $arr (array (mut i32)))
    (func (export "test") (result i32)
      (local $a (ref $arr))
      (local.set $a (array.new_default $arr (i32.const 4)))
      (array.set $arr (local.get $a) (i32.const 3) (i32.const 42))
      (array.get $arr (local.get $a) (i32.const 3))))`;

  const ionJSON = wasmGetIon(wasmTextToBinary(wasmText), 0);
  assertOpcodesInOrder(wasmIonGetLastMIRPass(ionJSON), [
    "WasmNewArrayObject",
    "!WasmBoundsCheck",
  ]);

  assertEq(wasmEvalText(wasmText).exports.test(), 42);
}
