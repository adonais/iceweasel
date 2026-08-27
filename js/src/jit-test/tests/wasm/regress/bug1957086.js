var data = new Uint8Array([
    0,97,115,109,1,0,0,0,0,0,10,255,255,255,255,
    15,1,140,28,0,0,1,0,134,28,196,189,249,202,15,0
]);
assertErrorMessage(() => new WebAssembly.Module(data.buffer), WebAssembly.CompileError, /failed to start custom section/);
