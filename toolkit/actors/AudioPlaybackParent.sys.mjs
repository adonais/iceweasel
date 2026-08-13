/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class AudioPlaybackParent extends JSWindowActorParent {
  constructor() {
    super();
    this._hasBlockMedia = false;
  }
  receiveMessage(aMessage) {
    const browser = this.browsingContext.top.embedderElement;
    switch (aMessage.name) {
      case "AudioPlayback:ActiveMediaBlockStart":
        this._hasBlockMedia = true;
        browser.activeMediaBlockStarted();
        break;
      case "AudioPlayback:ActiveMediaBlockStop":
        this._hasBlockMedia = false;
        browser.activeMediaBlockStopped();
        break;
    }
  }
  didDestroy() {
    const browser = this.browsingContext.top.embedderElement;
    if (browser && this._hasBlockMedia) {
      browser.activeMediaBlockStopped();
    }
  }
}
