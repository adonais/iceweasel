/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <windows.h>

#include "MemoryMappedFile.h"
#include "private/pprio.h"

namespace mozilla {

MemoryMappedFile MemoryMappedFile::OpenRaw(FileHandle aHandle,
                                           size_t aMaxSize) {
  if (!FileHandleIsValid(aHandle)) {
    return {};
  }

  // Validate the file size.
  LARGE_INTEGER sizeLI;
  if (!GetFileSizeEx(aHandle, &sizeLI) || sizeLI.QuadPart < 0 ||
      static_cast<uint64_t>(sizeLI.QuadPart) >
          static_cast<uint64_t>(aMaxSize)) {
    return {};
  }
  const size_t size = sizeLI.QuadPart;
  // Zero-size needs special handling.
  if (size == 0) {
    return Empty();
  }

  UniqueFileHandle mapping(
      CreateFileMappingA(aHandle, nullptr, PAGE_READONLY, 0, 0, nullptr));
  if (!mapping) {
    return {};
  }
  if (void* data = MapViewOfFile(mapping.get(), FILE_MAP_READ, 0, 0, size)) {
    return MemoryMappedFile(data, size);
  }
  return {};
}

MemoryMappedFile MemoryMappedFile::Open(PRFileDesc* aPRFile, size_t aMaxSize) {
  if (!aPRFile) {
    return {};
  }
  const HANDLE handle = (HANDLE)PR_FileDesc2NativeHandle(aPRFile);
  return OpenRaw(handle, aMaxSize);
}

void MemoryMappedFile::Unmap() {
  if (mSize) {
    UnmapViewOfFile((void*)mData);
  }
  mSize = 0;
  mData = nullptr;
}

}  // namespace mozilla
