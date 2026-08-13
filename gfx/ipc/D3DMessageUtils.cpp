/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "D3DMessageUtils.h"

#include "ipc/IPCMessageUtils.h"
#if defined(XP_WIN)
#  include "gfxWindowsPlatform.h"
#endif

bool DxgiAdapterDesc::operator==(const DxgiAdapterDesc& aOther) const {
  return memcmp(&aOther, this, sizeof(*this)) == 0;
}

#if defined(XP_WIN)
static_assert(sizeof(DxgiAdapterDesc) == sizeof(DXGI_ADAPTER_DESC),
              "DXGI_ADAPTER_DESC doe snot match DxgiAdapterDesc");

const DxgiAdapterDesc& DxgiAdapterDesc::From(const DXGI_ADAPTER_DESC& aDesc) {
  return reinterpret_cast<const DxgiAdapterDesc&>(aDesc);
}

const DXGI_ADAPTER_DESC& DxgiAdapterDesc::ToDesc() const {
  return reinterpret_cast<const DXGI_ADAPTER_DESC&>(*this);
}
#endif

namespace IPC {

#if defined(XP_WIN)
IMPLEMENT_IPC_SERIALIZER_WITH_FIELDS(DxgiAdapterDesc, Description, VendorId,
                                     DeviceId, SubSysId, Revision,
                                     DedicatedVideoMemory,
                                     DedicatedSystemMemory, SharedSystemMemory,
                                     AdapterLuid.LowPart, AdapterLuid.HighPart);
#endif

}  // namespace IPC
