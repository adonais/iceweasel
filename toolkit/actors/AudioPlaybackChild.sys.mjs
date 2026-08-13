/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class AudioPlaybackChild extends JSWindowActorChild {
  observe(subject, topic, data) {
    if (topic === "audio-playback") {
      let name = "AudioPlayback:";
      if (data === "activeMediaBlockStart") {
        name += "ActiveMediaBlockStart";
      } else if (data === "activeMediaBlockStop") {
        name += "ActiveMediaBlockStop";
      } else {
        // TODO: The "active"/"inactive" data values previously drove
        // DOMAudioPlaybackStarted/Stopped in the parent; that path is now
        // replaced by the MediaController onaudiblechange event. The remaining
        // media-block messages and the whole AudioPlayback actor will be
        // removed in a follow-up.
        return;
      }
      this.sendAsyncMessage(name);
    }
  }
}
