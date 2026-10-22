// |jit-test| --fast-warmup

const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,6,1,96,1,126,1,126,3,2,1,0,7,6,1,2,105,100,0,0,10,6,1,4,0,32,0,11]);
const identity = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.id;
function convert(value, count) {
  let result = 0n;
  for (let index = 0; index < count; index++) result = identity(value);
  return result;
}
for (let iteration = 0; iteration < 100; iteration++) {
  if (convert("17", 2) !== 17n) throw new Error("warmup");
}
if (convert("not a bigint", 0) !== 0n) throw new Error("zero iterations");
