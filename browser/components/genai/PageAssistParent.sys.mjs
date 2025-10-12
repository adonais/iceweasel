/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JSWindowActor to pass data between PageAssist singleton and content pages.
 */
export class PageAssistParent extends JSWindowActorParent {
  async fetchPageData() {
    // Forward request to child
    return this.sendQuery("PageAssist:FetchPageData");
  }
}
