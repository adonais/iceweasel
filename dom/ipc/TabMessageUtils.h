/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TABMESSAGE_UTILS_H
#define TABMESSAGE_UTILS_H

#include "TabMessageTypes.h"
#include "X11UndefineNone.h"
#include "ipc/EnumSerializer.h"
#include "mozilla/dom/EffectsInfo.h"
#include "mozilla/dom/Event.h"
#include "mozilla/layers/LayersMessageUtils.h"
#include "nsCOMPtr.h"
#include "nsIRemoteTab.h"
#include "nsPIDOMWindow.h"

namespace IPC {

template <>
struct ParamTraits<nsSizeMode>
    : public ContiguousEnumSerializer<nsSizeMode, nsSizeMode_Normal,
                                      nsSizeMode_Invalid> {};

template <>
struct ParamTraits<nsIRemoteTab::NavigationType>
    : public ContiguousEnumSerializerInclusive<
          nsIRemoteTab::NavigationType,
          nsIRemoteTab::NavigationType::NAVIGATE_BACK,
          nsIRemoteTab::NavigationType::NAVIGATE_URL> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::EffectsInfo, mVisibleRect,
                                  mRasterScale, mTransformToAncestorScale);

template <>
struct ParamTraits<mozilla::WhenToScroll>
    : public ContiguousEnumSerializerInclusive<
          mozilla::WhenToScroll, mozilla::WhenToScroll::Always,
          mozilla::WhenToScroll::IfNotFullyVisible> {};

template <>
struct ParamTraits<mozilla::ScrollFlags>
    : public BitFlagsEnumSerializer<mozilla::ScrollFlags,
                                    mozilla::ScrollFlags::ALL_BITS> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::WhereToScroll, mPercentage);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::AxisScrollParams, mWhereToScroll,
                                  mWhenToScroll);

template <>
struct ParamTraits<mozilla::dom::EmbedderElementEventType>
    : public ContiguousEnumSerializer<
          mozilla::dom::EmbedderElementEventType,
          mozilla::dom::EmbedderElementEventType::NoEvent,
          mozilla::dom::EmbedderElementEventType::EndGuard_> {};

}  // namespace IPC

#endif  // TABMESSAGE_UTILS_H
