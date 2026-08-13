// |jit-test| skip-if: !wasmComponentsEnabled()

// Basic instantiation.
wasmValidateText(`
(component
  (core module)
  (core instance (instantiate 0))
)
`);

// Invalid module index.
wasmFailValidateText(`
(component
  (core module)
  (core instance (instantiate 1))
)
`, /invalid core module index 1/);

wasmFailValidateText(`
(component
  (core module)
  (core instance (instantiate 99))
)
`, /invalid core module index 99/);

// Multiple instances from different modules.
wasmValidateText(`
(component
  (core module)
  (core module)
  (core instance (instantiate 0))
  (core instance (instantiate 1))
)
`);

// Multiple instances from the same module.
wasmValidateText(`
(component
  (core module)
  (core instance (instantiate 0))
  (core instance (instantiate 0))
)
`);

// Core module with actual code, instantiated.
wasmValidateText(`
(component
  (core module
    (func (export "add") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (core instance (instantiate 0))
)
`);

// Instantiation with import args: a module that imports, satisfied by another
// instance's exports.
wasmValidateText(`
(component
  (core module
    (func (export "f") (result i32) (i32.const 42))
  )
  (core module
    (import "imp" "f" (func (result i32)))
  )
  (core instance (instantiate 0))
  (core instance (instantiate 1 (with "imp" (instance 0))))
)
`);

// Invalid instance index in instantiation args.
wasmFailValidateText(`
(component
  (core module
    (import "imp" "f" (func))
  )
  (core instance (instantiate 0 (with "imp" (instance 99))))
)
`, /invalid core instance index/);

// ----------------------------------------------------------------------------
// Inline exports

// Basic behavior.
wasmValidateText(`
(component
  (core module
    (func (export "f"))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (core instance (export "f" (func 0)))
)
`);

// Duplicate names are rejected.
wasmFailValidateText(`
(component
  (core module
    (func (export "f"))
  )
    (core instance (instantiate 0))
    (alias core export 0 "f" (core func))
    (core instance
      (export "f" (func 0))
      (export "f" (func 0))
    )
)
`, /duplicate name of inline export/);

// ----------------------------------------------------------------------------
// Core module import compatibility
//
// With components we can statically check the exports of one core module
// against the imports of another.

