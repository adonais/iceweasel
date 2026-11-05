var re = /[^]*?a^|b/;
re.exec("cb");
var m = re.exec("ab");
if (m === null || m.index !== 1 || m[0] !== "b") {
  throw new Error("expected match 'b' at index 1, got " + m);
}
