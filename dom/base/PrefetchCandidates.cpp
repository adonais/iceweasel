/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/PrefetchCandidates.h"

#include "mozilla/dom/speculationrules_ffi_generated.h"
#include "nsTArray.h"

namespace mozilla::dom {

/* static */ void PrefetchCandidates::operator delete(
    void* aPrefetchCandidates) {
  prefetch_candidates_destroy(
      reinterpret_cast<PrefetchCandidates*>(aPrefetchCandidates));
}

/* static */
UniquePtr<PrefetchCandidates> PrefetchCandidates::Create() {
  return UniquePtr<PrefetchCandidates>(create_prefetch_candidates());
}

size_t PrefetchCandidates::Length() const {
  return prefetch_candidates_length(this);
}

nsTArray<PrefetchCandidate> PrefetchCandidates::AsArray() const {
  AutoTArray<PrefetchCandidate, 10> array;
  prefetch_candidates_as_array(this, &array);
  return std::move(array);
}

void PrefetchCandidates::Group() { prefetch_candidates_group(this); }

}  // namespace mozilla::dom
