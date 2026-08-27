// Scaffolding for testing riscv64 Ion code generation patterns .  See
// codegen-x64-test.js in this directory for more information.

load(libdir + "codegen-test-common.js");

const riscv64_arch = {
    name: "riscv64",

    // End of prologue
    prefix: `
addi      sp, sp, -16
sd        ra, 8\\(sp\\)
sd        fp, 0\\(sp\\)
mv        fp, sp(
sd        s4, 16\\(fp\\))?
`,

    // Start of epilogue
    suffix: `
ld        fp, 0\\(sp\\)
ld        ra, 8\\(sp\\)
addi      sp, sp, 16
`,

    // Instruction encoding
    encoding: `${HEX}{8}`,
};

// For when nothing else applies: `module_text` is the complete source text of
// the module, `export_name` is the name of the function to be tested,
// `expected` is the non-preprocessed pattern, and options is an options bag,
// described in codegen-x64-test.js.
function codegenTestRISCV64_adhoc(module_text, export_name, expected, options = {}) {
    codegenTestShared_adhoc(riscv64_arch, module_text, export_name, expected, options);
}
