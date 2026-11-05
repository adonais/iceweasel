var r = /(\w+)\s+\1/.exec("hello ello");
if (r === null || r.index !== 1 || r[0] !== "ello ello" || r[1] !== "ello") {
  throw new Error("wrong result: " + JSON.stringify(r));
}
var r2 = /(\d+)x\1/.exec("12x2");
if (r2 === null || r2.index !== 1 || r2[0] !== "2x2" || r2[1] !== "2") {
  throw new Error("wrong result: " + JSON.stringify(r2));
}
