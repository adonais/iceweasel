/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GeckoViewActorChild } from "resource://gre/modules/GeckoViewActorChild.sys.mjs";
import { GeckoViewUtils } from "resource://gre/modules/GeckoViewUtils.sys.mjs";

const { debug } = GeckoViewUtils.initLogging(
  "GeckoViewPictureInPictureSource[C]"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContentDOMReference: "resource://gre/modules/ContentDOMReference.sys.mjs",
});

export class GeckoViewPictureInPictureSourceChild extends GeckoViewActorChild {
  receiveMessage(msg) {
    switch (msg.name) {
      case "GeckoView:PictureInPicture:FindVideo":
        return this.findPlayingVideo();
    }
    return null;
  }

  /**
   * The first video this frame is playing, in document order, or null if it is
   * playing none.
   *
   * @returns {?{videoRef: object}}
   */
  findPlayingVideo() {
    const doc = this.document;
    if (!doc) {
      return null;
    }

    // A video with no dimensions has no frames to clone yet.
    const video = [...doc.querySelectorAll("video")].find(
      v => !v.paused && v.videoWidth > 0 && v.videoHeight > 0
    );
    if (!video) {
      return null;
    }

    debug`findPlayingVideo: bcId=${this.browsingContext.id} ${video.videoWidth}x${video.videoHeight}`;

    return { videoRef: lazy.ContentDOMReference.get(video) };
  }
}
