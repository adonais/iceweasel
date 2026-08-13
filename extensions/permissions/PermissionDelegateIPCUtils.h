/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_permissiondelegateipcutils_h
#define mozilla_permissiondelegateipcutils_h

#include "ipc/IPCMessageUtils.h"

#include "mozilla/PermissionDelegateHandler.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(
    mozilla::PermissionDelegateHandler::DelegatedPermissionList, mPermissions);

}  // namespace IPC

#endif  // mozilla_permissiondelegateipcutils_h
