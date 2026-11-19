/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ProcInfoIPCUtils_h
#define mozilla_ProcInfoIPCUtils_h

#include "ipc/IPCMessageUtils.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/ProcInfo.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::ThreadInfo, tid, name, cpuTime,
                                  cpuCycleCount);

}  // namespace IPC

#endif
