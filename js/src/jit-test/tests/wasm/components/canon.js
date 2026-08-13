// |jit-test| skip-if: !wasmComponentsEnabled()

// Helper: defines the given component types, provides a core module with a core
// function of the given core signature, aliases and lifts it as the component
// function type at `funcTypeIndex`. Memory and realloc are always provided.
function componentWithLift(typeDefs, funcTypeIndex, coreParams, coreResults) {
  const params = coreParams.length > 0 ? `(param ${coreParams.join(" ")})` : "";
  const results = coreResults.length > 0 ? `(result ${coreResults.join(" ")})` : "";

  // Build a core function body that returns values for all the results.
  let body = "";
  for (const r of coreResults) {
    body += `${r}.const 0\n`;
  }

  return `
    (component
      ${typeDefs.join("\n")}

      (core module $m
        (memory (export "mem") 0)
        (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
        (func (export "f") ${params} ${results}
          ${body}
        )
      )
      (core instance (instantiate $m))
      (alias core export 0 "mem" (core memory $mem))
      (alias core export 0 "realloc" (core func $realloc))
      (alias core export 0 "f" (core func $f))
      (func (type ${funcTypeIndex}) (canon lift (core func $f) (memory $mem) (realloc $realloc)))
    )
  `;
}

// Helper: imports a component func, lowers it, and instantiates a core module
// that imports a func declared as `expectParams -> expectResults`. Memory and
// realloc are always provided.
function componentWithLower(typeDefs, funcTypeIndex, expectParams, expectResults) {
  const ep = expectParams.length ? `(param ${expectParams.join(" ")})` : "";
  const er = expectResults.length ? `(result ${expectResults.join(" ")})` : "";
  return `
    (component
      ${typeDefs.join("\n")}

      (core module $m
        (memory (export "mem") 0)
        (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
      )
      (core instance (instantiate $m))
      (alias core export 0 "mem" (core memory $mem))
      (alias core export 0 "realloc" (core func $realloc))

      (import "f" (func $f (type ${funcTypeIndex})))
      (core func $lowered (canon lower (func $f) (memory $mem) (realloc $realloc)))
      (core instance $env (export "lowered" (func $lowered)))
      (core module $test (import "env" "lowered" (func ${ep} ${er})))
      (core instance (instantiate $test (with "env" (instance $env))))
    )
  `;
}

// ----------------------------------------------------------------------------
// Canon lift: primitive types

// bool -> i32
wasmValidateText(componentWithLift(
  [`(type (func (param "a" bool) (result bool)))`], 0,
  ["i32"], ["i32"],
));

// s8, s16, s32 -> i32
for (const t of ["s8", "s16", "s32"]) {
  wasmValidateText(componentWithLift(
    [`(type (func (param "a" ${t}) (result ${t})))`], 0,
    ["i32"], ["i32"],
  ));
}

// u8, u16, u32 -> i32
for (const t of ["u8", "u16", "u32"]) {
  wasmValidateText(componentWithLift(
    [`(type (func (param "a" ${t}) (result ${t})))`], 0,
    ["i32"], ["i32"],
  ));
}

// s64, u64 -> i64
for (const t of ["s64", "u64"]) {
  wasmValidateText(componentWithLift(
    [`(type (func (param "a" ${t}) (result ${t})))`], 0,
    ["i64"], ["i64"],
  ));
}

// f32 -> f32
wasmValidateText(componentWithLift(
  [`(type (func (param "a" f32) (result f32)))`], 0,
  ["f32"], ["f32"],
));

// f64 -> f64
wasmValidateText(componentWithLift(
  [`(type (func (param "a" f64) (result f64)))`], 0,
  ["f64"], ["f64"],
));

// char -> i32
wasmValidateText(componentWithLift(
  [`(type (func (param "a" char) (result char)))`], 0,
  ["i32"], ["i32"],
));

// string -> (i32, i32) for pointer + length
wasmValidateText(componentWithLift(
  [`(type (func (param "a" string)))`], 0,
  ["i32", "i32"], [],
));

// ----------------------------------------------------------------------------
// Canon lift: compound types

// Record: fields flatten to their individual core types.
wasmValidateText(componentWithLift(
  [`(type (record (field "x" f64) (field "y" f64) (field "z" f64)))`,
   `(type (func (param "pos" 0)))`], 1,
  ["f64", "f64", "f64"], []));

