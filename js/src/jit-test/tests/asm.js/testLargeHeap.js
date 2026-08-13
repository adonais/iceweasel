// |jit-test| skip-if: !largeArrayBufferSupported()

load(libdir + "asm.js");

// This is a validly structured length but is at the historical asm.js heap
// limit of 7fff_ffff (in practice 7f00_0000 given the address format
// constraints).
var buf = new ArrayBuffer(0x8000_0000);
assertAsmLinkFail(asmCompile('glob', 'imp', 'b', USE_ASM + HEAP_IMPORTS + 'function f() { u8[' + BUF_MIN + '] = -1 } return f'), this, null, buf);
