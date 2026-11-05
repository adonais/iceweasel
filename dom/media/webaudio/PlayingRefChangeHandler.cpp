/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PlayingRefChangeHandler.h"

#include "AudioNodeEngine.h"

namespace mozilla::dom {

PlayingRefChangeHandler::PlayingRefChangeHandler(AudioNodeTrack* aTrack,
                                                 ChangeType aChange)
    : Runnable("dom::PlayingRefChangeHandler"),
      mTrack(aTrack),
      mChange(aChange) {}

NS_IMETHODIMP PlayingRefChangeHandler::Run() {
  RefPtr<AudioNode> node = mTrack->Engine()->NodeMainThread();
  if (node) {
    if (mChange == ADDREF) {
      node->MarkActive();
    } else if (mChange == RELEASE) {
      node->MarkInactive();
    }
  }
  return NS_OK;
}

}  // namespace mozilla::dom
