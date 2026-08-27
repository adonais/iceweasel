/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-promo.mjs";

window.MozXULElement?.insertFTLIfNeeded("browser/appmenu.ftl");

const UI_STATE_UPDATE = "sync-ui-state:update";
const DEVICE_LIST_UPDATED = "fxaccounts:devicelist_updated";

const PROMO_CONFIG = {
  history: {
    entryPoint: "remote-tabs-app-menu-history",
    variants: {
      signin: {
        heading: "appmenu-sync-promo-signin",
        cta: "appmenu-sync-promo-signin-cta",
        image: "chrome://browser/skin/fxa/sync-promo-signin.svg",
      },
      turnonsync: {
        heading: "appmenu-sync-promo-turnonsync",
        cta: "appmenu-sync-promo-turnonsync-cta",
        image: "chrome://browser/skin/fxa/sync-promo-turnonsync.svg",
      },
      connectdevice: {
        heading: "appmenu-sync-promo-connectdevice",
        cta: "appmenu-sync-promo-connectdevice-cta",
        image: "chrome://browser/skin/fxa/sync-promo-connectdevice.svg",
      },
    },
  },
  bookmarks: {
    entryPoint: "bookmarks-app-menu",
    variants: {
      signin: {
        heading: "appmenu-sync-promo-signin",
        cta: "appmenu-sync-promo-signin-cta",
        image: "chrome://browser/skin/fxa/sync-promo-bookmarks.svg",
      },
      turnonsync: {
        heading: "appmenu-bookmarks-sync-promo-turnonsync",
        cta: "appmenu-sync-promo-turnonsync-cta",
        image: "chrome://browser/skin/fxa/sync-promo-bookmarks.svg",
      },
      connectdevice: {
        heading: "appmenu-bookmarks-sync-promo-connectdevice",
        cta: "appmenu-sync-promo-connectdevice-cta",
        image: "chrome://browser/skin/fxa/sync-promo-bookmarks.svg",
      },
    },
  },
};

/**
 * A dismissible, state-aware Sync promo for use inside app menu panelviews.
 * The shown variant (heading, CTA and destination) is derived from the user's
 * current account and Sync state via gSync.getSyncPromoState(), and the promo
 * re-evaluates itself as that state changes. Each variant can be permanently
 * dismissed independently of the others.
 *
 * @tagname sync-promo
 * @property {string} promoType - The surface key into PROMO_CONFIG, e.g. "history".
 */
export default class SyncPromo extends MozLitElement {
  static properties = {
    promoType: { type: String, reflect: true, attribute: "promo-type" },
    _promoState: { type: String, state: true },
  };

  constructor() {
    super();
    this.promoType = "history";
    this._promoState = null;
    this.disconnectedCallback = this.disconnectedCallback.bind(this);
  }

  #panelview = null;
  #onViewShowing = () => this.#refresh();
  // A DOM element can't be coerced to nsIObserver, so observe through a plain
  // helper object.
  #observer = { observe: () => this.#refresh() };

  get #dismissedPrefBranch() {
    return `browser.promo.syncPromo.${this.promoType}.`;
  }

  connectedCallback() {
    super.connectedCallback();
    Services.obs.addObserver(this.#observer, UI_STATE_UPDATE);
    Services.obs.addObserver(this.#observer, DEVICE_LIST_UPDATED);
    Services.prefs.addObserver(this.#dismissedPrefBranch, this.#observer);

    window.addEventListener("unload", this.disconnectedCallback, {
      once: true,
    });
    // Backstop for anything the observers above don't cover.
    this.#panelview = this.closest("panelview");
    this.#panelview?.addEventListener("ViewShowing", this.#onViewShowing);
    this.#refresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("unload", this.disconnectedCallback);
    Services.obs.removeObserver(this.#observer, UI_STATE_UPDATE);
    Services.obs.removeObserver(this.#observer, DEVICE_LIST_UPDATED);
    Services.prefs.removeObserver(this.#dismissedPrefBranch, this.#observer);
    this.#panelview?.removeEventListener("ViewShowing", this.#onViewShowing);
    this.#panelview = null;
  }

  get #config() {
    return PROMO_CONFIG[this.promoType];
  }

  #dismissedPref(state) {
    return `${this.#dismissedPrefBranch}${state}.dismissed`;
  }

  #refresh() {
    let state = window.gSync?.getSyncPromoState();
    if (
      state &&
      Services.prefs.getBoolPref(this.#dismissedPref(state), false)
    ) {
      state = null;
    }
    this._promoState = state;
    this.hidden = !state;
  }

  #onDismiss = event => {
    event.preventDefault();
    Services.prefs.setBoolPref(this.#dismissedPref(this._promoState), true);
    this.#refresh();
  };

  #onCta = event => {
    event.preventDefault();
    window.gSync.handleSyncPromoAction(
      this._promoState,
      this.#config.entryPoint
    );
    // The History view is shown in the app menu
    // but also in a standalone panel when its widget sits in the toolbar.
    window.CustomizableUI.hidePanelForNode(this);
  };

  render() {
    if (!this._promoState) {
      return nothing;
    }
    let variant = this.#config.variants[this._promoState];
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/customizableui/sync-promo.css"
      />
      <moz-promo
        type="vibrant"
        dismissable
        imagesrc=${variant.image}
        imagealignment="start"
        imagedisplay="padded"
        data-l10n-id=${variant.heading}
        data-l10n-attrs="heading"
        @promo:user-dismissed=${this.#onDismiss}
      >
        <a
          slot="support-link"
          href="#"
          data-l10n-id=${variant.cta}
          @click=${this.#onCta}
        ></a>
      </moz-promo>
    `;
  }
}
customElements.define("sync-promo", SyncPromo);
