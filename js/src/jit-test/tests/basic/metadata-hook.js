
enableTrackAllocations();

function Foo() {
  this.x = 0;
  this.y = 1;
}

function hello() {
  function there() {
    w = new Foo();
    x = [1,2,3];
    y = [2,3,5];
    z = {a:0,b:1};
  }
  callee = there;
  callee();
}
hello();

var wl = getAllocationMetadata(w).line;
var xl = getAllocationMetadata(x).line;
var yl = getAllocationMetadata(y).line;
var zl = getAllocationMetadata(z).line;

assertEq(xl > wl, true);
assertEq(yl > xl, true);
assertEq(zl > yl, true);
assertEq(getAllocationMetadata(x).functionDisplayName, "there");
assertEq(getAllocationMetadata(x).parent.functionDisplayName, "hello");
