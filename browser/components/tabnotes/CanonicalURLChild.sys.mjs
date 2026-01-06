/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  findCandidates: "moz-src:///browser/components/tabnotes/CanonicalURL.sys.mjs",
  pickCanonicalUrl:
    "moz-src:///browser/components/tabnotes/CanonicalURL.sys.mjs",
});

/**
 * Identifies the canonical URL in a top-level content frame, if possible,
 * and notifies the parent process about it.
 */
export class CanonicalURLChild extends JSWindowActorChild {
  /**
   * @param {Event} event
   */
  handleEvent(event) {
    switch (event.type) {
      case "DOMContentLoaded":
        this.#discoverCanonicalUrl();
    }
  }

  /**
   * Find a canonical URL in the document and tell the parent about it.
   */
  #discoverCanonicalUrl() {
    const candidates = lazy.findCandidates(this.document);
    const canonicalUrl = lazy.pickCanonicalUrl(candidates);
    const canonicalUrlSources = Object.keys(candidates).filter(
      candidate => candidates[candidate]
    );
    this.sendAsyncMessage("CanonicalURL:Identified", {
      canonicalUrl,
      canonicalUrlSources,
    });
  }
}
