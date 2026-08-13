// |jit-test| skip-if: helperThreadCount() === 0 || (getBuildConfiguration("asan") && getBuildConfiguration("pointer-byte-size") === 4)

// This test is skipped on 32-bit ASan builds because it frequently OOMs.

var i = 0;
while(i++ < 500) {
  evalInWorker(`
    assertFloat32(0x23456789 | 0, false);
  `);
  let m = parseModule("");
  moduleLink(m);
}

