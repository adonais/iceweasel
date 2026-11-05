/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GeckoViewActorParent } from "resource://gre/modules/GeckoViewActorParent.sys.mjs";
import { GeckoViewUtils } from "resource://gre/modules/GeckoViewUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  GeckoViewPictureInPictureController:
    "resource://gre/modules/GeckoViewPictureInPicture.sys.mjs",
});

const { debug } = GeckoViewUtils.initLogging(
  "GeckoViewPictureInPicturePlayer[P]"
);

// Stands in for toolkit's PictureInPictureParent. That one forwards every message to the XUL
// player window so it can update its controls; GeckoView has no such window, because the
// embedder owns the picture-in-picture surface, so those messages are dropped for now.
export class GeckoViewPictureInPicturePlayerParent extends GeckoViewActorParent {
  receiveMessage(msg) {
    switch (msg.name) {
      case "PictureInPicture:Close": {
        return lazy.GeckoViewPictureInPictureController.askEmbedderToClose(
          this.browser
        );
      }
      default: {
        debug`ignoring player message ${msg.name}`;
        return null;
      }
    }
  }

  setupPlayer(videoRef) {
    return this.sendQuery("PictureInPicture:SetupPlayer", {
      videoRef,
      isPipApiRequest: false,
    });
  }
}
