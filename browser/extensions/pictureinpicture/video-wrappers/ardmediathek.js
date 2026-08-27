/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class PictureInPictureVideoWrapper {
  setCaptionContainerObserver(video, updateCaptionsFunction) {
    let container = video.closest(".ardplayer");

    if (container) {
      updateCaptionsFunction("");
      const callback = mutationList => {
        if (mutationList) {
          let changed = false;
          for (const mutation of mutationList) {
            if (mutation.target.matches?.(".ardplayer-untertitel")) {
              changed = true;
              break;
            }
          }

          if (!changed) {
            return;
          }
        }

        let text = container.querySelector(".ardplayer-untertitel")?.innerText;
        if (!text) {
          updateCaptionsFunction("");
          return;
        }

        updateCaptionsFunction(text);
      };

      callback();

      this.captionsObserver = new MutationObserver(callback);

      this.captionsObserver.observe(container, {
        childList: true,
        subtree: true,
      });
    }
  }

  removeCaptionContainerObserver() {
    this.captionsObserver?.disconnect();
  }
}

this.PictureInPictureVideoWrapper = PictureInPictureVideoWrapper;
