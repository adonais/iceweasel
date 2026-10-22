/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_FS_PARENT_FILESYSTEMCIPHERKEYMANAGER_H_
#define DOM_FS_PARENT_FILESYSTEMCIPHERKEYMANAGER_H_

#include "mozilla/dom/quota/CipherKeyManager.h"
#include "mozilla/dom/quota/NSSRandomAccessCipherStrategy.h"
#include "nsLiteralString.h"
#include "nsStringFwd.h"

namespace mozilla::dom::fs {

using FileSystemCipherStrategy = quota::NSSRandomAccessCipherStrategy;
using FileSystemCipherKeyManager =
    quota::CipherKeyManager<FileSystemCipherStrategy>;
using FileSystemCipherKey = FileSystemCipherStrategy::KeyType;

/**
 * Key id of the metadata database's key.
 */
constexpr nsLiteralCString kDatabaseCipherKeyId = "database"_ns;

}  // namespace mozilla::dom::fs

#endif  // DOM_FS_PARENT_FILESYSTEMCIPHERKEYMANAGER_H_
