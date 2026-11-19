/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WEBRTC_IPC_TRAITS_H_
#define WEBRTC_IPC_TRAITS_H_

#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "ipc/IPCMessageUtilsSpecializations.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/RTCConfigurationBinding.h"
#include "mozilla/dom/RTCIceTransportBinding.h"

namespace IPC {

template <>
struct ParamTraits<mozilla::dom::RTCIceTransportPolicy>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::RTCIceTransportPolicy> {};

template <>
struct ParamTraits<mozilla::dom::RTCIceTransportState>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::RTCIceTransportState> {};

}  // namespace IPC

#endif  // WEBRTC_IPC_TRAITS_H_
