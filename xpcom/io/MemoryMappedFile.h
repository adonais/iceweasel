/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MemoryMappedFile_h
#define mozilla_MemoryMappedFile_h

#include <prio.h>
#include <stdint.h>  // For SIZE_MAX

#include "mozilla/UniquePtrExtensions.h"

namespace mozilla {

/**
 * RAII wrapper to map an entire file into memory as read-only.
 */
class MemoryMappedFile final {
  using FileHandle = UniqueFileHandle::element_type;

  const void* mData = nullptr;
  size_t mSize = 0;

  /**
   * Open a memory mapped file directly from a system file handle.
   *
   * This will check for invalid system file handle values.
   * Unix fd < 0, Win32 INVALID_HANDLE_VALUE, etc.
   */
  static MemoryMappedFile OpenRaw(FileHandle aFileHandle, size_t aMaxSize);
  MemoryMappedFile(const void* aData, size_t aSize)
      : mData(aData), mSize(aSize) {}
  static MemoryMappedFile Empty() {
    // Have to distinguish an empty file from a missing file.
    // You can't map zero bytes, that will fail. Instead, provide a non-null
    // value as the data, but give a zero size.
    // This case is checked in Unmap, to ensure we don't try to call
    // munmap/UnmapViewOfFile on this pointer.
    return MemoryMappedFile("", 0);
  }

 public:
  /**
   * Constructs a default value. IsValid() will be false for this value.
   */
  MemoryMappedFile() = default;

  /**
   * Memory map a file from a system file handle.
   *
   * aMaxSize limits the maximum number of bytes to map, a larger file will
   * result in a failure.
   *
   * Check IsValid() to determine if the file has been successfully opened or
   * not.
   */
  static MemoryMappedFile Open(const UniqueFileHandle& aFileHandle,
                               size_t aMaxSize = SIZE_MAX) {
    return OpenRaw(aFileHandle.get(), aMaxSize);
  }
  /**
   * Memory map a file from NSPR file.
   *
   * aMaxSize limits the maximum number of bytes to map, a larger file will
   * result in a failure.
   *
   * Check IsValid() to determine if the file has been successfully opened or
   * not.
   */
  static MemoryMappedFile Open(PRFileDesc* aPRFile, size_t aMaxSize = SIZE_MAX);

  MemoryMappedFile(MemoryMappedFile&& aOther)
      : mData(aOther.mData), mSize(aOther.mSize) {
    aOther.mData = nullptr;
    aOther.mSize = 0;
  }
  MemoryMappedFile& operator=(MemoryMappedFile&& aOther) {
    Unmap();
    mData = aOther.mData;
    mSize = aOther.mSize;
    aOther.mData = nullptr;
    aOther.mSize = 0;
    return *this;
  }
  ~MemoryMappedFile() { Unmap(); }

  /**
   * Checks if this represents the contents of a file.
   *
   * If the file doesn't exist, couldn't be opened, or couldn't be mapped,
   * then this will return false.
   */
  bool IsValid() const { return mData; }
  explicit operator bool() const { return IsValid(); }

  /**
   * The data underlying the file.
   *
   * This will be null if the file could not be opened.
   * This will never be null for a file that was mapped, even if the file
   * is empty.
   */
  const void* Data() const { return mData; }

  /**
   * The size of the data.
   *
   * This can be zero for a file that does exist, if the file is empty.
   */
  size_t Size() const { return mSize; }

  /**
   * Frees the memory associated with this file.
   */
  void Unmap();

  /**
   * Drop the memory associated with this file, without freeing it.
   */
  void Leak() {
    mData = nullptr;
    mSize = 0;
  }
};

}  // namespace mozilla

#endif
