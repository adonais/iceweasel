oomTest(function () {
  new WebAssembly.Instance(
    new WebAssembly.Module(
      wasmTextToBinary(`
        (type (struct))
        (func struct.new_default 0 ref.cast (ref 0))
      `),
    ),
  );
});
