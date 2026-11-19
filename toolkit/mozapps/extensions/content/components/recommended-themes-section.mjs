/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { RecommendedSection } from "./recommended-section.mjs";

// NOTE: importing recommended-footer webcomponent because it is used
// in this webcomponent template.
// eslint-disable-next-line import-x/no-unassigned-import
import "./recommended-themes-footer.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const RECOMMENDED_THEMES_EXPANDED =
  "extensions.htmlaboutaddons.themes-listview.recommended-themes-expanded";

const lazy = XPCOMUtils.declareLazy({
  recommendedThemesExpanded: {
    pref: RECOMMENDED_THEMES_EXPANDED,
    default: true,
  },
});

class RecommendedThemesSection extends RecommendedSection {
  get card() {
    return this.querySelector(":scope > moz-card");
  }

  render() {
    super.render();
    let { card } = this;
    card.expanded = lazy.recommendedThemesExpanded;
    card.addEventListener("toggle", this);
  }

  handleEvent(e) {
    if (e.type !== "toggle" || e.target !== this.card) {
      return;
    }
    Services.prefs.setBoolPref(
      RECOMMENDED_THEMES_EXPANDED,
      e.newState === "open"
    );
  }

  static get markup() {
    return `
      <template>
        <moz-card type="accordion"
                  data-l10n-id="recommended-themes-card-heading"
                  data-l10n-attrs="heading">
          <recommended-addon-list
            type="theme"
            hide-installed
          >
          </recommended-addon-list>
        </moz-card>
        <footer is="recommended-themes-footer" class="view-footer"></footer>
      </template>
    `;
  }
}
customElements.define("recommended-themes-section", RecommendedThemesSection);
