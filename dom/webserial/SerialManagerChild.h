/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SerialManagerChild_h
#define mozilla_dom_SerialManagerChild_h

#include "mozilla/dom/PSerialManagerChild.h"
#include "mozilla/dom/SerialPortChild.h"
#include "mozilla/dom/SerialPortInfo.h"

namespace mozilla::dom {

class Serial;

// Child-side actor for PSerialManager, managed by PWindowGlobal.
// Lives on the main thread.
class SerialManagerChild final : public PSerialManagerChild {
 public:
  NS_INLINE_DECL_REFCOUNTING(SerialManagerChild, override)

  explicit SerialManagerChild(Serial* aSerial);

  MOZ_CAN_RUN_SCRIPT_BOUNDARY void ActorDestroy(
      ActorDestroyReason aWhy) override;

 private:
  ~SerialManagerChild();

  WeakPtr<Serial> mSerial;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_SerialManagerChild_h
