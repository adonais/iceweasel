// |jit-test| skip-if: !wasmComponentsEnabled()

const bytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,  // magic
  0x0d, 0x00, 0x01, 0x00,  // version=0x0d, layer=0x01 (component)
  0x0a, 0x05,              // section id=10 (import), section_len=5
  0x01,                    // numImports=1
  0x00,                    // importFlags=Plain1
  0x9f, 0x8d, 0x06,        // LEB128 name_len=99999
]);
assertErrorMessage(
  () => new WebAssembly.Component(bytes),
  WebAssembly.CompileError, /over-long name/,
);
