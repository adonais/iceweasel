/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PlayingRefChangeHandler_h_
#define PlayingRefChangeHandler_h_

#include "AudioNodeTrack.h"
#include "nsThreadUtils.h"

namespace mozilla::dom {

class PlayingRefChangeHandler final : public Runnable {
 public:
  enum ChangeType { ADDREF, RELEASE };
  PlayingRefChangeHandler(AudioNodeTrack* aTrack, ChangeType aChange);

  NS_IMETHOD Run() override;

 private:
  RefPtr<AudioNodeTrack> mTrack;
  ChangeType mChange;
};

}  // namespace mozilla::dom

#endif
