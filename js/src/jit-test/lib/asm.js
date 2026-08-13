/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// asm.js has been removed from SpiderMonkey. This library provides stub
// implementations of the test helper functions so that existing tests can
// continue to run. Code with "use asm" directives now runs as normal
// JavaScript.

load(libdir + "asserts.js");

const USE_ASM = '"use asm";';
const HEAP_IMPORTS = "const i8=new glob.Int8Array(b);var u8=new glob.Uint8Array(b);"+
                     "const i16=new glob.Int16Array(b);var u16=new glob.Uint16Array(b);"+
                     "const i32=new glob.Int32Array(b);var u32=new glob.Uint32Array(b);"+
                     "const f32=new glob.Float32Array(b);var f64=new glob.Float64Array(b);";
const BUF_MIN = 64 * 1024;
const BUF_CHANGE_MIN = 16 * 1024 * 1024;
const BUF_64KB = new ArrayBuffer(BUF_MIN);

// Compile as normal JavaScript (asm.js compilation no longer available)
function asmCompile()
{
    return Function.apply(null, arguments);
}

function asmCompileCached()
{
    return Function.apply(null, arguments);
}

// asm.js directive validation is no longer performed, no-op
function assertAsmDirectiveFail(str)
{
    // No-op: asm.js has been removed
}

// asm.js type validation is no longer performed, no-op
function assertAsmTypeFail()
{
    // No-op: asm.js has been removed, code runs as normal JS
    // Still create the function to ensure the code is syntactically valid
    Function.apply(null, arguments);
}

// asm.js linking is no longer performed, just call the function
function assertAsmLinkFail(f, ...args)
{
    // No-op: asm.js has been removed, just call as normal JS
    f.apply(null, args);
}

function assertAsmLinkAlwaysFail(f, ...args)
{
    // No-op: asm.js has been removed, just call as normal JS
    try {
        f.apply(null, args);
    } catch (e) {
        // Function may still throw for other reasons
    }
}

function assertAsmLinkDeprecated(f, ...args)
{
    // No-op: asm.js has been removed
    f.apply(null, args);
}

// Just call the function as normal JavaScript
function asmLink(f, ...args)
{
    return f.apply(null, args);
}
