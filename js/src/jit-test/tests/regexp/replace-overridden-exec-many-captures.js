var re = /x/;
var seen = [];

re.exec = function() {
  var result = { length: 101, 0: "x", index: 0 };
  for (let i = 1; i <= 100; i++) {
    Object.defineProperty(result, i, {
      get() {
        seen.push(i);
        return "#" + i + "#";
      },
    });
  }
  return result;
};

assertEq("x".replace(re, "$99|$100"), "#99#|#10#0");
assertEq(seen.length, 100);
assertEq(seen[0], 1);
assertEq(seen[98], 99);
assertEq(seen[99], 100);
