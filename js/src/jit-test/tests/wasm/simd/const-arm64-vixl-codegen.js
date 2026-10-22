// |jit-test| skip-if: !wasmSimdEnabled() || !hasDisassembler() || wasmCompileMode() != "baseline" || !getBuildConfiguration("arm64")

// Test that the vixl logic for v128 constant loads is at least somewhat
// reasonable.

var lead = `0x[0-9a-f]+ +[0-9a-f]{8} +`;

var prefix = `${lead}sub     sp, sp, #0x.. \\(..\\)
${lead}str     x23, \\[sp, #..\\]`;

var literal = `${lead}ldr     q0, pc\\+[0-9]+ \\(addr 0x[0-9a-f]+\\)`;

var suffix =
`${lead}b       #\\+0x[0-9a-f]+ \\(addr 0x.*\\)
${lead}brk     #0xf000`;

for ( let [bits, expected, values] of [
    // If high == low and the byte is 0 or ff then a single movi is sufficient.
    ['i8x16 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00', `
${prefix}
${lead}movi    v0\\.2d, #0x0
${suffix}
`,
     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],

    ['i8x16 -1 0 -1 0 -1 0 -1 0 -1 0 -1 0 -1 0 -1 0', `
${prefix}
${lead}movi    v0\\.2d, #0xff00ff00ff00ff
${suffix}
`,
     [-1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0]],

    // Splattable small things (up to a byte, at a byte location)
    // can also use just one instruction
    ['i32x4 1 1 1 1', `
${prefix}
${lead}movi    v0\\.4s, #0x1, lsl #0
${suffix}
`,
     [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],

    ['i32x4 0x300 0x300 0x300 0x300', `
${prefix}
${lead}movi    v0\\.4s, #0x3, lsl #8
${suffix}
`,
     [0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0]],

    // Anything else is loaded from the constant pool.
    ['i32x4 1 2 1 2', `
${prefix}
${literal}
${suffix}
`,
     [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]],

    ['i32x4 1 2 2 1', `
${prefix}
${literal}
${suffix}
`,
     [1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0]],

    ['i32x4 1 1 2 2', `
${prefix}
${literal}
${suffix}
`,
     [1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]],
] ) {
    let ins = wasmEvalText(`
  (module
    (memory (export "mem") 1)
    (func (export "run")
       (v128.store (i32.const 0) (call $f)))
    (func $f (export "f") (result v128)
      (v128.const ${bits})))`);
    let output = wasmDis(ins.exports.f, {tier:"baseline", asString:true});
    let pass = output.match(new RegExp(expected)) != null;
    if (!pass) {
        // Debugging output in case of failure.
        console.log("expected:\n", expected,
                    "\n\noutput:\n", output);
    }
    assertEq(pass, true);
    let mem = new Int8Array(ins.exports.mem.buffer);
    set(mem, 0, iota(16).map(x => -1-x));
    ins.exports.run();
    assertSame(get(mem, 0, 16), values);
}

function get(arr, loc, len) {
    let res = [];
    for ( let i=0; i < len; i++ ) {
        res.push(arr[loc+i]);
    }
    return res;
}

function set(arr, loc, vals) {
    for ( let i=0; i < vals.length; i++ ) {
        arr[loc+i] = vals[i];
    }
}