// Takes an export from one module (which must be named "x") and imports it
// into another module. Also does the same thing via inline exports and aliases
// to inline exports.
function linkModules(providerBody, consumerBody) {
  const m = providerBody.match(/\((\w+)\s*\(export\s+"x"/);
  if (!m) {
    throw new Error("Didn't find an item \"x\"");
  }
  const kindOfX = m[1];

  return `(component
    ;; pollute the component's index space so that any mistakes with aliases
    ;; will be more obvious
    (core module $mdummy
      (func (export "dfunc"))
      (table (export "dtable") 1 1 externref)
      (memory (export "dmemory") 1)
      (global (export "dglobal") (mut i32) i32.const 0)
      (tag (export "dtag") (param i32))
    )
    (core instance $idummy (instantiate $mdummy))
    ;; to increase the bizarro factor, we have a different number of items in
    ;; the address space for each sort
    (alias core export $idummy "dfunc" (core func))
    (alias core export $idummy "dtable" (core table))
    (alias core export $idummy "dtable" (core table))
    (alias core export $idummy "dmemory" (core memory))
    (alias core export $idummy "dmemory" (core memory))
    (alias core export $idummy "dmemory" (core memory))
    (alias core export $idummy "dglobal" (core global))
    (alias core export $idummy "dglobal" (core global))
    (alias core export $idummy "dglobal" (core global))
    (alias core export $idummy "dglobal" (core global))
    (alias core export $idummy "dtag" (core tag))
    (alias core export $idummy "dtag" (core tag))
    (alias core export $idummy "dtag" (core tag))
    (alias core export $idummy "dtag" (core tag))
    (alias core export $idummy "dtag" (core tag))

    ;; now the actual linking test
    (core module $m1 ${providerBody})
    (core module $m2 ${consumerBody})
    (core instance $i1 (instantiate $m1))
    (core instance $i2 (instantiate $m2 (with "imp" (instance $i1))))

    ;; also via inline exports
    (alias core export $i1 "x" (core ${kindOfX} $a1))
    (core instance $i3
      ;; yet again pollute the index space in exciting ways
      (export "a" (${kindOfX} $a1)) (export "b" (${kindOfX} $a1))
      (export "c" (${kindOfX} $a1)) (export "d" (${kindOfX} $a1))

      (export "x" (${kindOfX} $a1))
    )
    (core instance $i4 (instantiate $m2 (with "imp" (instance $i3))))

    ;; also via aliases to inline exports!
    (alias core export $i3 "x" (core ${kindOfX} $a2))
    (core instance $i5 (export "x" (${kindOfX} $a2)))
    (core instance $i6 (instantiate $m2 (with "imp" (instance $i5))))

    ;; and finally via explicit outer aliases in many silly ways

    ;; TODO(wasm-cm): wasm-tools currently only allows outer aliases to "pure"
    ;; definitions, i.e. core modules and types, component types, and
    ;; components. It is not clear whether other kinds of outer aliases are
    ;; supposed to be allowed.
    ;; See https://github.com/bytecodealliance/wasm-tools/issues/2545

    ;; (alias outer 0 $a1 (core ${kindOfX} $a3))
    ;; (core instance $i7 (export "x" (${kindOfX} $a3)))
    ;; (core instance $i8 (instantiate $m2 (with "imp" (instance $i7))))

    ;; (alias outer 0 $a3 (core ${kindOfX} $a4))
    ;; (core instance $i9 (export "x" (${kindOfX} $a4)))
    ;; (core instance $i10 (instantiate $m2 (with "imp" (instance $i9))))
  )`;
}

// ----------------------------------------------------------------------------
// Cross-cutting link errors

// No instantiate arg supplied for the imported module name.
wasmFailValidateText(
  linkModules(
    `(func (export "x"))`,
    `(import "missing" "x" (func))`,
  ),
  /no instantiate arg found/,
);

// No matching export for the imported field name.
wasmFailValidateText(
  linkModules(
    `(func (export "x"))`,
    `(import "imp" "y" (func))`,
  ),
  /no matching export for core module import/,
);

// ----------------------------------------------------------------------------
// Functions

// Exact type match.
wasmValidateText(linkModules(
  `(func (export "x") (param i32) (result i32) (local.get 0))`,
  `(import "imp" "x" (func (param i32) (result i32)))`,
));

// A subtype export satisfies a supertype import: the export's declared type is
// a subtype of the import's declared type. This must use subtyping, not exact
// type equality.
wasmValidateText(linkModules(
  `(type $super (sub (func)))
   (type $sub (sub $super (func)))
   (func (export "x") (type $sub))`,
  `(type $super (sub (func)))
   (import "imp" "x" (func (type $super)))`,
));

// A supertype export does not satisfy a subtype import.
wasmFailValidateText(
  linkModules(
    `(type $super (sub (func)))
     (func (export "x") (type $super))`,
    `(type $super (sub (func)))
     (type $sub (sub $super (func)))
     (import "imp" "x" (func (type $sub)))`,
  ),
  /incompatible function type for import/,
);

// Arity mismatch.
wasmFailValidateText(
  linkModules(
    `(func (export "x") (param i32))`,
    `(import "imp" "x" (func (param i32 i32)))`,
  ),
  /incompatible function type for import/,
);

// Value-type mismatch.
wasmFailValidateText(
  linkModules(
    `(func (export "x") (param i32))`,
    `(import "imp" "x" (func (param f32)))`,
  ),
  /incompatible function type for import/,
);

// Wrong sort: importing a function but the export is a global.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (func))`,
  ),
  /expected a core function/,
);

// ----------------------------------------------------------------------------
// Tables

// Element type matches.
wasmValidateText(linkModules(
  `(table (export "x") 10 funcref)`,
  `(import "imp" "x" (table 10 funcref))`,
));

// Element type mismatch.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 funcref)`,
    `(import "imp" "x" (table 10 externref))`,
  ),
  /incompatible table type for import/,
);

// Import min below export min.
wasmValidateText(linkModules(
  `(table (export "x") 10 funcref)`,
  `(import "imp" "x" (table 5 funcref))`,
));

// Import min above export min.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 funcref)`,
    `(import "imp" "x" (table 12 funcref))`,
  ),
  /incompatible table type for import/,
);

// Import max above export max.
wasmValidateText(linkModules(
  `(table (export "x") 10 20 funcref)`,
  `(import "imp" "x" (table 10 25 funcref))`,
));

// Import max below export max.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 20 funcref)`,
    `(import "imp" "x" (table 10 18 funcref))`,
  ),
  /incompatible table type for import/,
);

// Import constrains an unbounded export.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 funcref)`,
    `(import "imp" "x" (table 10 20 funcref))`,
  ),
  /incompatible table type for import/,
);

// i64 index type matches.
wasmValidateText(linkModules(
  `(table (export "x") i64 10 funcref)`,
  `(import "imp" "x" (table i64 10 funcref))`,
));

// i32 export vs i64 import.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 funcref)`,
    `(import "imp" "x" (table i64 10 funcref))`,
  ),
  /incompatible table type for import/,
);

// i64 export vs i32 import.
wasmFailValidateText(
  linkModules(
    `(table (export "x") i64 10 funcref)`,
    `(import "imp" "x" (table 10 funcref))`,
  ),
  /incompatible table type for import/,
);

// Wrong sort: importing a table but the export is a global.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (table 10 funcref))`,
  ),
  /expected a table/,
);

// ----------------------------------------------------------------------------
// Memories

// Import min below export min.
wasmValidateText(linkModules(
  `(memory (export "x") 2)`,
  `(import "imp" "x" (memory 1))`,
));

// Import min equals export min.
wasmValidateText(linkModules(
  `(memory (export "x") 2)`,
  `(import "imp" "x" (memory 2))`,
));

