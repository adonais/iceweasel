const m = /a*b|[ef]|[ij]|[mn]/.exec("ae");
if (m === null || m.index !== 1 || m[0] !== "e") {
  throw new Error("RegExp missed the match at index 1");
}
