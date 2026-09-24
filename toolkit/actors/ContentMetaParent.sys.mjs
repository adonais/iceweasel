/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ACCEPTED_PROTOCOLS = new Set(["http:", "https:"]);

export class ContentMetaParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name == "Meta:SetPageInfo") {
      let browser = this.manager.browsingContext.top.embedderElement;
      if (browser) {
        let { description, previewImageURL } = message.data;
        if (previewImageURL) {
          let url = URL.parse(previewImageURL);
          if (!url || !ACCEPTED_PROTOCOLS.has(url.protocol)) {
            previewImageURL = null;
          }
        }
        let event = new browser.documentGlobal.CustomEvent("pageinfo", {
          bubbles: true,
          cancelable: false,
          detail: {
            url: this.manager.documentURI.spec,
            description,
            previewImageURL,
          },
        });
        browser.dispatchEvent(event);
      }
    }
  }
}