// Import min above export min.
wasmFailValidateText(
  linkModules(
    `(memory (export "x") 2)`,
    `(import "imp" "x" (memory 3))`,
  ),
  /incompatible memory type for import/,
);

// Import max above export max.
wasmValidateText(linkModules(
  `(memory (export "x") 2 4)`,
  `(import "imp" "x" (memory 2 5))`,
));

// Import max below export max.
wasmFailValidateText(
  linkModules(
    `(memory (export "x") 2 4)`,
    `(import "imp" "x" (memory 2 3))`,
  ),
  /incompatible memory type for import/,
);

// Import constrains an unbounded export.
wasmFailValidateText(
  linkModules(
    `(memory (export "x") 2)`,
    `(import "imp" "x" (memory 2 4))`,
  ),
  /incompatible memory type for import/,
);

if (sharedMemoryEnabled()) {
  // Shared matches shared.
  wasmValidateText(linkModules(
    `(memory (export "x") 2 4 shared)`,
    `(import "imp" "x" (memory 2 4 shared))`,
  ));

  // Shared export vs unshared import.
  wasmFailValidateText(
    linkModules(
      `(memory (export "x") 2 4 shared)`,
      `(import "imp" "x" (memory 2 4))`,
    ),
    /incompatible memory type for import/,
  );

  // Unshared export vs shared import.
  wasmFailValidateText(
    linkModules(
      `(memory (export "x") 2 4)`,
      `(import "imp" "x" (memory 2 4 shared))`,
    ),
    /incompatible memory type for import/,
  );
}

// i64 index type matches.
wasmValidateText(linkModules(
  `(memory (export "x") i64 2)`,
  `(import "imp" "x" (memory i64 2))`,
));

// i32 export vs i64 import.
wasmFailValidateText(
  linkModules(
    `(memory (export "x") 2)`,
    `(import "imp" "x" (memory i64 2))`,
  ),
  /incompatible memory type for import/,
);

// i64 export vs i32 import.
wasmFailValidateText(
  linkModules(
    `(memory (export "x") i64 2)`,
    `(import "imp" "x" (memory 2))`,
  ),
  /incompatible memory type for import/,
);

// Wrong sort: importing a memory but the export is a global.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (memory 1 1))`,
  ),
  /expected a memory/,
);

// ----------------------------------------------------------------------------
// Globals

// Immutable exact type.
wasmValidateText(linkModules(
  `(global (export "x") i32 (i32.const 0))`,
  `(import "imp" "x" (global i32))`,
));

// Immutable type mismatch.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (global i64))`,
  ),
  /incompatible global type for import/,
);

// Immutable subtype: (ref func) <: funcref is allowed because the import is
// immutable.
wasmValidateText(linkModules(
  `(func $f) (global (export "x") (ref func) (ref.func $f))`,
  `(import "imp" "x" (global funcref))`,
));

// Mutable exact type.
wasmValidateText(linkModules(
  `(global (export "x") (mut i32) (i32.const 0))`,
  `(import "imp" "x" (global (mut i32)))`,
));

// Immutable export to mutable import.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (global (mut i32)))`,
  ),
  /incompatible global type for import/,
);

// Mutable export to immutable import.
wasmFailValidateText(
  linkModules(
    `(global (export "x") (mut i32) (i32.const 0))`,
    `(import "imp" "x" (global i32))`,
  ),
  /incompatible global type for import/,
);

// Mutable globals are invariant: a subtype is rejected.
wasmFailValidateText(
  linkModules(
    `(func $f) (global (export "x") (mut (ref func)) (ref.func $f))`,
    `(import "imp" "x" (global (mut funcref)))`,
  ),
  /incompatible global type for import/,
);

// Wrong sort: importing a global but the export is a table.
wasmFailValidateText(
  linkModules(
    `(table (export "x") 10 funcref)`,
    `(import "imp" "x" (global (mut funcref)))`,
  ),
  /expected a global/,
);

// ----------------------------------------------------------------------------
// Tags

// Exact signature.
wasmValidateText(linkModules(
  `(tag (export "x") (param i32))`,
  `(import "imp" "x" (tag (param i32)))`,
));

// Param type mismatch.
wasmFailValidateText(
  linkModules(
    `(tag (export "x") (param i32))`,
    `(import "imp" "x" (tag (param f32)))`,
  ),
  /incompatible tag type for import/,
);

// Param present vs absent.
wasmFailValidateText(
  linkModules(
    `(tag (export "x") (param i32))`,
    `(import "imp" "x" (tag))`,
  ),
  /incompatible tag type for import/,
);

// Param absent vs present.
wasmFailValidateText(
  linkModules(
    `(tag (export "x"))`,
    `(import "imp" "x" (tag (param i32)))`,
  ),
  /incompatible tag type for import/,
);

// Wrong sort: importing a tag but the export is a global.
wasmFailValidateText(
  linkModules(
    `(global (export "x") i32 (i32.const 0))`,
    `(import "imp" "x" (tag))`,
  ),
  /expected a tag/,
);
