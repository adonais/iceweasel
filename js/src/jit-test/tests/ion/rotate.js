function makeRotate(n) {
  return new Function("i", `
    let a = i >>> ${n} | i << ${32-n};
    let b = i << ${32-n} | i >>> ${n};
    return a + b;
`);
}

function unoptimized(n, i) {
  let a = i >>> n | i << (32-n);
  let b = i << (32-n) | i >>> (n);
  return a + b;
}

// Test every valid rotate amount, and some invalid ones.
for (var n = -2; n < 40; n++) {
  let rotate = makeRotate(n);
  for (var i = 0; i < 2000; i++) {
    assertEq(rotate(i), unoptimized(n, i));
  }
}
