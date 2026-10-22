// |jit-test| skip-if: !wasmComponentsEnabled()


// ----------------------------------------------------------------------------
// Validation of extra conditions for [constructor], [method], [static], [get],
// and [set]

const preamble = `
  (import "imported" (type $I (sub resource)))
  (import "other" (type $O (sub resource)))

  (type $R (resource (rep i32)))
  (export $E "EXPORTED" (type $R))

  (core module
    (memory (export "mem") 0)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)

    (func (export "void-void"))
    (func (export "i32-void") (param i32))
    (func (export "i32i32-void") (param i32 i32))
    (func (export "i32i32i32-void") (param i32 i32 i32))
    (func (export "void-i32") (result i32) i32.const 0)
    (func (export "i32-i32") (param i32) (result i32) i32.const 0)
    (func (export "i32i32-i32") (param i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "mem" (core memory $mem))
  (alias core export 0 "realloc" (core func $realloc))
  (alias core export 0 "void-void" (core func $void-void))
  (alias core export 0 "i32-void" (core func $i32-void))
  (alias core export 0 "i32i32-void" (core func $i32i32-void))
  (alias core export 0 "i32i32i32-void" (core func $i32i32i32-void))
  (alias core export 0 "void-i32" (core func $void-i32))
  (alias core export 0 "i32-i32" (core func $i32-i32))
  (alias core export 0 "i32i32-i32" (core func $i32i32-i32))

  (type $TConstructorI (func (result (own $I))))
  (type $TConstructorE (func (result (own $E))))
  (type $TConstructorIR (func (result (result (own $I)))))
  (type $TConstructorER (func (result (result (own $E) (error s32)))))
  (type $TMethodI (func (param "self" (borrow $I))))
  (type $TMethodE (func (param "self" (borrow $E))))
  (type $TMethodGetI (func (param "self" (borrow $I)) (result s32)))
  (type $TMethodGetE (func (param "self" (borrow $E)) (result s32)))
  (type $TMethodGetIR (func (param "self" (borrow $I)) (result (result s32))))
  (type $TMethodGetER (func (param "self" (borrow $E)) (result (result s32 (error f32)))))
  (type $TMethodSetI (func (param "self" (borrow $I)) (param "v" s32)))
  (type $TMethodSetE (func (param "self" (borrow $E)) (param "v" s32)))
  (type $TMethodSetIR (func (param "self" (borrow $I)) (param "v" s32) (result (result))))
  (type $TMethodSetER (func (param "self" (borrow $E)) (param "v" s32) (result (result (error s64)))))
  (type $TConstructorO (func (result (own $O))))
  (type $TMethodO (func (param "self" (borrow $O))))
  (type $Tvoid (func))
  (type $TpS32 (func (param "v" s32)))
  (type $TrS32 (func (result s32)))

  (func $ConstructorI (type $TConstructorI) (canon lift (core func $void-i32)))
  (func $ConstructorE (type $TConstructorE) (canon lift (core func $void-i32)))
  (func $ConstructorO (type $TConstructorO) (canon lift (core func $void-i32)))
  (func $ConstructorIR (type $TConstructorIR) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (func $ConstructorER (type $TConstructorER) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (func $MethodI (type $TMethodI) (canon lift (core func $i32-void)))
  (func $MethodE (type $TMethodE) (canon lift (core func $i32-void)))
  (func $MethodO (type $TMethodO) (canon lift (core func $i32-void)))
  (func $MethodGetI (type $TMethodGetI) (canon lift (core func $i32-i32)))
  (func $MethodGetE (type $TMethodGetE) (canon lift (core func $i32-i32)))
  (func $MethodGetIR (type $TMethodGetIR) (canon lift (core func $i32-i32) (memory $mem) (realloc $realloc)))
  (func $MethodGetER (type $TMethodGetER) (canon lift (core func $i32-i32) (memory $mem) (realloc $realloc)))
  (func $MethodSetI (type $TMethodSetI) (canon lift (core func $i32i32-void)))
  (func $MethodSetE (type $TMethodSetE) (canon lift (core func $i32i32-void)))
  (func $MethodSetIR (type $TMethodSetIR) (canon lift (core func $i32i32-i32) (memory $mem) (realloc $realloc)))
  (func $MethodSetER (type $TMethodSetER) (canon lift (core func $i32i32-i32) (memory $mem) (realloc $realloc)))
  (func $void (type $Tvoid) (canon lift (core func $void-void)))
  (func $pS32 (type $TpS32) (canon lift (core func $i32-void)))
  (func $rS32 (type $TrS32) (canon lift (core func $void-i32)))
`;

