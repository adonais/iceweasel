// Scaffolding for testing x86 Ion code generation patterns .  See
// codegen-x64-test.js in this directory for more information.

load(libdir + "codegen-test-common.js");

// Note that Zydis disassembles x86 absolute addresses as relative, so
// the binary encoding and the text encoding may not correspond precisely.

// Absolute address (disp32) following the instruction mnemonic.
var ABS = `0x${HEXES}`;

// `.bp` because zydis chooses 'rbp' even on 32-bit systems
var x86_loadarg0 = `
movdqux 0x${HEXES}\\(%.bp\\), %xmm0
`;

const x86_arch = {
    name: "x86",

    // End of prologue. The move from esi to rbp is writing the callee's wasm
    // instance into the frame for debug checks -- see WasmFrame.h. The mov to eax
    // is debug code, inserted by the register allocator to clobber eax before a
    // move group. But it is only present if there is a move group there.
    //
    // -0x21524111 is 0xDEADBEEF.
    prefix: `
mov %esp, %ebp(
movl %esi, 0x08\\(%rbp\\))?(
mov \\$-0x21524111, %eax)?
`,

    // Start of epilogue.  `.bp` for the same reason as above.
    suffix: `pop %.bp`,

    // Instruction encoding
    encoding: `(?:${HEX}{2} )*`,
};

// v128 OP literal -> v128
// inputs: [[complete-opname, rhs-literal, expected-pattern], ...]
function codegenTestX86_v128xLITERAL_v128(inputs, options = {}) {
    for ( let [op, literal, expected] of inputs ) {
        codegenTestX86_adhoc(wrap(options, `
    (func (export "f") (param v128) (result v128)
      (${op} (local.get 0) ${literal}))`),
                             'f',
                             x86_loadarg0 + expected,
                             options)
    }
}

// For when nothing else applies: `module_text` is the complete source text of
// the module, `export_name` is the name of the function to be tested,
// `expected` is the non-preprocessed pattern, and options is an options bag,
// described in codegen-x64-test.js.
function codegenTestX86_adhoc(module_text, export_name, expected, options = {}) {
    codegenTestShared_adhoc(x86_arch, module_text, export_name, expected, options);
}
