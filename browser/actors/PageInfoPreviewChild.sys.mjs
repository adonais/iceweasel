/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class PageInfoPreviewChild extends JSWindowActorChild {
  async receiveMessage(message) {
    if (message.name === "PageInfoPreview:resize") {
      return this.resize(this.contentWindow.document, message.data);
    }

    return undefined;
  }

  resize(document, data) {
    let img = document.querySelector("img");
    if (!img) {
      return undefined;
    }

    const physWidth = img.width || 0;
    const physHeight = img.height || 0;

    if (data.width !== undefined) {
      img.width = data.width;
    }
    if (data.height !== undefined) {
      img.height = data.height;
    }

    return {
      physWidth,
      physHeight,
      width: img.width,
      height: img.height,
    };
  }
}
