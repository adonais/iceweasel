function f(obj, c) {
  b: {
    for (var k in obj) {
      if (c) {
        break b;
      }
      break b;
    }
    return "empty";
  }
  return obj[k];
}

var objs = [ {a:1,b:2}, {a:1,b:2,c:3}, {x:9,a:4}, {a:5,q:1,r:2}, {a:6,b:7,c:8,d:9} ];
for (var i = 0; i < 200000; i++) {
  f(objs[i % objs.length], i & 1);
}
print("done");