// Nested record: inner record fields also flatten.
wasmValidateText(componentWithLift(
  [`(type (record (field "x" f64) (field "y" f64)))`,
   `(type (record (field "start" 0) (field "end" 0)))`,
   `(type (func (param "seg" 1) (result u32)))`], 2,
  ["f64", "f64", "f64", "f64"], ["i32"]));

// Tuple: elements flatten like record fields.
wasmValidateText(componentWithLift(
  [`(type (tuple u32 f64 u32))`, `(type (func (param "t" 0)))`], 1,
  ["i32", "f64", "i32"], []));

// List: flattens to (i32, i32) for pointer + length.
wasmValidateText(componentWithLift(
  [`(type (list u32))`, `(type (func (param "items" 0)))`], 1,
  ["i32", "i32"], []));

// Flags: flattens to i32.
wasmValidateText(componentWithLift(
  [`(type (flags "read" "write" "execute"))`,
   `(type (func (param "perms" 0) (result 0)))`], 1,
  ["i32"], ["i32"]));

// Enum: flattens to i32 (discriminant). (Note that this is a funny case in the
// spec: it is semantically equivalent to a variant with a set of empty cases,
// and flattens as such, which means we have to be picky about the discriminant
// type, except we don't because all possible discriminant types (u8, u16, u32)
// flatten to i32 anyway.)
wasmValidateText(componentWithLift(
  [`(type (enum "red" "green" "blue"))`,
   `(type (func (param "color" 0) (result 0)))`], 1,
  ["i32"], ["i32"]));

// Variant: flattens to the discriminant (always i32) followed by the pairwise
// positional join of every case's flattened payload:
//
// join(t, t)                       = t
// join(i32, f32) = join(f32, i32)  = i32
// anything else heterogeneous      = i64

function liftVariant(typeDefs, flattened) {
  const variantIndex = typeDefs.length - 1;
  return componentWithLift(
    [...typeDefs, `(type (func (param "v" ${variantIndex})))`],
    typeDefs.length,
    flattened, []);
}

// Single case with no payload: just the discriminant.
wasmValidateText(liftVariant(
  [`(type (variant (case "only")))`],
  ["i32"],
));

// Single case with payload: discriminant + flat(payload).
wasmValidateText(liftVariant(
  [`(type (variant (case "only" u64)))`],
  ["i32", "i64"],
));

// Multiple cases, all without payload: discriminant only.
wasmValidateText(liftVariant(
  [`(type (variant (case "a") (case "b") (case "c")))`],
  ["i32"],
));

// Mix of empty and non-empty cases: payload width = longest case.
wasmValidateText(liftVariant(
  [`(type (variant (case "none") (case "some" u32)))`],
  ["i32", "i32"],
));

// join(i32, i32) = i32
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u32) (case "b" u32)))`],
  ["i32", "i32"],
));

// join(i32, f32) = i32
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u32) (case "b" f32)))`],
  ["i32", "i32"],
));

// join(i32, i64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u32) (case "b" u64)))`],
  ["i32", "i64"],
));

// join(i32, f64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u32) (case "b" f64)))`],
  ["i32", "i64"],
));

// join(f32, i32) = i32
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f32) (case "b" u32)))`],
  ["i32", "i32"],
));

// join(f32, f32) = f32
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f32) (case "b" f32)))`],
  ["i32", "f32"],
));

// join(f32, i64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f32) (case "b" u64)))`],
  ["i32", "i64"],
));

// join(f32, f64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f32) (case "b" f64)))`],
  ["i32", "i64"],
));

// join(i64, i32) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u64) (case "b" u32)))`],
  ["i32", "i64"],
));

// join(i64, f32) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u64) (case "b" f32)))`],
  ["i32", "i64"],
));

// join(i64, i64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u64) (case "b" u64)))`],
  ["i32", "i64"],
));

// join(i64, f64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" u64) (case "b" f64)))`],
  ["i32", "i64"],
));

// join(f64, i32) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f64) (case "b" u32)))`],
  ["i32", "i64"],
));

// join(f64, f32) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f64) (case "b" f32)))`],
  ["i32", "i64"],
));

// join(f64, i64) = i64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f64) (case "b" u64)))`],
  ["i32", "i64"],
));

// join(f64, f64) = f64
wasmValidateText(liftVariant(
  [`(type (variant (case "a" f64) (case "b" f64)))`],
  ["i32", "f64"],
));

