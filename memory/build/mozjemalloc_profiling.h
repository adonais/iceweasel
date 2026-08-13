/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZJEMALLOC_PROFILING_H
#define MOZJEMALLOC_PROFILING_H

#include "mozilla/Atomics.h"
#include "mozilla/RefPtr.h"
#include "mozilla/TimeStamp.h"
#include "mozjemalloc_types.h"
#include "mozmemory_wrap.h"

namespace mozilla {

struct PurgeStats {
  arena_id_t arena_id;
  const char* arena_label;
  const char* caller;

  // The number of previously-dirty pages that are now clean.
  size_t pages_dirty = 0;

  // The total number of pages that were cleaned (includes already clean
  // pages).
  size_t pages_total = 0;

  // The number of pages that can't be purged because of alignment because
  // of logical/hardware page alignment.
  size_t pages_unpurgable = 0;

  size_t system_calls = 0;
  size_t chunks = 0;

  PurgeStats(arena_id_t aId, const char* aLabel, const char* aCaller)
      : arena_id(aId), arena_label(aLabel), caller(aCaller) {}
};

#ifdef MOZJEMALLOC_PROFILING_CALLBACKS
// MallocProfilerCallbacks is refcounted so that one thread cannot destroy it
// while another accesses it. It is AddRef'd and Released from inside the
// allocator (see arena_t::PurgeLoop), which can run while free() releases dirty
// pages during thread teardown. Routing those refcount operations through the
// XPCOM refcount logger (NS_LogAddRef / NS_LogRelease) is unsafe there: the
// logger reads NSPR thread-private state, which has already been freed for a
// thread that is in the middle of exiting. We therefore hand-roll a plain,
// non-logging atomic refcount, like the profiler's other mozglue-level
// refcounted types (see ThreadInfo and PageInformation), rather than deriving
// from mozilla::external::AtomicRefCounted.
class MallocProfilerCallbacks {
 public:
  void AddRef() const { ++mRefCnt; }
  void Release() const {
    MOZ_ASSERT(int32_t(mRefCnt) > 0);
    if (0 == --mRefCnt) {
      delete this;
    }
  }

  virtual ~MallocProfilerCallbacks() {}

  using TS = mozilla::TimeStamp;

  virtual void OnPurge(TS aStart, TS aEnd, const PurgeStats& aStats,
                       ArenaPurgeResult aResult) = 0;

 private:
  mutable Atomic<int32_t, MemoryOrdering::ReleaseAcquire> mRefCnt{0};
};

MOZ_JEMALLOC_API void jemalloc_set_profiler_callbacks(
    RefPtr<MallocProfilerCallbacks>&& aCallbacks);
#endif

}  // namespace mozilla

#endif  // ! MOZJEMALLOC_PROFILING_H
