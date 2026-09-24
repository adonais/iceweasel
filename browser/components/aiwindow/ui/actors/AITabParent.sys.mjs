/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AITabStore } from "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs";

const PAGE_NAME_REGEX = /^[\w-]+(\.html)?$/;

/**
 * Parent actor for about:aitab. Resolves the page name from the page URL into
 * the stored page config that content renders.
 */
export class AITabParent extends JSWindowActorParent {
  async receiveMessage({ data, name }) {
    if (name != "AITab:GetPage") {
      console.warn(`AITabParent received unknown message: ${name}`);
      return null;
    }

    return this.#handleGetPage(data);
  }

  async #handleGetPage({ pageName } = {}) {
    if (!pageName) {
      return { success: false, error: "Missing page name" };
    }

    if (!PAGE_NAME_REGEX.test(pageName)) {
      return { success: false, error: "Invalid page name" };
    }

    try {
      const page = await AITabStore.getBySlug(pageName);
      return { success: true, page };
    } catch (error) {
      console.error("Failed to retrieve AI Tab page:", error);
      return { success: false, error: "Failed to retrieve page" };
    }
  }
}