// Time for a little arithmetic :)

//   (s) i32 i32
// + (n) i32
// --------------
//       i32 i32
wasmValidateText(liftVariant(
  [`(type (variant (case "s" string) (case "n" u32)))`],
  ["i32", "i32", "i32"],
));

//   (t) i64 i32
// + (f) f32
// --------------
//       i64 i32
wasmValidateText(liftVariant(
  [
    `(type (tuple u64 u32))`,
    `(type (variant (case "t" 0) (case "f" f32)))`,
  ],
  ["i32", "i64", "i32"],
));

//   (inner)  i32 i32
// + (single) f64
// -------------------
//            i64 i32
wasmValidateText(liftVariant(
  [
    `(type (variant (case "x" u32) (case "y" u32)))`,
    `(type (variant (case "inner" 0) (case "single" f64)))`,
  ],
  ["i32", "i64", "i32"],
));

//   (a) f32
//   (b) f32 f32
//   (c) f32 f32 f64 f32 f64
//   (d) i32 f32 f64
// + (e) f32 f32 f64 f64
// --------------------------
//       i32 f32 f64 i64 f64
wasmValidateText(liftVariant(
  [
    `(type (tuple f32))`,
    `(type (tuple f32 f32))`,
    `(type (tuple f32 f32 f64 f32 f64))`,
    `(type (tuple u8  f32 f64))`,
    `(type (tuple f32 f32 f64 f64))`,
    `(type (variant (case "a" 0) (case "b" 1) (case "c" 2) (case "d" 3) (case "e" 4)))`,
  ],
  ["i32", "i32", "f32", "f64", "i64", "f64"],
));

// Option: flattens to discriminant (i32) + payload.
wasmValidateText(`
(component
  (type (option f32))
  (type (func (param "v" 0)))

  (core module
    (func (export "f") (param i32 f32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

// Result: flattens to discriminant + ok payload + error payload.
// This uses the same encoding as a variant.
wasmValidateText(`
(component
  (type (result))
  (type (func (param "v" 0)))

  (core module
    (func (export "f") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

wasmValidateText(`
(component
  (type (result f32))
  (type (func (param "v" 0)))

  (core module
    (func (export "f") (param i32 f32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

wasmValidateText(`
(component
  (type (result (error f32)))
  (type (func (param "v" 0)))

  (core module
    (func (export "f") (param i32 f32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

wasmValidateText(`
(component
  (type (result f32 (error f64)))
  (type (func (param "v" 0)))

  (core module
    (func (export "f") (param i32 i64))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

// ----------------------------------------------------------------------------
// Canon lift: signature mismatch

// Too few core params.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" s32) (param "b" s32) (result s32)))`], 0,
  ["i32"], ["i32"]
), /could not lift core func/);

// Too many core params.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" s32) (result s32)))`], 0,
  ["i32", "i32", "i32"], ["i32"]
), /could not lift core func/);

// Wrong core param type: component expects s64 (i64), core has i32.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" s64) (result s64)))`], 0,
  ["i32"], ["i32"]
), /could not lift core func/);

// Missing core result.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" s32) (result s32)))`], 0,
  ["i32"], []
), /could not lift core func/);

// Extra core result.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" s32)))`], 0,
  ["i32"], ["i32"]
), /could not lift core func/);

// String param count mismatch: string needs (i32, i32), core only has one i32.
wasmFailValidateText(componentWithLift(
  [`(type (func (param "a" string) (result bool)))`], 0,
  ["i32"], ["i32"]
), /could not lift core func/);

// ----------------------------------------------------------------------------
// Canon lift: type validation

// Lift with non-func type (record).
wasmFailValidateText(`
(component
  (type (record (field "x" u32)))

  (core module (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0)))
)
`, /canon lift requires a func type/);

// Invalid core func index.
wasmFailValidateText(`
(component
  (type (func (param "a" s32) (result s32)))

  (core module (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 99)))
)
`, /invalid core function index/);

// ----------------------------------------------------------------------------
// Canon lift: complex signatures

// Mixed param types: string + u32 -> bool
wasmValidateText(componentWithLift(
  [`(type (func (param "a" string) (param "b" u32) (result bool)))`], 0,
  ["i32", "i32", "i32"], ["i32"]
));

