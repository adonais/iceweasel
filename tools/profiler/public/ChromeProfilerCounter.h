/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ChromeProfilerCounter_h
#define ChromeProfilerCounter_h

#include "mozilla/MemoryReporting.h"
#include "mozilla/ProfilerCounts.h"
#include "nsISupportsImpl.h"
#include "nsString.h"

namespace mozilla {

/**
 * This is the backing object for the ProfilerCounter that
 * ChromeUtils.addProfilerCounter() returns, and it is created and used from JS.
 *
 * Ownership is intentionally shared. The wrapping mozilla::dom::ProfilerCounter
 * holds a reference and drops it when JS is done. The profiler holds its own
 * reference for as long as this counter is registered, because the profile
 * buffer keeps raw pointers to this counter in the samples it has already
 * recorded. This object is refcounted so that it outlives both the garbage
 * collection of the wrapper and the recording session, which prevents a
 * use-after-free when the buffer is serialized.
 */
class ChromeProfilerCounter final : public BaseProfilerCount {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(ChromeProfilerCounter)

  ChromeProfilerCounter(const nsACString& aName, const nsACString& aCategory,
                        const nsACString& aDescription);

  /**
   * Called on construction to register the counter with the profiler core.
   */
  void Register();

  /**
   * Called on destruction to unregister with the profiler core.
   */
  void Unregister();

  /**
   * Profile counters can be incremented and decremented by a delta value as
   * frequently as is desired. However, the value is only added to the profile
   * once per sample. Adds made while no profiling session is active are
   * harmless but do not appear in any session, since the counter is reset to
   * zero at the start of each session.
   */
  void Add(int64_t aDelta) { mCount += aDelta; }

  /**
   * Reset the counter to zero. The profiler calls this at the start of each
   * session so that a session's samples measure only the adds made during that
   * session, and values from earlier sessions do not leak into later ones.
   */
  void Clear() { mCount = 0; }

  CountSample Sample() override;

  size_t SizeOfIncludingThis(MallocSizeOf aMallocSizeOf) const;

 private:
  ~ChromeProfilerCounter();

  const nsCString mNameStorage;
  const nsCString mCategoryStorage;
  const nsCString mDescriptionStorage;
  ProfilerAtomicSigned mCount;
};

}  // namespace mozilla

#endif  // ChromeProfilerCounter_h
