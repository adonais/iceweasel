/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef loader_AutoMemMap_h
#define loader_AutoMemMap_h

#include "mozilla/FileUtils.h"
#include "mozilla/MemoryMappedFile.h"
#include "mozilla/RangedPtr.h"
#include "mozilla/Result.h"

#include <prio.h>

class nsIFile;

namespace mozilla {
namespace ipc {
class FileDescriptor;
}

namespace loader {

class AutoMemMap {
  typedef mozilla::ipc::FileDescriptor FileDescriptor;

 public:
  AutoMemMap() = default;

  ~AutoMemMap() { reset(); }

  AutoMemMap(const AutoMemMap&) = delete;
  void operator=(const AutoMemMap&) = delete;

  Result<Ok, nsresult> init(nsIFile* aFile);
  Result<Ok, nsresult> init(const FileDescriptor& aFile);

  void reset();

  bool initialized() const { return mFile.IsValid(); }

  uint32_t size() const { return mFile.Size(); }

  template <typename T = void>
  RangedPtr<const T> get() const {
    MOZ_ASSERT(mFile.IsValid());
    return {static_cast<const T*>(mFile.Data()), mFile.Size()};
  }

  size_t nonHeapSizeOfExcludingThis() { return mFile.Size(); }

  FileDescriptor cloneFileDescriptor() const;
  FileDescriptor cloneHandle() const;

  // Makes this mapping persistent. After calling this, the mapped memory
  // will remained mapped, even after this instance is destroyed.
  void setPersistent() { mPersistent = true; }

 private:
  AutoFDClose mFD;
  MemoryMappedFile mFile;
  bool mPersistent = false;
};

}  // namespace loader
}  // namespace mozilla

#endif  // loader_AutoMemMap_h
