// |jit-test| error:InternalError; skip-if: !getJitCompilerOptions()['baseline.enable'] || (getBuildConfiguration("asan") && getBuildConfiguration("pointer-byte-size") === 4)

// This test is skipped on 32-bit ASan builds because it frequently OOMs.

// Attempt to create a string longer than max string length of ~1 billion
// characters.

const name = "a".repeat(2000000);
const count = 2000;

let a = [];
for (let i = 0; i < count; i++) {
  let o = {};
  o[name] = 1;
  a.push(o);
}

JSON.stringify(a);