// Record param via type reference.
wasmValidateText(`
(component
  (type (record (field "x" u32) (field "y" f64)))
  (type (func (param "pt" 0) (result bool)))

  (core module
    (func (export "f") (param i32 f64) (result i32)
      (i32.const 0)
    )
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

// No params, no results.
wasmValidateText(componentWithLift(
  [`(type (func))`], 0,
  [], []
));

// ----------------------------------------------------------------------------
// Canon lower

// Primitives: bool/s8/s16/s32/u8/u16/u32/char -> i32, s64/u64 -> i64,
// f32 -> f32, f64 -> f64.
for (const t of ["bool", "s8", "s16", "s32", "u8", "u16", "u32", "char"]) {
  wasmValidateText(componentWithLower(
    [`(type (func (param "a" ${t}) (result ${t})))`], 0, ["i32"], ["i32"]));
}
for (const t of ["s64", "u64"]) {
  wasmValidateText(componentWithLower(
    [`(type (func (param "a" ${t}) (result ${t})))`], 0, ["i64"], ["i64"]));
}
wasmValidateText(componentWithLower(
  [`(type (func (param "a" f32) (result f32)))`], 0, ["f32"], ["f32"]));
wasmValidateText(componentWithLower(
  [`(type (func (param "a" f64) (result f64)))`], 0, ["f64"], ["f64"]));

// string: params (i32 i32); the (i32 i32) result spills to a trailing out-param
// i32, leaving no results.
wasmValidateText(componentWithLower(
  [`(type (func (param "a" string) (result string)))`], 0,
  ["i32", "i32", "i32"], []));

// Record fields flatten positionally.
wasmValidateText(componentWithLower(
  [`(type (record (field "x" u32) (field "y" f64)))`,
   `(type (func (param "pt" 0) (result bool)))`], 1,
  ["i32", "f64"], ["i32"]));

// Nested record: inner record fields flatten through.
wasmValidateText(componentWithLower(
  [`(type (record (field "x" f64) (field "y" f64)))`,
   `(type (record (field "start" 0) (field "end" 0)))`,
   `(type (func (param "seg" 1)))`], 2,
  ["f64", "f64", "f64", "f64"], []));

// Tuple: elements flatten positionally.
wasmValidateText(componentWithLower(
  [`(type (tuple u32 f64 u32))`, `(type (func (param "t" 0)))`], 1,
  ["i32", "f64", "i32"], []));

// List: flattens to (i32, i32) for pointer + length.
wasmValidateText(componentWithLower(
  [`(type (list u32))`, `(type (func (param "items" 0)))`], 1,
  ["i32", "i32"], []));

// Flags: flattens to i32.
wasmValidateText(componentWithLower(
  [`(type (flags "read" "write" "execute"))`,
   `(type (func (param "perms" 0)))`], 1,
  ["i32"], []));

// Enum: flattens to i32 (the discriminant).
wasmValidateText(componentWithLower(
  [`(type (enum "red" "green" "blue"))`, `(type (func (param "color" 0)))`], 1,
  ["i32"], []));

// Option: discriminant (i32) + payload.
wasmValidateText(componentWithLower(
  [`(type (option f32))`, `(type (func (param "v" 0)))`], 1,
  ["i32", "f32"], []));

// Result: discriminant (i32) + joined payload (join(f32, f64) = i64).
wasmValidateText(componentWithLower(
  [`(type (result f32 (error f64)))`, `(type (func (param "v" 0)))`], 1,
  ["i32", "i64"], []));

// Variant: discriminant (i32) + joined payload (join(i32, f64) = i64).
wasmValidateText(componentWithLower(
  [`(type (variant (case "a" u32) (case "b" f64)))`,
   `(type (func (param "v" 0)))`], 1,
  ["i32", "i64"], []));

// No params, no results.
wasmValidateText(componentWithLower([`(type (func))`], 0, [], []));

// Invalid function index.
wasmFailValidateText(`
(component
  (type (func (param "a" s32) (result s32)))
  (import "f" (func (type 0)))
  (core func (canon lower (func 99)))
)
`, /invalid function index/);

// A wrong declared import signature must be rejected.
wasmFailValidateText(componentWithLower(
  [`(type (func (param "a" u32) (result u32)))`], 0, ["i32", "i32"], ["i32"]),
  /incompatible function type for import/);

// ----------------------------------------------------------------------------
// Spill-to-memory when flattening
//
// When a function's flattened params exceed MAX_FLAT_PARAMS (16) or its
// flattened results exceed MAX_FLAT_RESULTS (1), values are passed via memory.

// canon lift

const u32x17 = Array(17).fill("u32").join(" ");
const u32x16 = Array(16).fill("u32").join(" ");
const i32x16 = Array(16).fill("i32").join(" ");

// 16 params -> no spill.
wasmValidateText(componentWithLift(
  [`(type (tuple ${u32x16}))`, `(type (func (param "a" 0) (result u32)))`], 1,
  i32x16.split(" "), ["i32"]));

// 17 params -> i32 pointer.
wasmValidateText(componentWithLift(
  [`(type (tuple ${u32x17}))`, `(type (func (param "a" 0) (result u32)))`], 1,
  ["i32"], ["i32"]));

// 1 result -> no spill.
wasmValidateText(componentWithLift(
  [`(type (func (result u32)))`], 0,
  [], ["i32"]));

// 2 results -> i32 pointer.
wasmValidateText(componentWithLift(
  [`(type (tuple u32 u32))`, `(type (func (result 0)))`], 1,
  [], ["i32"]));

// canon lower

// 16 params -> no spill.
wasmValidateText(componentWithLower(
  [`(type (tuple ${u32x16}))`, `(type (func (param "a" 0) (result f32)))`], 1,
  i32x16.split(" "), ["f32"]));

// 17 params -> i32 pointer.
wasmValidateText(componentWithLower(
  [`(type (tuple ${u32x17}))`, `(type (func (param "a" 0) (result f32)))`], 1,
  ["i32"], ["f32"]));

// 1 result -> no spill.
wasmValidateText(componentWithLower(
  [`(type (func (result f32)))`], 0,
  [], ["f32"]));

// 2 results -> i32 pointer as out param.
wasmValidateText(componentWithLower(
  [`(type (tuple u32 u32))`, `(type (func (result 0)))`], 1,
  ["i32"], []));

// 16 params + 2 results -> 16 params + i32 pointer out param.
wasmValidateText(componentWithLower(
  [`(type (tuple ${u32x16}))`, `(type (tuple f32 f32))`,
   `(type (func (param "a" 0) (result 1)))`], 2,
  [...i32x16.split(" "), "i32"], []));

// ----------------------------------------------------------------------------
// Canonopts

// Each string encoding, on lift.
for (const enc of ["utf8", "utf16", "latin1+utf16"]) {
  wasmValidateText(`
  (component
    (type (func (param "a" u32) (result u32)))
    (core module (func (export "f") (param i32) (result i32) (local.get 0)))
    (core instance (instantiate 0))
    (alias core export 0 "f" (core func))
    (func (type 0) (canon lift (core func 0) string-encoding=${enc}))
  )
  `);
}

// Memory, realloc, and post-return together, on lift.
wasmValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (memory (export "m") 1)
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (i32.const 0))
    (func (export "pr") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "f" (core func))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 0) (canon lift (core func 0)
    string-encoding=utf16 (memory 0) (realloc 1) (post-return 2)))
)
`);

