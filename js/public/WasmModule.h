/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef js_WasmModule_h
#define js_WasmModule_h

#include "mozilla/RefPtr.h"  // RefPtr

#include <stddef.h>  // size_t
#include <stdint.h>  // uint8_t

#include "jstypes.h"  // JS_PUBLIC_API

#include "js/AllocPolicy.h"  // js::SystemAllocPolicy
#include "js/RefCounted.h"   // AtomicRefCounted
#include "js/TypeDecls.h"    // HandleObject
#include "js/Utility.h"      // JS::UniqueChars
#include "js/Vector.h"       // js::Vector

namespace JS {

/**
 * The WasmModule interface allows the embedding to hold a reference to the
 * underlying C++ implementation of a JS WebAssembly.Module object for purposes
 * of efficient postMessage() and (de)serialization from a random thread.
 *
 * In particular, this allows postMessage() of a WebAssembly.Module:
 * GetWasmModule() is called when making a structured clone of a payload
 * containing a WebAssembly.Module object. The structured clone buffer holds a
 * refcount of the JS::WasmModule until createObject() is called in the target
 * agent's JSContext. The new WebAssembly.Module object continues to hold the
 * JS::WasmModule and thus the final reference of a JS::WasmModule may be
 * dropped from any thread and so the virtual destructor (and all internal
 * methods of the C++ module) must be thread-safe.
 */

struct WasmModule : js::AtomicRefCounted<WasmModule> {
  virtual ~WasmModule() = default;
  virtual JSObject* createObject(JSContext* cx) const = 0;
};

extern JS_PUBLIC_API bool IsWasmModuleObject(HandleObject obj);

extern JS_PUBLIC_API RefPtr<WasmModule> GetWasmModule(HandleObject obj);

class JS_PUBLIC_API ReadOnlyCompileOptions;

struct WasmCompileArgs : js::AtomicRefCounted<WasmCompileArgs> {
  virtual ~WasmCompileArgs() = default;
};

using WasmCompileWarnings = js::Vector<UniqueChars, 0, js::SystemAllocPolicy>;

using SharedWasmCompileArgs = RefPtr<const WasmCompileArgs>;

extern JS_PUBLIC_API SharedWasmCompileArgs
BuildCompileArgsForESM(JSContext* cx, const ReadOnlyCompileOptions& options);

struct ESMCompileResult {
  enum class Status {
    Success,
    Failed,
    OutOfMemory,
  };

  Status status = Status::OutOfMemory;
  RefPtr<const WasmModule> module;
  UniqueChars error;
  WasmCompileWarnings warnings;
};

extern JS_PUBLIC_API ESMCompileResult CompileForESM(
    const WasmCompileArgs& compileArgs, const uint8_t* bytes, size_t length);

extern JS_PUBLIC_API bool FinishCompileForESM(
    JSContext* cx, const WasmCompileArgs& compileArgs,
    const ESMCompileResult& compileResult, MutableHandleObject moduleObj);

}  // namespace JS

#endif /* js_WasmModule_h */
