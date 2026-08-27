/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RemotePageChild } from "resource://gre/actors/RemotePageChild.sys.mjs";

export class AboutPDFChild extends RemotePageChild {
  actorCreated() {
    super.actorCreated();

    this.exportFunctions([
      "RPMCanSetDefaultPDFHandler",
      "RPMPickPDFFile",
      "RPMSetDefaultPDFHandler",
    ]);
  }

  RPMCanSetDefaultPDFHandler() {
    return this.wrapPromise(this.sendQuery("AboutPDF:CanSetDefaultPDFHandler"));
  }

  // User activation prevents the page from opening OS UI without a user
  // gesture. The parent still treats content messages as untrusted.
  RPMPickPDFFile() {
    if (!this.contentWindow.navigator.userActivation.isActive) {
      throw new Error("User activation is required");
    }

    return this.wrapPromise(this.sendQuery("AboutPDF:PickFile"));
  }

  RPMSetDefaultPDFHandler() {
    if (!this.contentWindow.navigator.userActivation.isActive) {
      throw new Error("User activation is required");
    }

    return this.wrapPromise(this.sendQuery("AboutPDF:SetDefaultPDFHandler"));
  }
}
