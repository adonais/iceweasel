/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_freestanding_NativeNtBlockSet_h
#define mozilla_freestanding_NativeNtBlockSet_h

#include "mozilla/Attributes.h"
#include "mozilla/NativeNt.h"
#include "mozilla/WindowsDllBlocklist.h"

namespace mozilla {
namespace freestanding {

using WritableBuffer = mozilla::glue::detail::WritableBuffer<1024>;

// The set of DLLs that have been blocked, written out to the crash report
// annotations via NativeNtBlockSet_Write.
class MOZ_STATIC_CLASS MOZ_TRIVIAL_CTOR_DTOR NativeNtBlockSet final {
  struct NativeNtBlockSetEntry {
    NativeNtBlockSetEntry() = default;
    ~NativeNtBlockSetEntry() = default;
    NativeNtBlockSetEntry(const UNICODE_STRING& aName, uint64_t aVersion,
                          NativeNtBlockSetEntry* aNext)
        : mName(aName), mVersion(aVersion), mNext(aNext) {}
    // mName.Buffer points to a copy of the name owned by this entry, stored
    // in the same heap allocation directly after the entry.
    UNICODE_STRING mName;
    uint64_t mVersion;
    NativeNtBlockSetEntry* mNext;
  };

 public:
  // Constructor and destructor MUST be trivial
  constexpr NativeNtBlockSet() : mFirstEntry(nullptr) {}
  ~NativeNtBlockSet() = default;

  // aName does not need to outlive this call; a copy of it is stored.
  void Add(const UNICODE_STRING& aName, uint64_t aVersion);
  void Write(WritableBuffer& buffer);

 private:
  static NativeNtBlockSetEntry* NewEntry(const UNICODE_STRING& aName,
                                         uint64_t aVersion,
                                         NativeNtBlockSetEntry* aNextEntry);

 private:
  NativeNtBlockSetEntry* mFirstEntry;
  mozilla::nt::SRWLock mLock;
};

}  // namespace freestanding
}  // namespace mozilla

#endif  // mozilla_freestanding_NativeNtBlockSet_h
