/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MemoryMappedFile.h"

// sys/types.h *must* appear before mman.h on some systems.
// clang-format off
#include <sys/types.h>
// clang-format on
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#include "private/pprio.h"

namespace mozilla {

MemoryMappedFile MemoryMappedFile::OpenRaw(FileHandle aFD, size_t aMaxSize) {
  if (aFD < 0) {
    return {};
  }

  struct stat st;
  // Stat the file, check type, and validate size.
  if (fstat(aFD, &st) != 0 || !S_ISREG(st.st_mode) ||
      st.st_size < 0 ||  // off_t is signed.
      static_cast<uint64_t>(st.st_size) > static_cast<uint64_t>(aMaxSize)) {
    return {};
  }

  const size_t size = st.st_size;
  // Zero-size needs special handling.
  if (size == 0) {
    return Empty();
  }
  const void* data = mmap(nullptr, size, PROT_READ, MAP_PRIVATE, aFD, 0);
  // mmap returns MAP_FAILED (usually -1) on failure, not NULL.
  if (data != MAP_FAILED) {
    return MemoryMappedFile(data, size);
  }
  return {};
}

MemoryMappedFile MemoryMappedFile::Open(PRFileDesc* aPRFile, size_t aMaxSize) {
  if (!aPRFile) {
    return {};
  }
  const int fd = PR_FileDesc2NativeHandle(aPRFile);
  return OpenRaw(fd, aMaxSize);
}

void MemoryMappedFile::Unmap() {
  if (mSize) {
    munmap((void*)mData, mSize);
  }
  mSize = 0;
  mData = nullptr;
}

}  // namespace mozilla
