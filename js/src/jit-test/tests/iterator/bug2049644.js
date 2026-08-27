var ArrayProto = Array.prototype;
var obj = [10, 20, 30];

var px = new Proxy({}, {
  ownKeys() {
    // snapshot() has already collected "0","1","2" from obj's dense elements.
    obj.length = 0;
    Object.setPrototypeOf(obj, ArrayProto);
    return [];
  },
  getPrototypeOf() { return null; },
  getOwnPropertyDescriptor() { return undefined; }
});
Object.setPrototypeOf(obj, px);

for (var k in obj) {
  obj[0] = 99; obj[1] = 99; obj[2] = 99;
  Array.prototype.reverse.call(obj);
}
