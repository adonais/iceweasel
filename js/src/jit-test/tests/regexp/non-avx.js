// |jit-test| --no-avx

let src = "x".repeat(2000) + "a";
let re = /[abc]/
for (var i = 0; i < 10; i++) {
  assertEq(re.test(src), true);
}
