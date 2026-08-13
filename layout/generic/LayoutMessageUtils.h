/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_GENERIC_LAYOUTMESSAGEUTILS_H_
#define LAYOUT_GENERIC_LAYOUTMESSAGEUTILS_H_

#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "mozilla/AspectRatio.h"
#include "mozilla/webrender/WebRenderTypes.h"
#include "nsIFrame.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::IntrinsicSize, width, height);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::AspectRatio, mRatio);

template <>
struct ParamTraits<mozilla::StyleImageRendering>
    : public ContiguousEnumSerializerInclusive<
          mozilla::StyleImageRendering, mozilla::StyleImageRendering::Auto,
          mozilla::StyleImageRendering::Optimizequality> {};

}  // namespace IPC

#endif  // LAYOUT_GENERIC_LAYOUTMESSAGEUTILS_H_
