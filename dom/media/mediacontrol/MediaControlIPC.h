/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ipc_MediaControlIPC_h
#define ipc_MediaControlIPC_h

#include "ipc/EnumSerializer.h"
#include "ipc/IPCMessageUtils.h"
#include "mozilla/dom/AudioSessionBinding.h"
#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/ContentMediaController.h"
#include "mozilla/dom/MediaControlKeySource.h"
#include "mozilla/dom/MediaControllerBinding.h"
#include "mozilla/dom/MediaPlaybackStatus.h"

namespace IPC {
template <>
struct ParamTraits<mozilla::dom::AudioFocusInterruptAction>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::AudioFocusInterruptAction,
          mozilla::dom::AudioFocusInterruptAction::Suspend,
          mozilla::dom::AudioFocusInterruptAction::Resume> {};

template <>
struct ParamTraits<mozilla::dom::MediaControlKey>
    : public mozilla::dom::WebIDLEnumSerializer<mozilla::dom::MediaControlKey> {
};

template <>
struct ParamTraits<mozilla::dom::MediaPlaybackState>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::MediaPlaybackState,
          mozilla::dom::MediaPlaybackState::eStarted,
          mozilla::dom::MediaPlaybackState::eStopped> {};

template <>
struct ParamTraits<mozilla::dom::MediaAudibleState>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::MediaAudibleState,
          mozilla::dom::MediaAudibleState::eInaudible,
          mozilla::dom::MediaAudibleState::eAudible> {};

template <>
struct ParamTraits<mozilla::dom::ControlType>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::ControlType, mozilla::dom::ControlType::eControllable,
          mozilla::dom::ControlType::eUncontrollable> {};

template <>
struct ParamTraits<mozilla::dom::AudioSessionType>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::AudioSessionType, mozilla::dom::AudioSessionType::Auto,
          mozilla::dom::AudioSessionType::Play_and_record> {};

template <>
struct ParamTraits<mozilla::dom::AudioSessionState>
    : public ContiguousEnumSerializerInclusive<
          mozilla::dom::AudioSessionState,
          mozilla::dom::AudioSessionState::Inactive,
          mozilla::dom::AudioSessionState::Interrupted> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::AbsoluteSeek, mSeekTime,
                                  mFastSeek);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::MediaControlActionParams,
                                  mAbsolute, mRelativeSeekOffset, mVolume);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::MediaControlAction, mKey,
                                  mParams);

}  // namespace IPC

#endif  // mozilla_MediaControlIPC_hh
