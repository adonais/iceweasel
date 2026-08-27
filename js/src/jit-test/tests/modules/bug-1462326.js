// |jit-test| error: Error

let m = parseModule(`
  import A from "A";
`);
moduleLoadAndLink(m);
