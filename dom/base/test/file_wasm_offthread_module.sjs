// Serves a generated wasm module large enough to be compiled off the main
// thread.
//
// ScriptLoader only compiles a wasm module off-main-thread when its bytecode is
// at least OffThreadMinimumWasmLength (16 KiB, see dom/script/ScriptLoader.cpp).
//
// The module is a sequence of uniquely-named exported functions taking two i32s
// and returning one. f0 uses i32.add, so f0(2, 3) == 5.

const CC = Components.Constructor;

const BinaryOutputStream = CC(
  "@mozilla.org/binaryoutputstream;1",
  "nsIBinaryOutputStream",
  "setOutputStream"
);

const MINIMUM_BYTES = 20 * 1024;

// i32.add, i32.sub, i32.mul, i32.and, i32.or, i32.xor. Rotating the operation
// keeps the function bodies from being byte-identical.
const OPS = [0x6a, 0x6b, 0x6c, 0x71, 0x72, 0x73];

const I32 = 0x7f;
const FUNCTYPE = 0x60;

const SECTION_TYPE = 1;
const SECTION_FUNCTION = 3;
const SECTION_EXPORT = 7;
const SECTION_CODE = 10;

function uleb128(value) {
  const out = [];
  for (;;) {
    const byte = value & 0x7f;
    value >>>= 7;
    if (value) {
      out.push(byte | 0x80);
    } else {
      out.push(byte);
      return out;
    }
  }
}

function vec(items) {
  return uleb128(items.length).concat(...items);
}

function section(sectionId, payload) {
  return [sectionId].concat(uleb128(payload.length), payload);
}

function buildModule(numFunctions) {
  const functype = [FUNCTYPE].concat(vec([[I32], [I32]]), vec([[I32]]));

  const exports = [];
  const codes = [];
  for (let i = 0; i < numFunctions; i++) {
    const name = Array.from(`f${i}`, c => c.charCodeAt(0));
    exports.push(uleb128(name.length).concat(name, [0x00], uleb128(i)));
    // local.get 0; local.get 1; <op>; end
    const body = [0x00, 0x20, 0x00, 0x20, 0x01, OPS[i % OPS.length], 0x0b];
    codes.push(uleb128(body.length).concat(body));
  }

  return [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00].concat(
    section(SECTION_TYPE, vec([functype])),
    section(SECTION_FUNCTION, vec(new Array(numFunctions).fill(uleb128(0)))),
    section(SECTION_EXPORT, vec(exports)),
    section(SECTION_CODE, vec(codes))
  );
}

function buildModuleOfAtLeast(minimumBytes) {
  // We currently average ~17 bytes per function, so this is safe.
  let numFunctions = Math.floor(minimumBytes / 16);
  return buildModule(numFunctions);
}

function handleRequest(request, response) {
  response.setHeader("Content-Type", "application/wasm", false);
  response.setHeader("Cache-Control", "no-store", false);

  const bos = new BinaryOutputStream(response.bodyOutputStream);
  bos.writeByteArray(buildModuleOfAtLeast(MINIMUM_BYTES));
}