// String-encoding, memory, and realloc, on lower.
wasmValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (import "f" (func (type 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) string-encoding=utf8 (memory 0) (realloc 0)))
)
`);

// Duplicate string encodings.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0) string-encoding=utf8 string-encoding=utf16))
)
`, /string encoding already specified/);

// Duplicate memories.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module (memory (export "m") 1)
    (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0) (memory 0) (memory 0)))
)
`, /memory already specified/);

// Duplicate realloc.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (alias core export 0 "realloc" (core func))
  (func (type 0) (canon lift (core func 0) (realloc 1) (realloc 1)))
)
`, /realloc already specified/);

// Duplicate post-return.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "pr") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 0) (canon lift (core func 0) (post-return 1) (post-return 1)))
)
`, /post-return already specified/);

// Decoder branches the text format cannot emit: corrupt a known-valid binary.
// The canon section is last; its payload is:
//   numDefs, Lift(0x00), dummy(0x00), coreFuncIdx, optCount,
//   Memory(0x03), memIdx, typeIdx
{
  const valid = wasmTextToBinary(`
  (component
    (type (func (param "a" u32) (result u32)))
    (core module (memory (export "m") 1)
      (func (export "f") (param i32) (result i32) (local.get 0)))
    (core instance (instantiate 0))
    (alias core export 0 "m" (core memory))
    (alias core export 0 "f" (core func))
    (func (type 0) (canon lift (core func 0) (memory 0)))
  )
  `);

  // Unknown canonopt kind: flip the Memory option kind (0x03) to 0x06.
  assertEq(valid[valid.length - 3], 0x03);
  const unknownKind = valid.slice();
  unknownKind[unknownKind.length - 3] = 0x06;
  wasmFailValidateBinary(unknownKind, /unexpected canonopt 0x06/);

  // Bad sub-byte: the byte following the Lift kind must be 0x00.
  assertEq(valid[valid.length - 6], 0x00);
  const badDummy = valid.slice();
  badDummy[badDummy.length - 6] = 0x01;
  wasmFailValidateBinary(badDummy, /expected canonical definition/);
}

// Memory index out of range.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0) (memory 5)))
)
`, /invalid memory index/);

