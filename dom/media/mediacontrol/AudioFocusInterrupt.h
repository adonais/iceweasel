/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_MEDIACONTROL_AUDIOFOCUSINTERRUPT_H_
#define DOM_MEDIA_MEDIACONTROL_AUDIOFOCUSINTERRUPT_H_

#include "mozilla/DefineEnum.h"

namespace mozilla::dom {

// Direction of an audio-focus interrupt dispatched to content media receivers.
// Suspend silences the tab's potentially audible sources on a transient focus
// loss; Resume resumes the ones the interrupt suspended on a focus gain;
// SuspendPermanently silences them on a permanent loss, after which nothing
// resumes them.
MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING(AudioFocusInterruptAction, uint8_t,
                                             (Suspend, Resume,
                                              SuspendPermanently));

// Whether an audio-focus loss is resumable: a Transient loss is undone by a
// later focus gain, a Permanent one is not.
MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING(AudioSessionInterruptKind, uint8_t,
                                             (Transient, Permanent));

}  // namespace mozilla::dom

#endif  // DOM_MEDIA_MEDIACONTROL_AUDIOFOCUSINTERRUPT_H_
