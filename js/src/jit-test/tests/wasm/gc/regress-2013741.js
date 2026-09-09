// Test that array.fill correctly pre-barriers reference-typed elements.

const {
  makeRefArray,
  fillNull,
  fillValue,
  makeStruct,
  getElement,
} = wasmEvalText(`(module
  (type $S (struct (field i32)))
  (type $A (array (mut anyref)))

  (func (export "makeStruct") (result anyref)
    (struct.new $S (i32.const 42))
  )

  (func (export "makeRefArray") (param i32) (result anyref)
    (array.new $A (ref.null any) (local.get 0))
  )

  (func (export "getElement") (param anyref) (param i32) (result anyref)
    (array.get $A (ref.cast (ref $A) (local.get 0)) (local.get 1))
  )

  (func (export "fillNull") (param anyref) (param i32)
    (array.fill $A
      (ref.cast (ref $A) (local.get 0))
      (i32.const 0)
      (ref.null any)
      (local.get 1))
  )

  (func (export "fillValue") (param anyref) (param i32) (param anyref)
    (array.fill $A
      (ref.cast (ref $A) (local.get 0))
      (i32.const 0)
      (local.get 2)
      (local.get 1))
  )
)`).exports;

const len = 16;
let arr = makeRefArray(len);
let s = makeStruct();

// Fill array with struct references
fillValue(arr, len, s);
assertEq(getElement(arr, 0), s);

// Overwriting non-null refs with null must pre-barrier the old values.
// verifyprebarriers() snapshots all edges, then on the second call checks
// that any removed edge was properly barriered.
verifyprebarriers();
fillNull(arr, len);
verifyprebarriers();

assertEq(getElement(arr, 0), null);

// Also test overwriting null refs with non-null (pre-barrier on null is a
// no-op, but the code path should still be exercised).
verifyprebarriers();
fillValue(arr, len, s);
verifyprebarriers();

assertEq(getElement(arr, 0), s);

// And overwriting non-null with a different non-null value.
let s2 = makeStruct();
verifyprebarriers();
fillValue(arr, len, s2);
verifyprebarriers();

assertEq(getElement(arr, 0), s2);