// Realloc index out of range.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0) (realloc 5)))
)
`, /invalid index .* for realloc function/);

// Wrong signature for realloc.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "bad"))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (alias core export 0 "bad" (core func))
  (func (type 0) (canon lift (core func 0) (realloc 1)))
)
`, /invalid signature for realloc function/);

// Post-return index out of range.
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module (func (export "f") (param i32) (result i32) (local.get 0)))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 0) (post-return 5)))
)
`, /invalid index .* for post-return function/);

// Post-return on canon lower. (Post-return is only valid for lift).
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (import "f" (func (type 0)))
  (core module (func (export "pr") (param i32)))
  (core instance (instantiate 0))
  (alias core export 0 "pr" (core func))
  (core func (canon lower (func 0) (post-return 0)))
)
`, /post-return only valid for canon lift/);

// Post-return params must match the callee's return type.
wasmValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "pr") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 0) (canon lift (core func 0) (post-return 1)))
)
`);
wasmFailValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (core module
    (func (export "f") (param i32) (result i32) (local.get 0))
    (func (export "pr") (param i64))
  )
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 0) (canon lift (core func 0) (post-return 1)))
)
`, /invalid signature for post-return function/);

// This is also true if the results were spilled to memory, in which case we
// expect a pointer.
wasmValidateText(`
(component
  (type (tuple f32 f32))
  (type (func (result 0)))
  (core module
    (memory (export "m") 1)
    (func (export "f") (result i32) (i32.const 0))
    (func (export "pr") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "f" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 1) (canon lift (core func 0) (post-return 1) (memory 0)))
)
`);
wasmFailValidateText(`
(component
  (type (tuple f32 f32))
  (type (func (result 0)))
  (core module
    (memory (export "m") 1)
    (func (export "f") (result i32) (i32.const 0))
    (func (export "pr") (param i64))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "f" (core func))
  (alias core export 0 "pr" (core func))
  (func (type 1) (canon lift (core func 0) (post-return 1) (memory 0)))
)
`, /invalid signature for post-return function/);

// ----------------------------------------------------------------------------
// Memory/realloc requirements on lift/lower
//
// If the canonical ABI needs to load or store, memory is required. The things
// that can trigger this are strings, lists, and spilled params/results.
//
// Likewise, if the canonical ABI needs to allocate in the core module, realloc
// is required. The things that can trigger this are the same, but only in some
// cases. For example, spilled params on lower will be allocated by the module
// before the call, so the canonical ABI need not allocate.

// Memory required

