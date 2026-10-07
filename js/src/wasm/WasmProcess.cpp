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

#include "wasm/WasmProcess.h"

#include "mozilla/BinarySearch.h"
#include "mozilla/ScopeExit.h"

#include "gc/Memory.h"
#include "threading/ExclusiveData.h"
#include "vm/MutexIDs.h"
#include "vm/Runtime.h"
#include "wasm/WasmBuiltinModule.h"
#include "wasm/WasmBuiltins.h"
#include "wasm/WasmCode.h"
#include "wasm/WasmComponent.h"
#include "wasm/WasmInstance.h"
#include "wasm/WasmModuleTypes.h"
#include "wasm/WasmStaticTypeDefs.h"

using namespace js;
using namespace wasm;

// Per-process map from values of program-counter (pc) to CodeBlocks.
//
// Whenever a new CodeBlock is ready to use, it has to be registered so that
// we can have fast lookups from pc to CodeBlocks in numerous places. Since
// wasm compilation may be tiered, and the second tier doesn't have access to
// any JSContext/JS::Compartment/etc lying around, we have to use a process-wide
// map instead.

mozilla::Atomic<ThreadSafeCodeBlockMap*> wasm::sThreadSafeCodeBlockMap(nullptr);

struct ThreadSafeCodeBlockMap::CodeBlockPC {
  const void* pc;
  explicit CodeBlockPC(const void* pc) : pc(pc) {}
  int operator()(const CodeBlock* cb) const {
    if (cb->containsCodePC(pc)) {
      return 0;
    }
    if (pc < cb->base()) {
      return -1;
    }
    return 1;
  }
};

ThreadSafeCodeBlockMap::ThreadSafeCodeBlockMap()
    : mutatorsMutex_(mutexid::WasmCodeBlockMap),
      mutableCodeBlocks_(&segments1_),
      readonlyCodeBlocks_(&segments2_),
      numActiveLookups_(0),
      empty_(true) {}

ThreadSafeCodeBlockMap::~ThreadSafeCodeBlockMap() {
  MOZ_RELEASE_ASSERT(numActiveLookups_ == 0);
  segments1_.clearAndFree();
  segments2_.clearAndFree();
}

void ThreadSafeCodeBlockMap::swapAndWait() {
  // Both vectors are consistent for lookup at this point although their
  // contents are different: there is no way for the looked up PC to be
  // in the code segment that is getting registered, because the code
  // segment is not even fully created yet.

  // If a lookup happens before this instruction, then the
  // soon-to-become-former read-only pointer is used during the lookup,
  // which is valid.

  mutableCodeBlocks_ = const_cast<RawCodeBlockVector*>(
      readonlyCodeBlocks_.exchange(mutableCodeBlocks_));

  // If a lookup happens after this instruction, then the updated vector
  // is used, which is valid:
  // - in case of insertion, it means the new vector contains more data,
  // but it's fine since the code segment is getting registered and thus
  // isn't even fully created yet, so the code can't be running.
  // - in case of removal, it means the new vector contains one less
  // entry, but it's fine since unregistering means the code segment
  // isn't used by any live instance anymore, thus PC can't be in the
  // to-be-removed code segment's range.

  // A lookup could have happened on any of the two vectors. Wait for
  // observers to be done using any vector before mutating.

  while (numActiveLookups_ > 0) {
  }
}

bool ThreadSafeCodeBlockMap::insert(const CodeBlock* cs) {
  LockGuard<Mutex> lock(mutatorsMutex_);

  size_t index;
  MOZ_ALWAYS_FALSE(BinarySearchIf(*mutableCodeBlocks_, 0,
                                  mutableCodeBlocks_->length(),
                                  CodeBlockPC(cs->base()), &index));

  if (!mutableCodeBlocks_->insert(mutableCodeBlocks_->begin() + index, cs)) {
    return false;
  }

  // Set empty_ first to ensure it's seen before readonlyCodeBlocks_.
  empty_ = false;

  swapAndWait();

#ifdef DEBUG
  size_t otherIndex;
  MOZ_ALWAYS_FALSE(BinarySearchIf(*mutableCodeBlocks_, 0,
                                  mutableCodeBlocks_->length(),
                                  CodeBlockPC(cs->base()), &otherIndex));
  MOZ_ASSERT(index == otherIndex);
#endif

  // Although we could simply revert the insertion in the read-only
  // vector, it is simpler to just crash and given that each CodeBlock
  // consumes multiple pages, it is unlikely this insert() would OOM in
  // practice
  AutoEnterOOMUnsafeRegion oom;
  if (!mutableCodeBlocks_->insert(mutableCodeBlocks_->begin() + index, cs)) {
    oom.crash("when inserting a CodeBlock in the process-wide map");
  }

  return true;
}

