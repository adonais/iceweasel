let {exports: {convert_any_null, convert_extern_null}} = wasmEvalText(`
  (func  (export "convert_any_null") (result i32)
    (ref.is_null (extern.convert_any (ref.null any)))
  )
  (func  (export "convert_extern_null") (result i32)
    (ref.is_null (any.convert_extern (ref.null extern)))
  )
`);

assertEq(convert_extern_null(), 1);
assertEq(convert_any_null(), 1);
