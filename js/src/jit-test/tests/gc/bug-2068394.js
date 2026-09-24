gczeal(0);
var a = [];
for (var i = 0; i < 2000000; i++) {
  a.push({});
}
grayRoot().a = Symbol();
gc();
verifyprebarriers();
schedulezone("abc");
startgc();
String(grayRoot().a);