void ThreadSafeCodeBlockMap::remove(const CodeBlock* cs) {
  LockGuard<Mutex> lock(mutatorsMutex_);

  size_t index;
  MOZ_ALWAYS_TRUE(BinarySearchIf(*mutableCodeBlocks_, 0,
                                 mutableCodeBlocks_->length(),
                                 CodeBlockPC(cs->base()), &index));

  mutableCodeBlocks_->erase(mutableCodeBlocks_->begin() + index);

  swapAndWait();

#ifdef DEBUG
  size_t otherIndex;
  MOZ_ALWAYS_TRUE(BinarySearchIf(*mutableCodeBlocks_, 0,
                                 mutableCodeBlocks_->length(),
                                 CodeBlockPC(cs->base()), &otherIndex));
  MOZ_ASSERT(index == otherIndex);
#endif

  mutableCodeBlocks_->erase(mutableCodeBlocks_->begin() + index);

  // Now that readonlyCodeBlocks_ is updated, we can update empty_.
  empty_ = mutableCodeBlocks_->empty();
}

const CodeBlock* ThreadSafeCodeBlockMap::lookup(
    const void* pc, const CodeRange** codeRange /* = nullptr */) {
  auto decObserver = mozilla::MakeScopeExit([&] {
    MOZ_ASSERT(numActiveLookups_ > 0);
    numActiveLookups_--;
  });
  numActiveLookups_++;

  const RawCodeBlockVector* readonly = readonlyCodeBlocks_;

  size_t index;
  if (!BinarySearchIf(*readonly, 0, readonly->length(), CodeBlockPC(pc),
                      &index)) {
    if (codeRange) {
      *codeRange = nullptr;
    }
    return nullptr;
  }

  // It is fine returning a raw CodeBlock*, because we assume we are
  // looking up a live PC in code which is on the stack, keeping the
  // CodeBlock alive.

  const CodeBlock* result = (*readonly)[index];
  if (codeRange) {
    *codeRange = result->lookupRange(pc);
  }
  return result;
}

bool wasm::RegisterCodeBlock(const CodeBlock* cs) {
  if (cs->length() == 0) {
    return true;
  }

  // This function cannot race with startup/shutdown.
  ThreadSafeCodeBlockMap* map = sThreadSafeCodeBlockMap;
  MOZ_RELEASE_ASSERT(map);
  return map->insert(cs);
}

void wasm::UnregisterCodeBlock(const CodeBlock* cs) {
  if (cs->length() == 0) {
    return;
  }

  // This function cannot race with startup/shutdown.
  ThreadSafeCodeBlockMap* map = sThreadSafeCodeBlockMap;
  MOZ_RELEASE_ASSERT(map);
  map->remove(cs);
}

const CodeBlock* wasm::LookupCodeBlock(
    const void* pc, const CodeRange** codeRange /*= nullptr */) {
  ThreadSafeCodeBlockMap* map = sThreadSafeCodeBlockMap;
  if (!map) {
    return nullptr;
  }

  return map->lookup(pc, codeRange);
}

const Code* wasm::LookupCode(const void* pc,
                             const CodeRange** codeRange /* = nullptr */) {
  const CodeBlock* found = LookupCodeBlock(pc, codeRange);
  MOZ_ASSERT_IF(!found && codeRange, !*codeRange);
  return found ? found->code : nullptr;
}

bool wasm::InCompiledCode(void* pc) {
  if (LookupCodeBlock(pc)) {
    return true;
  }

  const CodeRange* codeRange;
  const uint8_t* codeBase;
  return LookupBuiltinThunk(pc, &codeRange, &codeBase);
}

#ifdef WASM_SUPPORTS_HUGE_MEMORY
#  if defined(__riscv)
// On riscv64, Sv39 is not enough for huge memory, so we require at least Sv48.
static const size_t MinAddressBitsForHugeMemory = 47;
#  elif defined(__loongarch__) && (__loongarch_grlen == 64)
// On loong64 silicon, there are two addressing modes observed: 40b VA on
// Loongson 3B6000M/2K3000, and 48b VA on various other models.  Only enable
// huge memory on the latter.
static const size_t MinAddressBitsForHugeMemory = 47;
#  else
/*
 * Some 64 bit systems greatly limit the range of available virtual memory. We
 * require about 6GiB for each wasm huge memory, which can exhaust the address
 * spaces of these systems quickly. In order to avoid this, we only enable huge
 * memory if we observe a large enough address space.
 *
 * This number is conservatively chosen to continue using huge memory on our
 * smallest address space system, Android on ARM64 (39 bits), along with a bit
 * for error in detecting the address space limit.
 */
