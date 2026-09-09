/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ChromeProfilerCounter.h"

#include "mozilla/ProfilerCounts.h"

namespace mozilla {

ChromeProfilerCounter::ChromeProfilerCounter(const nsACString& aName,
                                             const nsACString& aCategory,
                                             const nsACString& aDescription)
    : BaseProfilerCount(nullptr, nullptr, nullptr),
      mNameStorage(aName),
      mCategoryStorage(aCategory),
      mDescriptionStorage(aDescription),
      mCount(0) {
  mLabel = mNameStorage.get();
  mCategory = mCategoryStorage.get();
  mDescription = mDescriptionStorage.get();
}

ChromeProfilerCounter::~ChromeProfilerCounter() = default;

void ChromeProfilerCounter::Register() {
  profiler_add_sampled_chrome_counter(this);
}

void ChromeProfilerCounter::Unregister() {
  profiler_remove_sampled_chrome_counter(this);
}

size_t ChromeProfilerCounter::SizeOfIncludingThis(
    MallocSizeOf aMallocSizeOf) const {
  return aMallocSizeOf(this) +
         mNameStorage.SizeOfExcludingThisIfUnshared(aMallocSizeOf) +
         mCategoryStorage.SizeOfExcludingThisIfUnshared(aMallocSizeOf) +
         mDescriptionStorage.SizeOfExcludingThisIfUnshared(aMallocSizeOf);
}

BaseProfilerCount::CountSample ChromeProfilerCounter::Sample() {
  CountSample sample = {
      .count = mCount,
      // The counter's number field is deliberately left set to zero and is not
      // exposed through the JavaScript API. The number field is a secondary,
      // monotonically increasing series that tracks how many operations
      // occurred rather than the value being measured, and it exists to drive
      // an activity indication alongside the main count curve. Only a few
      // built-in counters populate it for a specific purpose: the memory
      // counter reports the number of allocations and deallocations, and the
      // bandwidth counter reports the number of read and write operations. The
      // Firefox Profiler front end reads this series in exactly one place,
      // namely the counter tooltip, and it only displays it when the counter's
      // category is one of those recognized presets. Because a
      // JavaScript-created counter uses an arbitrary category, it falls through
      // to the generic display, which never renders the number series, so any
      // value it sent would be invisible end to end. Exposing the field would
      // also add real complexity, since it must never decrease and a naive API
      // could easily violate that invariant. For these reasons the feature
      // stays provisional and scoped to the single count series, and number can
      // be revisited later if a concrete consumer and a matching front-end
      // display are added together.
      .number = 0,
      .isSampleNew = true,
  };
  return sample;
}

}  // namespace mozilla