// Valid constructor.
wasmValidateText(`(component
  ${preamble}
  (import "[constructor]imported" (func (type $TConstructorI)))
)`);
wasmValidateText(`(component
  ${preamble}
  (import "[constructor]imported" (func (type $TConstructorIR)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[constructor]EXPORTED" (func $ConstructorE))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[constructor]EXPORTED" (func $ConstructorER))
)`);

// Valid method.
wasmValidateText(`(component
  ${preamble}
  (import "[method]imported.FOO" (func (type $TMethodI)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[method]EXPORTED.foo" (func $MethodE))
)`);

// Valid static.
wasmValidateText(`(component
  ${preamble}
  (import "[static]imported.FOO" (func (type $TpS32)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[static]EXPORTED.foo" (func $pS32))
)`);

// Valid freestanding getter/setter.
wasmValidateText(`(component
  ${preamble}
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $TpS32)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $pS32))
)`);

// Valid method getter/setter.
wasmValidateText(`(component
  ${preamble}
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.foo" (func (type $TMethodSetI)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
  (export "[method][set]EXPORTED.foo" (func $MethodSetE))
)`);

// Valid static getter/setter.
wasmValidateText(`(component
  ${preamble}
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.foo" (func (type $TpS32)))
)`);
wasmValidateText(`(component
  ${preamble}
  (export "[static][get]EXPORTED.foo" (func $rS32))
  (export "[static][set]EXPORTED.foo" (func $pS32))
)`);

// Name annotations can only be used on functions.
wasmFailValidateText(`(component
  ${preamble}
  (import "[static]imported.foo" (type (sub resource)))
)`, /name annotations can only be used with functions/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[get]foo" (type (sub resource)))
)`, /name annotations can only be used with functions/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[static]EXPORTED.foo" (type $R))
)`, /name annotations can only be used with functions/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[get]foo" (type $R))
)`, /name annotations can only be used with functions/);

// Resource names must be strictly equal, not just equal under
// strong uniqueness.
wasmFailValidateText(`(component
  ${preamble}
  (import "[constructor]IMPORTED" (func (type $TConstructorI)))
)`, /no preceding resource type/)
wasmFailValidateText(`(component
  ${preamble}
  (export "[constructor]EX-PORTED" (func $ConstructorE))
)`, /no preceding resource type/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method]im-ported.FOO" (func (type $TMethodI)))
)`, /no preceding resource type/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method]exported.foo" (func $MethodE))
)`, /no preceding resource type/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[static]IM-ported.FOO" (func (type $TpS32)))
)`, /no preceding resource type/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[static]ex-PORTED.foo" (func $pS32))
)`, /no preceding resource type/);

// The named resource type must actually be used in the params/results.
wasmFailValidateText(`(component
  ${preamble}
  (import "[constructor]imported" (func (type $TConstructorO)))
)`, /must return \(own/)
wasmFailValidateText(`(component
  ${preamble}
  (export "[constructor]EXPORTED" (func $ConstructorO))
)`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method]imported.FOO" (func (type $TMethodO)))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method]EXPORTED.foo" (func $MethodO))
)`, /must have a first parameter \(param "self"/);

