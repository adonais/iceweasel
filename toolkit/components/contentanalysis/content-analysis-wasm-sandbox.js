/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Compiles and runs the in-process WebAssembly DLP module. This script is loaded
// (via loadSubScript) into a null-principal sandbox living in a privilegedabout
// process by ContentAnalysisWasmChild.
//
// The sandbox has no chrome privileges (Cc/Ci/Components are unavailable), so
// failures are reported with plain Errors; the child actor turns them into the
// runner's callback.onError.

// The wasm module's exported ABI contract:
//   ca_abi_version() -> i32
//   ca_alloc(len) -> ptr ; ca_free(ptr, len)
//   ca_analyze(reqPtr, reqLen, contentPtr, contentLen,
//              rulesPtr, rulesCount, outLenPtr) -> respPtr
const ABI_VERSION = 1;

// Layout of the module's `#[repr(C)]` rule structs on wasm32 (4-byte pointers and
// usize). Must match content-analysis-wasm's FfiStr/FfiRule exactly.
//   FfiStr  { ptr: u32, len: u32 }                              // 8 bytes
//   FfiRule { name: FfiStr,             // @0
//             operations: u32,          // @8  (ptr to u32 array)
//             operations_count: u32,    // @12
//             domains: u32,             // @16 (ptr to FfiStr array)
//             domains_count: u32,       // @20
//             content_patterns: u32,    // @24 (ptr to FfiStr array)
//             patterns_count: u32,      // @28
//             rule_type: u8,            // @32 (0=report, 1=warn, 2=block)
//             message: FfiStr }         // @36
const FFI_STR_SIZE = 8;
const FFI_RULE_SIZE = 44;
const FFI_RULE_OPERATIONS_OFFSET = 8;
const FFI_RULE_OPERATIONS_COUNT_OFFSET = 12;
const FFI_RULE_DOMAINS_OFFSET = 16;
const FFI_RULE_DOMAINS_COUNT_OFFSET = 20;
const FFI_RULE_PATTERNS_OFFSET = 24;
const FFI_RULE_PATTERNS_COUNT_OFFSET = 28;
const FFI_RULE_TYPE_OFFSET = 32;
const FFI_RULE_MESSAGE_OFFSET = 36;

// The currently loaded module instance, kept across analyze() calls so the
// module is only recompiled when it changes (see loadModule).
let gInstance = null;

// Compile and instantiate the module, verifying the ABI version. Called by the
// child actor whenever the configured module changes.
// eslint-disable-next-line no-unused-vars
function loadModule(moduleBytes) {
  const module = new WebAssembly.Module(moduleBytes);
  const instance = new WebAssembly.Instance(module, {});
  if (instance.exports.ca_abi_version() !== ABI_VERSION) {
    throw new Error("Unexpected DLP wasm ABI version");
  }
  gInstance = instance;
}

/**
 * Lower the caller-supplied rule objects into the module's FfiRule ABI in linear
 * memory. Allocates every buffer up front (linear-memory addresses stay valid as
 * memory grows), then writes them all with a single fresh view. Returns the
 * rules-array pointer/count plus the allocations to free afterward.
 *
 * @param {*} ex  The module with ca_alloc entry point
 * @param {Array} aRules The rules to convert
 * @returns {{ptr: number, count: number, allocations: Array<{ptr: number, len: number}>}}
 */
