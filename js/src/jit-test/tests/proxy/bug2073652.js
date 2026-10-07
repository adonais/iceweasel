function readLength(p) { return p.length; }
const target = [];
const proxy = new Proxy(target, { get() { return 17; } });
for (let i = 0; i < 3000; i++) readLength(proxy);
Object.defineProperty(target, "length", { writable: false });
let caught = false;
try { readLength(proxy); } catch (e) {
  if (!(e instanceof TypeError)) throw e;
  caught = true;
}
if (!caught) throw new Error("Missing TypeError for immutable array length");
