// |jit-test| skip-if: !wasmComponentsEnabled()

// Export a function.
wasmValidateText(`
(component
  (type (func (param "a" s32) (param "b" s32) (result s32)))

  (core module
    (func (export "add_impl") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (core instance (instantiate 0))
  (alias core export 0 "add_impl" (core func))
  (func (type 0) (canon lift (core func 0)))
  (export "add" (func 0))
)
`);

// Export a type.
wasmValidateText(`
(component
  (type (record (field "x" f64) (field "y" f64)))
  (export "point" (type 0))
)
`);

// Export a core module.
wasmValidateText(`
(component
  (core module
    (func (export "add") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (export "adder" (core module 0))
)
`);

// Export multiple items of different sorts.
wasmValidateText(`
(component
  (core module
    (func (export "add") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (core module
    (func (export "sub") (param i32 i32) (result i32)
      (i32.sub (local.get 0) (local.get 1))
    )
  )

  (export "adder" (core module 0))
  (export "subber" (core module 1))
)
`);

// Invalid function index.
wasmFailValidateText(`
(component
  (type (func (param "a" s32) (param "b" s32) (result s32)))

  (core module
    (func (export "add_impl") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (core instance (instantiate 0))
  (alias core export 0 "add_impl" (core func))
  (func (type 0) (canon lift (core func 0)))
  (export "add" (func 1))
)
`, /invalid function index 1/);

// Invalid type index.
wasmFailValidateText(`
(component
  (type u32)
  (export "bad" (type 5))
)
`, /invalid type index 5/);

// Invalid core module index.
wasmFailValidateText(`
(component
  (core module)
  (export "bad" (core module 1))
)
`, /invalid core module index 1/);

// ----------------------------------------------------------------------------
// Export name well-formedness

// Valid plain export names.
wasmValidateText(`
(component
  (core module)
  (export "my-module" (core module 0))
)
`);

// Valid interface export name.
// TODO(wasm-cm): Should we support interface names?
wasmFailValidateText(`
(component
  (core module)
  (export "wasi:http/handler" (core module 0))
)
`, /invalid characters in export name/);

// Export name must not be empty.
wasmFailValidateText(`
(component
  (core module)
  (export "" (core module 0))
)
`, /export name cannot be empty/);

// Export name with invalid characters.
wasmFailValidateText(`
(component
  (core module)
  (export "no spaces" (core module 0))
)
`, /invalid characters in export name/);

// Duplicate export names should be rejected.
wasmFailValidateText(`
(component
  (core module)
  (export "same" (core module 0))
  (export "same" (core module 0))
)
`, /not strongly-unique/);

// Export a component - requires nested components (section ID 4) which aren't
// supported, so the component section itself is rejected.
// TODO(wasm-cm)
wasmFailValidateText(`
(component
  (component)
  (export "inner" (component 0))
)
`, /unexpected section ID/);

// Export a component instance - also requires nested components.
// TODO(wasm-cm)
wasmFailValidateText(`
(component
  (component)
  (instance (instantiate 0))
  (export "inst" (instance 0))
)
`, /unexpected section ID/);

// ----------------------------------------------------------------------------
// Integration test

// A complete component exercising types, core modules, instances, aliases,
// canon lift, and exports together.
wasmValidateText(`
(component
  (type (func (param "a" s32) (param "b" s32) (result s32)))

  (core module
    (func (export "add_impl") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1))
    )
  )
  (core module
    (func (export "sub_impl") (param i32 i32) (result i32)
      (i32.sub (local.get 0) (local.get 1))
    )
  )

  (core instance (instantiate 0))
  (core instance (instantiate 1))

  (alias core export 0 "add_impl" (core func))
  (alias core export 1 "sub_impl" (core func))
  (func (type 0) (canon lift (core func 0)))
  (func (type 0) (canon lift (core func 1)))

  (export "add" (func 0))
  (export "sub" (func 1))
)
`);

// ----------------------------------------------------------------------------
// Index spaces (because unlike in core wasm, component exports add to their
// index spaces just like imports do)

// Exported types add to the type index space
wasmValidateText(`(component
  (type s32)
  (export "t" (type 0)) ;; no identifier, no explicit externdesc
  (type f32)

  ;; There are three types defined now (one by the export), so this is valid
  (type (func (param "x" 2)))

  ;; Validate that the types are what we think they are
  (core module $M
    (func (export "foo") (param f32))
  )
  (core instance $I (instantiate $M))
  (func (type 3) (canon lift (core func $I "foo")))
)`);

// TODO(wasm-cm): Add tests for other index spaces

// ----------------------------------------------------------------------------
// Ascribing other types to exports

// A type reference to a primitive is equal to a raw primitive.
wasmValidateText(`(component
  (type s32)
  (import "f" (func $f (param "x" 0)))
  (import "g" (func $g (param "x" s32)))

  (export "f" (func $f) (func (param "x" s32)))
  (export "g" (func $g) (func (param "x" 0)))
)`);

// Eq bounds to existing types are valid.
wasmValidateText(`(component
  (type s32)
  (type s32)
  (export "t" (type 0) (type (eq 1)))
)`);

// This also works when imports are involved.
wasmValidateText(`(component
  (type (record (field "x" f32) (field "y" f32)))
  (import "t1" (type (eq 0)))
  (export "t0" (type 0))
  (export "t00" (type 0) (type (eq 0)))
  (export "t01" (type 0) (type (eq 1)))
  (export "t02" (type 0) (type (eq 2)))
  (export "t03" (type 0) (type (eq 3)))
  (export "t10" (type 1) (type (eq 0)))
  (export "t11" (type 1) (type (eq 1)))
  (export "t12" (type 1) (type (eq 2)))
  (export "t13" (type 1) (type (eq 3)))
  (export "t20" (type 2) (type (eq 0)))
  (export "t21" (type 2) (type (eq 1)))
  (export "t22" (type 2) (type (eq 2)))
  (export "t23" (type 2) (type (eq 3)))
)`);

// It's always valid to say you are (eq $yourself); this is the default.
wasmValidateText(`(component
  (type s32)
  (export "t" (type 0) (type (eq 0)))
)`);
wasmValidateText(`(component
  (type (resource (rep i32)))
  (export "t" (type 0) (type (eq 0)))
)`);
wasmValidateText(`(component
  (import "r" (type (sub resource)))
  (export "r" (type 0) (type (eq 0)))
)`);

// You can ascribe the more-general (sub resource) type to a defined
// resource type.
wasmValidateText(`(component
  (type $r (resource (rep i32)))
  (export "r1" (type $r))
  (export "r2" (type $r) (type (sub resource)))
)`);

// You can also do this to an imported resource type.
wasmValidateText(`(component
  (import "r" (type (sub resource)))
  (export "r" (type 0) (type (sub resource)))
)`);

// If the ascribed type doesn't match, fail.
wasmFailValidateText(`(component
  (type s32)
  (type $r (resource (rep i32)))
  (export "r" (type $r) (type (eq 0)))
)`, /did not match/);
wasmFailValidateText(`(component
  (type s32)
  (type $r (resource (rep i32)))
  (export "r" (type 0) (type (eq $r)))
)`, /did not match/);
wasmFailValidateText(`(component
  (type s32)
  (type $r (resource (rep i32)))
  (export "r" (type 0) (type (sub resource)))
)`, /did not match/);
wasmFailValidateText(`(component
  (type $r (resource (rep i32)))
  (import "r1" (type (sub resource)))
  (export "r2" (type 1) (type (eq 0)))
)`, /did not match/);