function marshalRules(ex, aRules) {
  const allocations = [];
  const alloc = len => {
    if (!len) {
      return 0;
    }
    const ptr = ex.ca_alloc(len);
    allocations.push({ ptr, len });
    return ptr;
  };

  const rules = aRules || [];
  if (!rules.length) {
    return { ptr: 0, count: 0, allocations };
  }

  const encoder = new TextEncoder();
  const encodeAll = strs => Array.from(strs, s => encoder.encode(s));

  // Phase 1: encode strings and reserve all buffers. Linear-memory addresses
  // stay valid as memory grows, so we can write them all afterward.
  const prepared = rules.map(rule => {
    const nameBytes = encoder.encode(rule.name);
    const operations = Array.from(rule.operations);
    const domainBytes = encodeAll(rule.domains);
    const patternBytes = encodeAll(rule.contentPatterns);
    const messageBytes = rule.message ? encoder.encode(rule.message) : null;

    return {
      ruleType: rule.ruleType,
      nameBytes,
      namePtr: alloc(nameBytes.length),
      operations,
      operationsPtr: alloc(operations.length * 4),
      domainBytes,
      domainPtrs: domainBytes.map(b => alloc(b.length)),
      domainsArrPtr: alloc(domainBytes.length * FFI_STR_SIZE),
      patternBytes,
      patternPtrs: patternBytes.map(b => alloc(b.length)),
      patternsArrPtr: alloc(patternBytes.length * FFI_STR_SIZE),
      messageBytes,
      messagePtr: messageBytes ? alloc(messageBytes.length) : 0,
    };
  });
  const rulesPtr = alloc(prepared.length * FFI_RULE_SIZE);

  // Phase 2: write all bytes and structs with one view taken after allocation.
  const bytes = new Uint8Array(ex.memory.buffer);
  const view = new DataView(ex.memory.buffer);
  const writeStr = (offset, ptr, len) => {
    view.setUint32(offset, ptr, true);
    view.setUint32(offset + 4, len, true);
  };
  // Write each string's bytes and its FfiStr-array entry at `arrPtr`.
  const writeStrArray = (arrPtr, byteArrays, ptrs) => {
    byteArrays.forEach((byteArray, i) => {
      if (ptrs[i]) {
        bytes.set(byteArray, ptrs[i]);
      }
      writeStr(arrPtr + i * FFI_STR_SIZE, ptrs[i], byteArray.length);
    });
  };

  prepared.forEach((p, i) => {
    if (p.namePtr) {
      bytes.set(p.nameBytes, p.namePtr);
    }
    p.operations.forEach((op, j) => {
      view.setUint32(p.operationsPtr + j * 4, op, true);
    });
    writeStrArray(p.domainsArrPtr, p.domainBytes, p.domainPtrs);
    writeStrArray(p.patternsArrPtr, p.patternBytes, p.patternPtrs);
    if (p.messagePtr) {
      bytes.set(p.messageBytes, p.messagePtr);
    }

    const base = rulesPtr + i * FFI_RULE_SIZE;
    writeStr(base, p.namePtr, p.nameBytes.length);
    view.setUint32(base + FFI_RULE_OPERATIONS_OFFSET, p.operationsPtr, true);
    view.setUint32(
      base + FFI_RULE_OPERATIONS_COUNT_OFFSET,
      p.operations.length,
      true
    );
    view.setUint32(base + FFI_RULE_DOMAINS_OFFSET, p.domainsArrPtr, true);
    view.setUint32(
      base + FFI_RULE_DOMAINS_COUNT_OFFSET,
      p.domainBytes.length,
      true
    );
    view.setUint32(base + FFI_RULE_PATTERNS_OFFSET, p.patternsArrPtr, true);
    view.setUint32(
      base + FFI_RULE_PATTERNS_COUNT_OFFSET,
      p.patternBytes.length,
      true
    );
    view.setUint8(base + FFI_RULE_TYPE_OFFSET, p.ruleType);
    writeStr(
      base + FFI_RULE_MESSAGE_OFFSET,
      p.messagePtr,
      p.messageBytes ? p.messageBytes.length : 0
    );
  });

  return { ptr: rulesPtr, count: prepared.length, allocations };
}

// Run the loaded module against a request. Returns the serialized
// ContentAnalysisResponse as a Uint8Array.
// eslint-disable-next-line no-unused-vars
function runAnalyze({ requestBytes, contentBytes, rules }) {
  if (!gInstance) {
    throw new Error("DLP wasm module not loaded");
  }
  const ex = gInstance.exports;
  const req = Uint8Array.from(requestBytes);
  const content = Uint8Array.from(contentBytes || []);

  // Every buffer allocated so far, freed in the `finally` below even if a
  // later step throws (e.g. the module traps during ca_analyze), so a failed
  // analysis can't leak the module's linear memory.
  const allocations = [];
  const alloc = len => {
    if (!len) {
      return 0;
    }
    const ptr = ex.ca_alloc(len);
    allocations.push({ ptr, len });
    return ptr;
  };
  let respPtr = 0;
  let outLen = 0;

  try {
    // WebAssembly.Memory.buffer is detached and replaced when memory grows, so
    // re-create the view from ex.memory.buffer after every call that allocates.
    const outLenPtr = alloc(4);
    const reqPtr = alloc(req.length);
    if (reqPtr) {
      new Uint8Array(ex.memory.buffer).set(req, reqPtr);
    }
    const contentPtr = alloc(content.length);
    if (contentPtr) {
      new Uint8Array(ex.memory.buffer).set(content, contentPtr);
    }
    const marshalled = marshalRules(ex, rules);
    allocations.push(...marshalled.allocations);

    respPtr = ex.ca_analyze(
      reqPtr,
      req.length,
      contentPtr,
      content.length,
      marshalled.ptr,
      marshalled.count,
      outLenPtr
    );
    outLen = new DataView(ex.memory.buffer).getUint32(outLenPtr, true);
    return new Uint8Array(ex.memory.buffer, respPtr, outLen).slice();
  } finally {
    if (respPtr) {
      ex.ca_free(respPtr, outLen);
    }
    for (const a of allocations) {
      if (a.ptr) {
        ex.ca_free(a.ptr, a.len);
      }
    }
  }
}
