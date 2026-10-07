const buffer = new ArrayBuffer(0x100000000);
const proto = new Uint8Array(buffer);
function store(obj) { obj["4294967295"] = 1; }
for (let i = 0; i < 200; i++) store(Object.create(proto));
buffer.transfer(0);
const obj = Object.create(proto);
store(obj);
if (Object.hasOwn(obj, "4294967295"))
  throw new Error("JIT added a property through a detached typed-array prototype");