// Constructors must return the resource type.
wasmFailValidateText(`(component
  ${preamble}
  (import "[constructor]imported" (func (type $Tvoid)))
)`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[constructor]imported" (func (type $TrS32)))
)`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (result (result s32))))
  (import "[constructor]imported" (func (type $TT)))
)`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[constructor]EXPORTED" (func $void))
  )`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[constructor]EXPORTED" (func $rS32))
)`, /must return \(own/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (result (result s32))))
  (func $FF (type $TT) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (export "[constructor]EXPORTED" (func $FF))
)`, /must return \(own/);

// Methods require a self param.
wasmFailValidateText(`(component
  ${preamble}
  (import "[method]imported.FOO" (func (type $Tvoid)))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method]imported.FOO" (func (type $TpS32)))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method]EXPORTED.foo" (func $void))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method]EXPORTED.foo" (func $pS32))
)`, /must have a first parameter \(param "self"/);

// The self param must be named exactly "self".
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "this" (borrow $I))))
  (import "[method]imported.FOO" (func (type $TT)))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "SELF" (borrow $I))))
  (import "[method]imported.FOO" (func (type $TT)))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "this" (borrow $E))))
  (func $FF (type $TT) (canon lift (core func $i32-void)))
  (export "[method]EXPORTED.foo" (func $FF))
)`, /must have a first parameter \(param "self"/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "SELF" (borrow $E))))
  (func $FF (type $TT) (canon lift (core func $i32-void)))
  (export "[method]EXPORTED.foo" (func $FF))
)`, /must have a first parameter \(param "self"/);

// Getters must have no params (besides self for methods).
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "x" s32) (result s32)))
  (import "[get]foo" (func (type $TT)))
)`, /must have no parameters/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "x" s32) (result s32)))
  (func $FF (type $TT) (canon lift (core func $i32-i32)))
  (export "[get]foo" (func $FF))
)`, /must have no parameters/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $I)) (param "x" s32) (result s32)))
  (import "[method][get]imported.foo" (func (type $TT)))
)`, /must have no parameters besides self/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (param "x" s32) (result s32)))
  (func $FF (type $TT) (canon lift (core func $i32i32-i32)))
  (export "[method][get]EXPORTED.foo" (func $FF))
)`, /must have no parameters besides self/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "x" s32) (result s32)))
  (import "[static][get]imported.foo" (func (type $TT)))
)`, /must have no parameters/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "x" s32) (result s32)))
  (func $FF (type $TT) (canon lift (core func $i32-i32)))
  (export "[static][get]EXPORTED.foo" (func $FF))
)`, /must have no parameters/);

// Getters must return a value.
wasmFailValidateText(`(component
  ${preamble}
  (import "[get]foo" (func (type $Tvoid)))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (result (result (error s32)))))
  (import "[get]foo" (func (type $TT)))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[get]foo" (func $void))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (result (result (error s32)))))
  (func $FF (type $TT) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (export "[get]foo" (func $FF))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method][get]imported.foo" (func (type $TMethodI)))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (result (result))))
  (func $FF (type $TT) (canon lift (core func $i32-i32)))
  (export "[method][get]EXPORTED.foo" (func $FF))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[static][get]imported.foo" (func (type $Tvoid)))
)`, /must return a value/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (result (result (error s32)))))
  (func $FF (type $TT) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (export "[static][get]EXPORTED.foo" (func $FF))
)`, /must return a value/);

// Freestanding setters require exactly one param.
wasmFailValidateText(`(component
  ${preamble}
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $Tvoid)))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (param "w" s32)))
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $TT)))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $void))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (param "w" s32)))
  (func $FF (type $TT) (canon lift (core func $i32i32-void)))
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $FF))
)`, /must have only one parameter/);

// Freestanding setter params must match the getter's property type.
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" u32)))
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $TT)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TGet (func (result (result s32))))
  (type $TSet (func (param "v" (result s32))))
  (import "[get]foo" (func (type $TGet)))
  (import "[set]foo" (func (type $TSet)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" u32)))
  (func $FF (type $TT) (canon lift (core func $i32-void)))
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $FF))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TGet (func (result (result s32))))
  (type $TSet (func (param "v" (result s32))))
  (func $FGet (type $TGet) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (func $FSet (type $TSet) (canon lift (core func $i32i32-void)))
  (export "[get]foo" (func $FGet))
  (export "[set]foo" (func $FSet))
)`, /parameter must match its getter/);

// Method setters require exactly one param besides self.
wasmFailValidateText(`(component
  ${preamble}
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.foo" (func (type $TMethodI)))
)`, /must have only one parameter besides self/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $I)) (param "v" s32) (param "w" s32)))
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.foo" (func (type $TT)))
)`, /must have only one parameter besides self/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
  (export "[method][set]EXPORTED.foo" (func $MethodE))
)`, /must have only one parameter besides self/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (param "v" s32) (param "w" s32)))
  (func $FF (type $TT) (canon lift (core func $i32i32i32-void)))
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
  (export "[method][set]EXPORTED.foo" (func $FF))
)`, /must have only one parameter besides self/);

// Method setter params must match the getter's property type.
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $I)) (param "v" u32)))
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.foo" (func (type $TT)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $I)) (param "v" (result s32))))
  (import "[method][get]imported.foo" (func (type $TMethodGetIR)))
  (import "[method][set]imported.foo" (func (type $TT)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (param "v" u32)))
  (func $FF (type $TT) (canon lift (core func $i32i32-void)))
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
  (export "[method][set]EXPORTED.foo" (func $FF))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (param "v" (result s32 (error f32)))))
  (func $FF (type $TT) (canon lift (core func $i32i32i32-void)))
  (export "[method][get]EXPORTED.foo" (func $MethodGetER))
  (export "[method][set]EXPORTED.foo" (func $FF))
)`, /parameter must match its getter/);

// Static setters require exactly one param.
wasmFailValidateText(`(component
  ${preamble}
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.foo" (func (type $Tvoid)))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (param "w" s32)))
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.foo" (func (type $TT)))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[static][get]EXPORTED.foo" (func $rS32))
  (export "[static][set]EXPORTED.foo" (func $void))
)`, /must have only one parameter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (param "w" s32)))
  (func $FF (type $TT) (canon lift (core func $i32i32-void)))
  (export "[static][get]EXPORTED.foo" (func $rS32))
  (export "[static][set]EXPORTED.foo" (func $FF))
)`, /must have only one parameter/);

