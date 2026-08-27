/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RecommendedFooter } from "./recommended-footer.mjs";

export class RecommendedExtensionsFooter extends RecommendedFooter {
  static get markup() {
    return `
      <template>
        <div class="amo-link-container view-footer-item">
          <button
            class="primary"
            action="open-amo"
            data-l10n-id="find-more-addons"
          ></button>
        </div>
        <addons-promo
          imagesrc="chrome://mozapps/skin/extensions/kit-addons.svg"
          imagealignment="end"
          data-l10n-id="find-more-extensions-promo"
        >
          <moz-button
            slot="actions"
            action="open-amo"
            size="large"
            data-l10n-id="find-more-extensions-promo-open-amo-button"
          ></moz-button>
        </addons-promo>
        <div class="view-footer-item">
          <a
            class="privacy-policy-link"
            data-l10n-id="privacy-policy"
            target="_blank"
          ></a>
        </div>
      </template>
    `;
  }
}
customElements.define(
  "recommended-extensions-footer",
  RecommendedExtensionsFooter,
  {
    extends: "footer",
  }
);