static const size_t MinAddressBitsForHugeMemory = 38;
#  endif

/*
 * In addition to the above, some systems impose an independent limit on the
 * amount of virtual memory that may be used.
 */
static const size_t MinVirtualMemoryLimitForHugeMemory =
    size_t(1) << MinAddressBitsForHugeMemory;
#endif

static bool sHugeMemoryEnabled32 = false;

bool wasm::IsHugeMemoryEnabled(wasm::AddressType t, wasm::PageSize sz) {
  if (t == AddressType::I64 || sz != wasm::PageSize::Standard) {
    // No support for huge memory with 64-bit memories or custom page sizes.
    return false;
  }
  return sHugeMemoryEnabled32;
}

void ConfigureHugeMemory() {
#ifdef WASM_SUPPORTS_HUGE_MEMORY
  MOZ_ASSERT(!sHugeMemoryEnabled32);

  if (JS::Prefs::wasm_disable_huge_memory()) {
    return;
  }

  if (gc::SystemAddressBits() < MinAddressBitsForHugeMemory) {
    return;
  }

  if (gc::VirtualMemoryLimit() != size_t(-1) &&
      gc::VirtualMemoryLimit() < MinVirtualMemoryLimitForHugeMemory) {
    return;
  }

  sHugeMemoryEnabled32 = true;
#endif
}

#ifdef ENABLE_WASM_JSPI
const TagType* wasm::sJSPromiseTagType = nullptr;
#endif
const TagType* wasm::sWrappedJSValueTagType = nullptr;

static bool InitStaticTagTypes() {
  MutableTagType type = js_new<TagType>();
  if (!type || !type->initialize(StaticTypeDefs::jsExceptionTag)) {
    return false;
  }
  MOZ_ASSERT(WrappedJSValueTagType_ValueOffset ==
             type->exceptionArgOffsets()[0]);
  type.forget(&sWrappedJSValueTagType);

#ifdef ENABLE_WASM_JSPI
  type = js_new<TagType>();
  if (!type || !type->initialize(StaticTypeDefs::jsPromiseTag)) {
    return false;
  }
  type.forget(&sJSPromiseTagType);
#endif

  return true;
}

bool wasm::Init() {
  MOZ_RELEASE_ASSERT(!sThreadSafeCodeBlockMap);

  // Assert invariants that should universally hold true, but cannot be checked
  // at compile time.
  uintptr_t pageSize = gc::SystemPageSize();
  MOZ_RELEASE_ASSERT(wasm::NullPtrGuardSize <= pageSize);
  MOZ_RELEASE_ASSERT(intptr_t(nullptr) == AnyRef::NullRefValue);

  ConfigureHugeMemory();

  AutoEnterOOMUnsafeRegion oomUnsafe;
  ThreadSafeCodeBlockMap* map = js_new<ThreadSafeCodeBlockMap>();
  if (!map) {
    oomUnsafe.crash("js::wasm::Init");
  }

  if (!StaticTypeDefs::init()) {
    oomUnsafe.crash("js::wasm::Init");
  }

  // This uses StaticTypeDefs
  if (!BuiltinModuleFuncs::init()) {
    oomUnsafe.crash("js::wasm::Init");
  }

  sThreadSafeCodeBlockMap = map;

  if (!InitStaticTagTypes()) {
    oomUnsafe.crash("js::wasm::Init");
  }

  return true;
}

void wasm::ShutDown() {
  // If there are live runtimes then we are already pretty much leaking the
  // world, so to avoid spurious assertions (which are valid and valuable when
  // there are not live JSRuntimes), don't bother releasing anything here.
  if (JSRuntime::hasLiveRuntimes()) {
    return;
  }

  BuiltinModuleFuncs::destroy();
  StaticTypeDefs::destroy();
  PurgeCanonicalTypes();
#ifdef ENABLE_WASM_COMPONENTS
  PurgeComponentCanonicalTypes();
#endif

#ifdef ENABLE_WASM_JSPI
  if (sJSPromiseTagType) {
    sJSPromiseTagType->Release();
    sJSPromiseTagType = nullptr;
  }
#endif

  if (sWrappedJSValueTagType) {
    sWrappedJSValueTagType->Release();
    sWrappedJSValueTagType = nullptr;
  }

  // After signalling shutdown by clearing sThreadSafeCodeBlockMap, wait for
  // concurrent wasm::LookupCodeBlock()s to finish.
  ThreadSafeCodeBlockMap* map = sThreadSafeCodeBlockMap;
  MOZ_RELEASE_ASSERT(map);
  sThreadSafeCodeBlockMap = nullptr;
  while (map->numActiveLookups() > 0) {
  }

  ReleaseBuiltinThunks();
  js_delete(map);
}
