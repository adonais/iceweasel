/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_URIHasher_h
#define mozilla_net_URIHasher_h

#include "mozilla/Atomics.h"
#include "mozilla/HashFunctions.h"
#include "nsString.h"

namespace mozilla::net {

// Mixin that implements nsIURI::SpecHash() as a lazily-computed, cached
// HashString() of the URI spec, so callers that hash the same URI repeatedly
// (e.g. the image cache and every nsURIHashKey-keyed table) don't rescan a
// potentially very large spec, such as a data: URI.
//
// A concrete URI class mixes this in and forwards the (necessarily virtual)
// interface method, passing its spec:
//
//   uint32_t SpecHash() override { return CachedSpecHash(mSpec); }
//
// The argument must byte-equal GetSpec(). URIs that store their spec verbatim
// (nsSimpleURI, nsStandardURL) pass their member directly and avoid a copy;
// URIs that synthesize their spec pass a local GetSpec() result instead.
//
// Call ResetSpecHash() whenever the spec is rebuilt.
//
// URIs are threadsafe-refcounted and may be hashed from several threads at
// once, so the cache is a single relaxed atomic: racing callers each compute
// the same value and store it, and a 32-bit store/load can't tear. The value 0
// means "not computed", so the ~1-in-2^32 spec hashing to 0 is simply
// recomputed each time (correct, negligible). ResetSpecHash() is only called
// while the Mutator is still building the URI (single-threaded), so it never
// races a concurrent read of a published URI.
class URIHasher {
 protected:
  uint32_t CachedSpecHash(const nsACString& aSpec) {
    uint32_t hash = mSpecHash;
    if (hash == 0) {
      hash = HashString(aSpec.BeginReading(), aSpec.Length());
      mSpecHash = hash;
    }
    return hash;
  }

  void ResetSpecHash() { mSpecHash = 0; }

 private:
  Atomic<uint32_t, Relaxed> mSpecHash{0};
};

}  // namespace mozilla::net

#endif  // mozilla_net_URIHasher_h
