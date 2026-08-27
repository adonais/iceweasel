/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AutoMemMap.h"

#include "mozilla/ipc/FileDescriptor.h"
#include "mozilla/Try.h"

#include <private/pprio.h>

#include "nsIFile.h"
#include "ScriptPreloader-inl.h"

namespace mozilla {
namespace loader {

using namespace mozilla::ipc;

FileDescriptor AutoMemMap::cloneFileDescriptor() const {
  if (mFD.get()) {
    auto handle =
        FileDescriptor::PlatformHandleType(PR_FileDesc2NativeHandle(mFD.get()));
    return FileDescriptor(handle);
  }
  return FileDescriptor();
}

FileDescriptor AutoMemMap::cloneHandle() const { return cloneFileDescriptor(); }

Result<Ok, nsresult> AutoMemMap::init(nsIFile* file) {
  MOZ_ASSERT(!mFD);

  MOZ_TRY(file->OpenNSPRFileDesc(PR_RDONLY, 0, getter_Transfers(mFD)));

  mFile = MemoryMappedFile::Open(mFD.get(), UINT32_MAX);
  if (!mFile.IsValid()) {
    return Err(NS_ERROR_FAILURE);
  }
  return Ok();
}

Result<Ok, nsresult> AutoMemMap::init(const FileDescriptor& file) {
  MOZ_ASSERT(!mFD);
  if (!file.IsValid()) {
    return Err(NS_ERROR_INVALID_ARG);
  }

  auto handle = file.ClonePlatformHandle();

  mFD.reset(PR_ImportFile(PROsfd(handle.get())));
  if (!mFD) {
    return Err(NS_ERROR_FAILURE);
  }
  (void)handle.release();

  mFile = MemoryMappedFile::Open(mFD.get(), UINT32_MAX);
  if (!mFile.IsValid()) {
    return Err(NS_ERROR_FAILURE);
  }
  return Ok();
}

void AutoMemMap::reset() {
  if (mPersistent) {
    mFile.Leak();
  } else {
    mFile.Unmap();
  }
  mFD = nullptr;
}

}  // namespace loader
}  // namespace mozilla
