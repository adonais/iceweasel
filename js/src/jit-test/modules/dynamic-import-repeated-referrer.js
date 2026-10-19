export function run(n) {
  for (let i = 0; i < n; i++) {
    import("module1.js");
  }
}

export function runOther(n) {
  for (let i = 0; i < n; i++) {
    import("module2.js");
  }
}