// Static setter params must match the getter's property type.
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" u32)))
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.foo" (func (type $TT)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TGet (func (result (result s32))))
  (type $TSet (func (param "v" (result s32))))
  (import "[static][get]imported.foo" (func (type $TGet)))
  (import "[static][set]imported.foo" (func (type $TSet)))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" u32)))
  (func $FF (type $TT) (canon lift (core func $i32-void)))
  (export "[static][get]EXPORTED.foo" (func $rS32))
  (export "[static][set]EXPORTED.foo" (func $FF))
)`, /parameter must match its getter/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TGet (func (result (result s32))))
  (type $TSet (func (param "v" (result s32))))
  (func $FGet (type $TGet) (canon lift (core func $void-i32) (memory $mem) (realloc $realloc)))
  (func $FSet (type $TSet) (canon lift (core func $i32i32-void)))
  (export "[static][get]EXPORTED.foo" (func $FGet))
  (export "[static][set]EXPORTED.foo" (func $FSet))
)`, /parameter must match its getter/);

// Setters must return nothing or a result with no value.
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result s32)))
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $TT)))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result (result s32))))
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]foo" (func (type $TT)))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result s32)))
  (func $FF (type $TT) (canon lift (core func $i32-i32)))
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $FF))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result (result s32))))
  (func $FF (type $TT) (canon lift (core func $i32-i32) (memory $mem) (realloc $realloc)))
  (export "[get]foo" (func $rS32))
  (export "[set]foo" (func $FF))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $I)) (param "v" s32) (result s32)))
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.foo" (func (type $TT)))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "self" (borrow $E)) (param "v" s32) (result (result s32 (error s32)))))
  (func $FF (type $TT) (canon lift (core func $i32i32-i32) (memory $mem) (realloc $realloc)))
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
  (export "[method][set]EXPORTED.foo" (func $FF))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result (result s32))))
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.foo" (func (type $TT)))
)`, /must return nothing/);
wasmFailValidateText(`(component
  ${preamble}
  (type $TT (func (param "v" s32) (result s32)))
  (func $FF (type $TT) (canon lift (core func $i32-i32)))
  (export "[static][get]EXPORTED.foo" (func $rS32))
  (export "[static][set]EXPORTED.foo" (func $FF))
)`, /must return nothing/);

// Setters must come after getters.
wasmFailValidateText(`(component
  ${preamble}
  (import "[set]foo" (func (type $TpS32)))
  (import "[get]foo" (func (type $TrS32)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[set]foo" (func $pS32))
  (export "[get]foo" (func $rS32))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method][set]imported.foo" (func (type $TMethodSetI)))
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method][set]EXPORTED.foo" (func $MethodSetE))
  (export "[method][get]EXPORTED.foo" (func $MethodGetE))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[static][set]imported.foo" (func (type $TpS32)))
  (import "[static][get]imported.foo" (func (type $TrS32)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[static][set]EXPORTED.foo" (func $pS32))
  (export "[static][get]EXPORTED.foo" (func $rS32))
)`, /must be preceded by getter/);

// Getters and setters must be in the same scope.
wasmFailValidateText(`(component
  ${preamble}
  (import "[get]foo" (func (type $TrS32)))
  (export "[set]foo" (func $pS32))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (export "imported" (type $I))
  (export "[method][set]imported.foo" (func $MethodSetI))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (export "imported" (type $I))
  (export "[static][set]imported.foo" (func $pS32))
)`, /must be preceded by getter/);

// Getter and setter names must be strictly equal, not just equal under strong
// uniqueness.
wasmFailValidateText(`(component
  ${preamble}
  (import "[get]foo" (func (type $TrS32)))
  (import "[set]FOO" (func (type $TpS32)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[get]foo-bar" (func $rS32))
  (export "[set]foobar" (func $pS32))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[method][get]imported.foo" (func (type $TMethodGetI)))
  (import "[method][set]imported.FOO" (func (type $TMethodSetI)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[method][get]EXPORTED.foo-bar" (func $MethodGetE))
  (export "[method][set]EXPORTED.foobar" (func $MethodSetE))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (import "[static][get]imported.foo" (func (type $TrS32)))
  (import "[static][set]imported.FOO" (func (type $TpS32)))
)`, /must be preceded by getter/);
wasmFailValidateText(`(component
  ${preamble}
  (export "[static][get]EXPORTED.foo-bar" (func $rS32))
  (export "[static][set]EXPORTED.foobar" (func $pS32))
)`, /must be preceded by getter/);
