function shift(x,y,active) {
 return active ? x << y : 0n;
}
for (let i=0;i<10000;i++) shift(0n,63n,true);
function caller(active) {
 return shift(1n,63n,active);
}
for (let i=0;i<10000;i++) caller(false);
const actual=caller(true);
if (actual!==9223372036854775808n) throw new Error("Expected 9223372036854775808n, got "+actual+"n");
