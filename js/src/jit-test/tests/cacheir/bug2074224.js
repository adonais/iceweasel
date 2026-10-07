// Execute in a fresh global because the jit-test prelude attaches ICs in ArrayIteratorNext.
let g = newGlobal({newCompartment: true});
g.eval(`
function first(value) {
  return Array.prototype.values.call(value).next();
}
const proxy = new Proxy({length: 0}, {});
for (let i = 0; i < 100; i++) first(proxy);
const array = newGlobal({newCompartment: true}).eval("new Uint8Array([42])");
Object.defineProperty(array, "length", {value: 0});
const result = first(array);
if (result.done || result.value !== 42) {
  throw new Error("Expected {value:42,done:false}, got " + JSON.stringify(result));
}
`);
