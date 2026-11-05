// Adding toJSON to a prototype must invalidate cached missing-toJSON lookups.

function testImpl(objStr, protoStr, expected, mutation) {
  let g = newGlobal({sameCompartmentAs: this});
  g.eval(`
    let obj = ${objStr};
    let proto = ${protoStr};
    for (var i = 0; i < 100; i++) {
      assertEq(JSONStringify(obj, "FastOnly"), '${expected}');
    }
    ${mutation}
    assertEq(JSON.stringify(obj), '"called"');
`)
}

function test(objStr, protoStr, expected) {
  let defineDataProp = "proto.toJSON = () => 'called';";
  let defineGetter = "Object.defineProperty(proto, 'toJSON', { get() { return () => 'called'; }});";
  testImpl(objStr, protoStr, expected, defineDataProp);
  testImpl(objStr, protoStr, expected, defineGetter);
}


test("{a: 1}", "Object.prototype", '{"a":1}');

test("[1, 2]", "Array.prototype", '[1,2]');

let objStr = "Object.create({}, {a: {value: 1, enumerable: true}})";
let protoStr = "obj.__proto__";
test(objStr, protoStr, '{"a":1}');