function requiresMemoryOnly(component) {
  const withoutMemory = component.replace(/(\(canon .*)\(memory.*?\)/, "$1");
  const withoutRealloc = component.replace(/(\(canon .*)\(realloc.*?\)/, "$1");
  const withoutBoth = withoutRealloc.replace(/(\(canon .*)\(memory.*?\)/, "$1");

  wasmValidateText(component);
  wasmValidateText(withoutRealloc);
  wasmFailValidateText(withoutMemory, /memory required for canon (lift|lower)/);
  wasmFailValidateText(withoutBoth, /memory required for canon (lift|lower)/);
}
function requiresRealloc(component) {
  const withoutMemory = component.replace(/(\(canon .*)\(memory.*?\)/, "$1");
  const withoutRealloc = component.replace(/(\(canon .*)\(realloc.*?\)/, "$1");
  const withoutBoth = withoutRealloc.replace(/(\(canon .*)\(memory.*?\)/, "$1");

  wasmValidateText(component);
  wasmFailValidateText(withoutRealloc, /realloc required for canon (lift|lower)/);
  wasmFailValidateText(withoutMemory, /memory required for canon (lift|lower)/);
  wasmFailValidateText(withoutBoth, /memory required for canon (lift|lower)/);
}

// On lift: string results (if only because spilling)
// On lower: string params
requiresMemoryOnly(`
(component
  (type (func (result string)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);
requiresMemoryOnly(`
(component
  (type (func (param "a" string)))
  (import "f" (func (type 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// Same for list params.
requiresMemoryOnly(`
(component
  (type (list u32))
  (type (func (result 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);
requiresMemoryOnly(`
(component
  (type (list u32))
  (type (func (param "a" 0)))
  (import "f" (func (type 1)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// Same for strings inside records.
requiresMemoryOnly(`
(component
  (type (record (field "s" string)))
  (type (func (result 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);
requiresMemoryOnly(`
(component
  (type (record (field "s" string)))
  (type (func (param "r" 0)))
  (import "f" (func (type 1)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// String results are stored to memory through an out param when lowering.
wasmFailValidateText(`
(component
  (type (func (result string)))
  (import "f" (func (type 0)))
  (core func (canon lower (func 0)))
)
`, /memory required for canon lower/);

// Spilled params require only memory on lower.
requiresMemoryOnly(`
(component
  (type (tuple ${u32x17}))
  (type (func (param "a" 0)))
  (import "f" (func (type 1)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// Memory not required for primitive -> primitive.
wasmValidateText(`
(component
  (type (func (param "a" u32) (result u32)))
  (import "f" (func (type 0)))
  (core func (canon lower (func 0)))
)
`);

// Memory not required for (16 primitives) -> primitive.
wasmValidateText(`
(component
  (type (tuple ${u32x16}))
  (type (func (param "r" 0) (result u32)))
  (core module (func (export "f") (param ${i32x16}) (result i32) i32.const 0))
  (core instance (instantiate 0))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0)))
)
`);

// Realloc required

// String params must be allocated on lifted funcs.
requiresRealloc(`
(component
  (type (func (param "a" string)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (param i32 i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 0) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);

// Same for lists.
requiresRealloc(`
(component
  (type (list u32))
  (type (func (param "a" 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (param i32 i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);

// String results must be allocated on lowered funcs.
requiresRealloc(`
(component
  (type (func (result string)))
  (import "f" (func (type 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// String params are read, not alloced, on lowered funcs.
requiresMemoryOnly(`
(component
  (type (func (param "a" string)))
  (import "f" (func (type 0)))
  (core module (memory (export "m") 1))
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (core func (canon lower (func 0) (memory 0)))
)
`);

// Spilled params are alloced on lifted funcs.
requiresRealloc(`
(component
  (type (tuple ${u32x17}))
  (type (func (param "a" 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (param i32))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);

// Spilled params are read, not alloced, on lowered funcs.
requiresMemoryOnly(`
(component
  (type (tuple ${u32x17}))
  (type (func (param "a" 0)))
  (import "f" (func (type 1)))
  (core module (memory (export "m") 1))
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (core func (canon lower (func 0) (memory 0)))
)
`);

// Spilled results are read, not alloced, on lifted funcs.
requiresMemoryOnly(`
(component
  (type (tuple u32 u32))
  (type (func (result 0)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
    (func (export "f") (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 1) (memory 0) (realloc 0)))
)
`);

// Spilled results are written through an out param on lowered funcs.
requiresMemoryOnly(`
(component
  (type (tuple u32 u32))
  (type (func (result 0)))
  (import "f" (func (type 1)))
  (core module
    (memory (export "m") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) i32.const 0)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "realloc" (core func))
  (core func (canon lower (func 0) (memory 0) (realloc 0)))
)
`);

// ----------------------------------------------------------------------------
// memory32 requirement
//
// For now, we do not support memory64 in our implementation of the canonical
// ABI. This means that we must reject memory64 in canonopts for now. These
// tests should be deleted and reworked when we add memory64 support.

// Require memory but not realloc via spilled results on lift, and spilled
// params on lower.
wasmFailValidateText(`
(component
  (type (tuple s32 s32))
  (type (func (result 0)))
  (core module
    (memory (export "m") i64 1)
    (func (export "f") (result i32) (i32.const 0))
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (alias core export 0 "f" (core func))
  (func (type 1) (canon lift (core func 0) (memory 0)))
)
`, /memory for canonical ABI must be 32-bit/);
wasmFailValidateText(`
(component
  (type (tuple s32 s32))
  (type (func (param "a" 0)))
  (import "f" (func (type 1)))
  (core module
    (memory (export "m") i64 1)
  )
  (core instance (instantiate 0))
  (alias core export 0 "m" (core memory))
  (core func (canon lower (func 0) (memory 0)))
)
`, /memory for canonical ABI must be 32-bit/);

// ----------------------------------------------------------------------------
// Flattening depth limit

function depthinate(depth, body) {
  let nestedTypes = "";
  for (let i = 1; i <= depth; i++) {
    nestedTypes += `(type (;${i};) ${i === depth ? "$t" : ""} (option ${i-1}))\n`;
  }
  return `(component
    (type (;0;) s32)
    ${nestedTypes}
    ${body}
  )`;
}

// Lifting params
wasmFailValidateText(
  depthinate(64, `
    (type $ft (func (param "x" $t)))
    (core module $m
      (func (export "f"))
    )
    (core instance $i (instantiate $m))
    (alias core export $i "f" (core func $f))
    (func (type $ft) (canon lift (core func $f)))
  `),
  /exceeded maximum depth/,
);
// Lifting results
wasmFailValidateText(
  depthinate(64, `
    (type $ft (func (result $t)))
    (core module $m
      (func (export "f"))
    )
    (core instance $i (instantiate $m))
    (alias core export $i "f" (core func $f))
    (func (type $ft) (canon lift (core func $f)))
  `),
  /exceeded maximum depth/,
);
// Lowering params
wasmFailValidateText(
  depthinate(64, `
    (type $ft (func (param "x" $t)))
    (import "f" (func $f (type $ft)))
    (core func (canon lower (func $f)))
  `),
  /exceeded maximum depth/,
);
// Lowering results
wasmFailValidateText(
  depthinate(64, `
    (type $ft (func (result $t)))
    (import "f" (func $f (type $ft)))
    (core func (canon lower (func $f)))
  `),
  /exceeded maximum depth/,
);

// ----------------------------------------------------------------------------
// resource.new, resource.drop, resource.rep

function resourceBuiltinImportedAs(op, importSig) {
  return `
    (component
      (type $r (resource (rep i32)))
      (core func $b (canon ${op} $r))
      (core instance $env (export "b" (func $b)))
      (core module $test (import "env" "b" (func ${importSig})))
      (core instance (instantiate $test (with "env" (instance $env))))
    )
  `;
}

// Correct signatures validate.
wasmValidateText(resourceBuiltinImportedAs("resource.new", "(param i32) (result i32)"));
wasmValidateText(resourceBuiltinImportedAs("resource.drop", "(param i32)"));
wasmValidateText(resourceBuiltinImportedAs("resource.rep", "(param i32) (result i32)"));

// resource.new must be (i32) -> (i32).
wasmFailValidateText(resourceBuiltinImportedAs("resource.new", "(param i32)"),
  /incompatible function type for import/);
wasmFailValidateText(resourceBuiltinImportedAs("resource.new", "(param i64) (result i32)"),
  /incompatible function type for import/);
wasmFailValidateText(resourceBuiltinImportedAs("resource.new", "(param i32 i32) (result i32)"),
  /incompatible function type for import/);

// resource.drop must be (i32) -> ()
wasmFailValidateText(resourceBuiltinImportedAs("resource.drop", "(param i32) (result i32)"),
  /incompatible function type for import/);
wasmFailValidateText(resourceBuiltinImportedAs("resource.drop", "(param i32 i32)"),
  /incompatible function type for import/);
wasmFailValidateText(resourceBuiltinImportedAs("resource.drop", ""),
  /incompatible function type for import/);

// resource.rep must be (i32) -> (i32).
wasmFailValidateText(resourceBuiltinImportedAs("resource.rep", "(param i32)"),
  /incompatible function type for import/);
wasmFailValidateText(resourceBuiltinImportedAs("resource.rep", "(param i32) (result i64)"),
  /incompatible function type for import/);

for (const op of ["resource.new", "resource.drop", "resource.rep"]) {
  // Referenced type is not a resource.
  wasmFailValidateText(`
    (component
      (type (func))
      (core func (canon ${op} 0))
    )
  `, /expected a resource type/);

  // Referenced type index is out of bounds.
  wasmFailValidateText(`
    (component
      (core func (canon ${op} 99))
    )
  `, /invalid type index/);
}
