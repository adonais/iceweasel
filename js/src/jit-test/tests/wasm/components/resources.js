// |jit-test| skip-if: !wasmComponentsEnabled()

// ----------------------------------------------------------------------------
// Simple defined resource types

wasmValidateText(`(component
  (core module $m
    (func (export "dtor") (param i32))
  )
  (core instance $i (instantiate 0))
  (alias core export $i "dtor" (core func $dtor))

  (type $node1 (resource (rep i32)))
  (type $node2 (resource (rep i32) (dtor (func $dtor))))

  (type $node1func (func (param "n" (borrow $node1))))
  (type $node2func (func (param "n" (own $node2))))

  (func (type $node1func) (canon lift (core func $dtor)))
  (func (type $node2func) (canon lift (core func $dtor)))
)`);

// ----------------------------------------------------------------------------
// Invalid destructor types

wasmFailValidateText(`(component
  (type $node (resource (rep i32) (dtor (func 99))))
)`, /invalid core func index/);

wasmFailValidateText(`(component
  (core module $m
    (func (export "dtor"))
  )
  (core instance $i (instantiate 0))
  (alias core export $i "dtor" (core func $dtor))
  (type $node (resource (rep i32) (dtor (func $dtor))))
)`, /invalid signature/);

wasmFailValidateText(`(component
  (core module $m
    (func (export "dtor") (param i32 i32))
  )
  (core instance $i (instantiate 0))
  (alias core export $i "dtor" (core func $dtor))
  (type $node (resource (rep i32) (dtor (func $dtor))))
)`, /invalid signature/);

wasmFailValidateText(`(component
  (core module $m
    (func (export "dtor") (param i32) (result i32)
      i32.const 0
    )
  )
  (core instance $i (instantiate 0))
  (alias core export $i "dtor" (core func $dtor))
  (type $node (resource (rep i32) (dtor (func $dtor))))
)`, /invalid signature/);

// ----------------------------------------------------------------------------
// Imported resource types (without nested components)

wasmValidateText(`(component
  ;; These are all considered equal
  (import "T1" (type $T1 (sub resource)))
  (import "T2" (type $T2 (eq $T1)))
  (import "T3" (type $T3 (eq $T2)))

  ;; By extension, so are these
  (type $FT1 (func (param "v" (borrow $T1))))
  (type $FT2 (func (param "v" (borrow $T2))))
  (type $FT3 (func (param "v" (borrow $T3))))

  (core module
    (func (export "f") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func $f))
  (func $F1 (type $FT1) (canon lift (core func $f)))
  (func $F2 (type $FT2) (canon lift (core func $f)))
  (func $F3 (type $FT3) (canon lift (core func $f)))

  ;; All these exports are therefore valid. (Some of these use an explicit
  ;; externtype to test subtyping.)
  (export "F1" (func $F1))
  (export "F11" (func $F1) (func (type $FT1)))
  (export "F12" (func $F1) (func (type $FT2)))
  (export "F13" (func $F1) (func (type $FT3)))
  (export "F2" (func $F2))
  (export "F21" (func $F2) (func (type $FT1)))
  (export "F22" (func $F2) (func (type $FT2)))
  (export "F23" (func $F2) (func (type $FT3)))
  (export "F3" (func $F3))
  (export "F31" (func $F3) (func (type $FT1)))
  (export "F32" (func $F3) (func (type $FT2)))
  (export "F33" (func $F3) (func (type $FT3)))
)`);

// Test generativity / equality of resource types
{
  const preamble = `
    ;; Each block of definitions here is mutually equal, and unequal
    ;; to all other blocks.

    (type $T1 (resource (rep i32)))
    (export $T1E "T1E" (type $T1))
    (export $T1EE "T1EE" (type $T1E))

    (export $T1S "T1S" (type $T1) (type (sub resource)))
    (export $T1SE "T1SE" (type $T1S))
    (export $T1SEE "T1SEE" (type $T1SE))

    (type $T2 (resource (rep i32)))
    (export $T2E "T2E" (type $T2))
    (export $T2EE "T2EE" (type $T2E))

    (export $T2S "T2S" (type $T2) (type (sub resource)))
    (export $T2SE "T2SE" (type $T2S))
    (export $T2SEE "T2SEE" (type $T2SE))

    (import "T3" (type $T3 (sub resource)))
    (import "T3E" (type $T3E (eq $T3)))
    (import "T3EE" (type $T3EE (eq $T3E)))

    (export $T3S "T3S" (type $T3) (type (sub resource)))
    (export $T3SE "T3SE" (type $T3S))
    (export $T3SEE "T3SEE" (type $T3SE))

    (import "T4" (type $T4 (sub resource)))
    (import "T4E" (type $T4E (eq $T4)))
    (import "T4EE" (type $T4EE (eq $T4E)))

    ;; slight break from pattern; let's re-export an eq
    (export $T4ES "T4ES" (type $T4E) (type (sub resource)))
    (export $T4ESE "T4ESE" (type $T4ES))
    (export $T4ESEE "T4ESEE" (type $T4ESE))
  `;

  const allTypes = [
    "$T1", "$T1E", "$T1EE", "$T1S", "$T1SE", "$T1SEE",
    "$T2", "$T2E", "$T2EE", "$T2S", "$T2SE", "$T2SEE",
    "$T3", "$T3E", "$T3EE", "$T3S", "$T3SE", "$T3SEE",
    "$T4", "$T4E", "$T4EE", "$T4ES", "$T4ESE", "$T4ESEE",
  ];
  const eqSets = [
    ["$T1", "$T1E", "$T1EE"],
    ["$T1S", "$T1SE", "$T1SEE"],
    ["$T2", "$T2E", "$T2EE"],
    ["$T2S", "$T2SE", "$T2SEE"],
    ["$T3", "$T3E", "$T3EE"],
    ["$T3S", "$T3SE", "$T3SEE"],
    ["$T4", "$T4E", "$T4EE"],
    ["$T4ES", "$T4ESE", "$T4ESEE",],
  ]
  for (const t of allTypes) {
    const eqSet = eqSets.filter(s => s.includes(t))[0];
    for (const other of allTypes) {
      const decl = `(export "test" (type ${t}) (type (eq ${other})))`;
      const ok = eqSet.includes(other);
      print(`expect ${ok ? "ok" : "not ok"}: ${decl}`);

      const componentText = `(component
        ${preamble}
        ${decl}
      )`;
      if (ok) {
        wasmValidateText(componentText);
      } else {
        wasmFailValidateText(componentText, /did not match explicitly-provided type/);
      }
    }

    // Extra checks: ascribing (sub resource) on export should always
    // succeed, and ascribing (func) should always fail (bad externtype).
    wasmValidateText(`(component
      ${preamble}
      (export "test" (type ${t}) (type (sub resource)))
    )`);
    wasmFailValidateText(`(component
      ${preamble}
      (export "test" (type ${t}) (func))
    )`, /did not match explicitly-provided type/);
  }
}

// You cannot import a resource type equal to a defined resource type
wasmFailValidateText(`(component
  (type $T1 (resource (rep i32)))
  (import "T1E" (type $T1E (eq $T1)))
)`, /cannot import a type equal to a defined resource type/);
