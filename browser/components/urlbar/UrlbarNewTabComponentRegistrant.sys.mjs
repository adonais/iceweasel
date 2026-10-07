/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  AboutNewTabComponentRegistry,
  BaseAboutNewTabComponentRegistrant,
} from "moz-src:///browser/components/newtab/AboutNewTabComponents.sys.mjs";
import { UrlbarPrefs } from "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs";

const FEATURE_GATE = "newtabFeatureGate";
const VARIANT_A = "newtabVariantA";
const VARIANT_B = "newtabVariantB";
const NOVA_PREF = "browser.nova.enabled";

/**
 * A registrant that adds `<moz-urlbar>` to about:newtab / about:home while the
 * urlbar's `newtabFeatureGate` Nimbus variable is enabled. It supersedes the
 * handoff search bar, which stands down for the same gate.
 */
export class UrlbarNewTabComponentRegistrant extends BaseAboutNewTabComponentRegistrant {
  constructor() {
    super();
    // Held weakly, so this instance must outlive the registration -- New Tab's
    // component registry keeps it alive.
    UrlbarPrefs.addObserver(this);
  }

  destroy() {
    UrlbarPrefs.removeObserver(this);
  }

  onNimbusChanged(variable) {
    if (
      variable == FEATURE_GATE ||
      variable == VARIANT_A ||
      variable == VARIANT_B
    ) {
      this.updated();
    }
  }

  onPrefChanged(pref) {
    if (pref == NOVA_PREF) {
      this.updated();
    }
  }

  getComponents() {
    if (!UrlbarPrefs.get(FEATURE_GATE)) {
      return [];
    }

    // The variants are branches of one experiment, so at most one applies.
    let variant = null;
    if (UrlbarPrefs.get(VARIANT_B)) {
      variant = "variant-b";
    } else if (UrlbarPrefs.get(VARIANT_A)) {
      variant = "variant-a";
    }

    return [
      {
        type: AboutNewTabComponentRegistry.TYPES.SEARCH,
        l10nURLs: [
          "browser/browser.ftl",
          "preview/enUS-searchFeatures.ftl",
          "toolkit/global/contextual-identity.ftl",
        ],
        stylesURLs: ["chrome://browser/skin/urlbar.css"],
        componentURL: "chrome://browser/content/urlbar/UrlbarInput.mjs",
        tagName: "moz-urlbar",
        attributes: {
          class: "urlbar",
          role: "group",
          pageproxystate: "invalid",
          "in-page": "",
          "sap-name": "newtab_searchbar",
          "unifiedsearchbutton-available": "",
          ...(variant ? { [variant]: "" } : {}),
        },
      },
    ];
  }
}
