/*
 * Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef wasm_process_h
#define wasm_process_h

#include "mozilla/Atomics.h"
#include "mozilla/Attributes.h"

#include <stddef.h>

#include "js/AllocPolicy.h"
#include "js/Vector.h"
#include "threading/Mutex.h"
#include "wasm/WasmMemory.h"

namespace js {
namespace wasm {

class Code;
class CodeRange;
class CodeBlock;
class TagType;

using RawCodeBlockVector = Vector<const CodeBlock*, 0, SystemAllocPolicy>;

#ifdef ENABLE_WASM_JSPI
extern const TagType* sJSPromiseTagType;
#endif
extern const TagType* sWrappedJSValueTagType;
static constexpr uint32_t WrappedJSValueTagType_ValueOffset = 0;

// Because of profiling, the thread running wasm might need to know to which
// CodeBlock the current PC belongs, during a call to lookup(). A lookup
// is a read-only operation, and we don't want to take a lock then
// (otherwise, we could have a deadlock situation if an async lookup
// happened on a given thread that was holding mutatorsMutex_ while getting
// sampled). Since the writer could be modifying the data that is getting
// looked up, the writer functions use spin-locks to know if there are any
// observers (i.e. calls to lookup()) of the atomic data.

class ThreadSafeCodeBlockMap {
  // Since writes (insertions or removals) can happen on any background
  // thread at the same time, we need a lock here.

  Mutex mutatorsMutex_ MOZ_UNANNOTATED;

  RawCodeBlockVector segments1_;
  RawCodeBlockVector segments2_;

  // Except during swapAndWait(), there are no lookup() observers of the
  // vector pointed to by mutableCodeBlocks_

  RawCodeBlockVector* mutableCodeBlocks_;
  mozilla::Atomic<const RawCodeBlockVector*> readonlyCodeBlocks_;
  mozilla::Atomic<size_t> numActiveLookups_;

  // Whether the map holds no code block. Maintained by insert() and remove()
  // while mutatorsMutex_ is held, and readable without a lock as a very fast
  // check for whether any wasm code exists at all. Only used by simulators.
  //
  // empty_ and readonlyCodeBlocks_ are both seq-cst atomics. They are both
  // mutated within mutatorsMutex_ and read without locks. It is safe to
  // see !empty_ when in fact readonlyCodeBlocks_ is empty (we just do a no-op
  // check). But it is not safe to see empty_ when in fact readonlyCodeBlocks_
  // is non empty because we may skip a check.
  //
  // When transitioning to !empty_ we set it first before updating
  // readonlyCodeBlocks_. When transitioning to empty_ we update
  // readonlyCodeBlocks_ first before empty_.
  mozilla::Atomic<bool> empty_;

  struct CodeBlockPC;

  void swapAndWait();

 public:
  ThreadSafeCodeBlockMap();
  ~ThreadSafeCodeBlockMap();

  size_t numActiveLookups() const { return numActiveLookups_; }
  bool empty() const { return empty_; }

  bool insert(const CodeBlock* cs);
  void remove(const CodeBlock* cs);

  const CodeBlock* lookup(const void* pc,
                          const CodeRange** codeRange = nullptr);
};

// The process-wide map from pc to CodeBlock. Null before wasm::Init() and
// after wasm::ShutDown().
//
// This field is only atomic to handle buggy scenarios where we crash during
// startup or shutdown and thus racily perform wasm::LookupCodeBlock() from
// the crashing thread.

extern mozilla::Atomic<ThreadSafeCodeBlockMap*> sThreadSafeCodeBlockMap;

// A very fast lookup to know if there is any code block at all.

inline bool CodeExists() {
  ThreadSafeCodeBlockMap* map = sThreadSafeCodeBlockMap;
  return map && !map->empty();
}

// These methods return the wasm::CodeBlock (resp. wasm::Code) containing
// the given pc, if any exist in the process. These methods do not take a lock,
// and thus are safe to use in a profiling context.

const CodeBlock* LookupCodeBlock(const void* pc,
                                 const CodeRange** codeRange = nullptr);

const Code* LookupCode(const void* pc, const CodeRange** codeRange = nullptr);

// Return whether the given PC is in any type of wasm code (module or builtin).

bool InCompiledCode(void* pc);

// These methods allow to (un)register CodeBlocks so they can be looked up
// via pc in the methods described above.

bool RegisterCodeBlock(const CodeBlock* cs);

void UnregisterCodeBlock(const CodeBlock* cs);

// Whether this process is configured to use huge memory or not.  Note that this
// is not precise enough to tell whether a particular memory uses huge memory,
// there are additional conditions for that.

bool IsHugeMemoryEnabled(AddressType t, PageSize sz);

// Called once before/after the last VM execution which could execute or compile
// wasm.

bool Init();

void ShutDown();

}  // namespace wasm
}  // namespace js

#endif  // wasm_process_h
