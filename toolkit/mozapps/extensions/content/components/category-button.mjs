/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gViewController } from "../view-controller.mjs";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

export class CategoryButton extends HTMLButtonElement {
  connectedCallback() {
    if (this.childElementCount != 0) {
      return;
    }

    // Make sure the aria-selected attribute is set correctly.
    this.selected = this.hasAttribute("selected");

    document.l10n.setAttributes(this, `addon-category-${this.name}-title`);

    let text = document.createElement("span");
    text.classList.add("category-name");
    document.l10n.setAttributes(text, `addon-category-${this.name}`);

    this.append(text);
  }

  load() {
    gViewController.loadView(this.viewId);
  }

  get isVisible() {
    // Make a category button visible only if the related addon type is
    // supported by the AddonManager Providers actually registered to
    // the AddonManager.
    return AddonManager.hasAddonType(this.name);
  }

  get badgeCount() {
    return parseInt(this.getAttribute("badge-count"), 10) || 0;
  }

  set badgeCount(val) {
    let count = parseInt(val, 10);
    if (count) {
      this.setAttribute("badge-count", count);
    } else {
      this.removeAttribute("badge-count");
    }
  }

  get selected() {
    return this.hasAttribute("selected");
  }

  set selected(val) {
    this.toggleAttribute("selected", !!val);
    this.setAttribute("aria-selected", !!val);
  }

  get name() {
    return this.getAttribute("name");
  }

  get viewId() {
    return this.getAttribute("viewid");
  }

  // Just setting the hidden attribute isn't enough in case the category gets
  // hidden while about:addons is closed since it could be the last active view
  // which will unhide the button when it gets selected.
  get defaultHidden() {
    return this.hasAttribute("default-hidden");
  }
}
customElements.define("category-button", CategoryButton, { extends: "button" });
