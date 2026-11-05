// |jit-test| --enable-arraybuffer-immutable; skip-if: !ArrayBuffer.prototype.transferToImmutable

const handler = {get() { return 71; }};
function read(receiver) { return receiver[0]; }
const warmup = new Proxy({}, handler);
for (let iteration = 0; iteration < 20; iteration++) read(warmup);
const receiver = new Proxy(new Uint8Array(new ArrayBuffer(1).transferToImmutable()), handler);
let threw = false;
try { read(receiver); } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    threw = true;
}
if (!threw) throw new Error('missing TypeError for immutable element');
