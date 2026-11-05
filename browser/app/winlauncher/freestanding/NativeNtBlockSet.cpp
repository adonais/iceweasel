/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "NativeNtBlockSet.h"

#include "mozilla/SEH.h"
#include "mozilla/WindowsDllBlocklistInfo.h"

namespace mozilla {
namespace freestanding {

NativeNtBlockSet::NativeNtBlockSetEntry* NativeNtBlockSet::NewEntry(
    const UNICODE_STRING& aName, uint64_t aVersion,
    NativeNtBlockSet::NativeNtBlockSetEntry* aNextEntry) {
  HANDLE processHeap = nt::RtlGetProcessHeap();
  if (!processHeap) {
    return nullptr;
  }

  // aName may point into memory we don't own (e.g. the SharedSection view,
  // which can be unmapped later), so copy it into the entry's allocation.
  void* ptr = ::RtlAllocateHeap(processHeap, 0,
                                sizeof(NativeNtBlockSetEntry) + aName.Length);
  if (!ptr) {
    return nullptr;
  }

  auto* nameCopy = reinterpret_cast<PWCH>(static_cast<char*>(ptr) +
                                          sizeof(NativeNtBlockSetEntry));
  memcpy(nameCopy, aName.Buffer, aName.Length);

  UNICODE_STRING ownedName;
  ownedName.Buffer = nameCopy;
  ownedName.Length = aName.Length;
  ownedName.MaximumLength = aName.Length;

  return new (ptr) NativeNtBlockSetEntry(ownedName, aVersion, aNextEntry);
}

void NativeNtBlockSet::Add(const UNICODE_STRING& aName, uint64_t aVersion) {
  nt::AutoExclusiveLock lock(mLock);

  for (NativeNtBlockSetEntry* entry = mFirstEntry; entry;
       entry = entry->mNext) {
    if (::RtlEqualUnicodeString(&entry->mName, &aName, TRUE) &&
        aVersion == entry->mVersion) {
      return;
    }
  }

  // Not present, add it
  NativeNtBlockSetEntry* newEntry = NewEntry(aName, aVersion, mFirstEntry);
  if (newEntry) {
    mFirstEntry = newEntry;
  }
}

void NativeNtBlockSet::Write(WritableBuffer& aBuffer) {
  // NB: If this function is called, it is long after kernel32 is initialized,
  // so it is safe to use Win32 calls here.
  char buf[MAX_PATH];

  // It would be nicer to use RAII here. However, its destructor
  // might not run if an exception occurs, in which case we would never release
  // the lock (MSVC warns about this possibility). So we acquire and release
  // manually.
  ::AcquireSRWLockExclusive(&mLock);

  MOZ_SEH_TRY {
    for (auto entry = mFirstEntry; entry; entry = entry->mNext) {
      int convOk = ::WideCharToMultiByte(CP_UTF8, 0, entry->mName.Buffer,
                                         entry->mName.Length / sizeof(wchar_t),
                                         buf, sizeof(buf), nullptr, nullptr);
      if (!convOk) {
        continue;
      }

      // write name[,v.v.v.v];
      aBuffer.Write(buf, convOk);

      if (entry->mVersion != DllBlockInfoT<UNICODE_STRING>::ALL_VERSIONS) {
        aBuffer.Write(",", 1);
        uint16_t parts[4];
        parts[0] = entry->mVersion >> 48;
        parts[1] = (entry->mVersion >> 32) & 0xFFFF;
        parts[2] = (entry->mVersion >> 16) & 0xFFFF;
        parts[3] = entry->mVersion & 0xFFFF;
        for (size_t p = 0; p < std::size(parts); ++p) {
          _ltoa_s(parts[p], buf, sizeof(buf), 10);
          aBuffer.Write(buf, strlen(buf));
          if (p != std::size(parts) - 1) {
            aBuffer.Write(".", 1);
          }
        }
      }
      aBuffer.Write(";", 1);
    }
  }
  MOZ_SEH_EXCEPT(EXCEPTION_EXECUTE_HANDLER) {}

  ::ReleaseSRWLockExclusive(&mLock);
}

}  // namespace freestanding
}  // namespace mozilla
