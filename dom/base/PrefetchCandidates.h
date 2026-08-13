/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_PrefetchCandidates_h
#define mozilla_dom_PrefetchCandidates_h

#include "mozilla/UniquePtr.h"
#include "nsTArrayForwardDeclare.h"

enum class nsresult : uint32_t;

namespace mozilla::dom {

struct PrefetchCandidate;

class PrefetchCandidates final {
 public:
  PrefetchCandidates() = delete;
  PrefetchCandidates(PrefetchCandidates&) = delete;
  PrefetchCandidates& operator=(const PrefetchCandidates&) = delete;

  ~PrefetchCandidates() = default;
  static void operator delete(void* aPrefetchCandidates);

  static UniquePtr<PrefetchCandidates> Create();

  size_t Length() const;
  // Create an array of C++-safe objects from the Rust-based candidates.
  nsTArray<PrefetchCandidate> AsArray() const;

  void Group();
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_PrefetchCandidates_h
