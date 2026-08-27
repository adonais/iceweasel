// Scaffolding for testing loong64 Ion code generation patterns.  See
// codegen-x64-test.js in this directory for more information.

load(libdir + "codegen-test-common.js");

const loong64_arch = {
    name: "loong64",

    // End of prologue
    prefix: `
addi\\.d   \\$sp, \\$sp, -8
st\\.d     \\$ra, \\$sp, 0
addi\\.d   \\$sp, \\$sp, -8
st\\.d     \\$fp, \\$sp, 0
or         \\$fp, \\$sp, \\$zero
st\\.d     \\$s4, \\$fp, 16
`,

    // Start of epilogue
    suffix: `
ld\\.d     \\$ra, \\$sp, 8
ld\\.d     \\$fp, \\$sp, 0
addi\\.d   \\$sp, \\$sp, 16
`,

    // No instruction encoding is emitted.
    encoding: "",
};

// For when nothing else applies: `module_text` is the complete source text of
// the module, `export_name` is the name of the function to be tested,
// `expected` is the non-preprocessed pattern, and options is an options bag,
// described in codegen-x64-test.js.
function codegenTestLOONG64_adhoc(module_text, export_name, expected, options = {}) {
    codegenTestShared_adhoc(loong64_arch, module_text, export_name, expected, options);
}
