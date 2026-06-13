/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  AddonManagerListenerHandler,
  getUpdateInstall,
  isManualUpdate,
  PREF_UI_LASTCATEGORY,
} from "../aboutaddons-utils.mjs";
import { gViewController } from "../view-controller.mjs";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

// Create the button-group element so it gets loaded.
document.createElement("button-group");
class CategoriesBox extends customElements.get("button-group") {
  constructor() {
    super();
    // This will resolve when the initial category states have been set from
    // our cached prefs. This is intended for use in testing to verify that we
    // are caching the previous state.
    this.promiseRendered = new Promise(resolve => {
      this._resolveRendered = resolve;
    });
  }

  handleEvent(e) {
    if (e.target == document && e.type == "view-selected") {
      const { type, param } = e.detail;
      this.select(`addons://${type}/${param}`);
      return;
    }

    if (e.target == this && e.type == "button-group:key-selected") {
      this.activeChild.load();
      return;
    }

    if (e.type == "click") {
      const button = e.target.closest("[viewid]");
      if (button) {
        button.load();
        return;
      }
    }

    // Forward the unhandled events to the button-group custom element.
    super.handleEvent(e);
  }

  disconnectedCallback() {
    document.removeEventListener("view-selected", this);
    this.removeEventListener("button-group:key-selected", this);
    this.removeEventListener("click", this);
    AddonManagerListenerHandler.removeListener(this);
    super.disconnectedCallback();
  }

  async initialize() {
    let hiddenTypes = new Set([]);

    for (let button of this.children) {
      let { defaultHidden, name } = button;
      button.hidden =
        !button.isVisible || (defaultHidden && this.shouldHideCategory(name));

      if (defaultHidden && AddonManager.hasAddonType(name)) {
        hiddenTypes.add(name);
      }
    }

    let hiddenUpdated;
    if (hiddenTypes.size) {
      hiddenUpdated = this.updateHiddenCategories(Array.from(hiddenTypes));
    }

    this.updateAvailableCount();

    document.addEventListener("view-selected", this);
    this.addEventListener("button-group:key-selected", this);
    this.addEventListener("click", this);
    AddonManagerListenerHandler.addListener(this);

    this._resolveRendered();
    await hiddenUpdated;
  }

  shouldHideCategory(name) {
    return Services.prefs.getBoolPref(`extensions.ui.${name}.hidden`, true);
  }

  setShouldHideCategory(name, hide) {
    Services.prefs.setBoolPref(`extensions.ui.${name}.hidden`, hide);
  }

  getButtonByName(name) {
    return this.querySelector(`[name="${name}"]`);
  }

  get selectedChild() {
    return this._selectedChild;
  }

  set selectedChild(node) {
    if (node && this.contains(node)) {
      if (this._selectedChild) {
        this._selectedChild.selected = false;
      }
      this._selectedChild = node;
      this._selectedChild.selected = true;
    }
  }

  select(viewId) {
    let button = this.querySelector(`[viewid="${viewId}"]`);
    if (button) {
      this.activeChild = button;
      this.selectedChild = button;
      button.hidden = false;
      Services.prefs.setStringPref(PREF_UI_LASTCATEGORY, viewId);
    }
  }

  selectType(type) {
    this.select(`addons://list/${type}`);
  }

  onInstalled(addon) {
    let button = this.getButtonByName(addon.type);
    if (button) {
      button.hidden = false;
      this.setShouldHideCategory(addon.type, false);
    }
    this.updateAvailableCount();
  }

  onInstallStarted(install) {
    this.onInstalled(install);
  }

  onNewInstall() {
    this.updateAvailableCount();
  }

  onInstallPostponed() {
    this.updateAvailableCount();
  }

  onInstallCancelled() {
    this.updateAvailableCount();
  }

  async updateAvailableCount() {
    // Note: This list includes new installs and updates, potentially multiple
    // for the same add-on (because they are not cleaned up - bug 2007749).
    let installs = await AddonManager.getAllInstalls();
    let addonIdsWithUpdate = new Set();
    for (const install of installs) {
      if (isManualUpdate(install) && install.existingAddon) {
        // Note: install.existingAddon points to the existing addon at the time
        // of the update check, which is not necessarily the current version.
        const addon = await AddonManager.getAddonByID(install.existingAddon.id);
        if (
          addon &&
          getUpdateInstall(addon) === install &&
          Services.vc.compare(install.version, addon.version) > 0
        ) {
          addonIdsWithUpdate.add(addon.id);
        }
      }
    }
    const count = addonIdsWithUpdate.size;
    let availableButton = this.getButtonByName("available-updates");
    availableButton.hidden = !availableButton.selected && count == 0;
    availableButton.badgeCount = count;
  }

  async updateHiddenCategories(types) {
    let hiddenTypes = new Set(types);
    let getAddons = AddonManager.getAddonsByTypes(types);
    let getInstalls = AddonManager.getInstallsByTypes(types);

    for (let addon of await getAddons) {
      if (addon.hidden) {
        continue;
      }

      this.onInstalled(addon);
      hiddenTypes.delete(addon.type);

      if (!hiddenTypes.size) {
        return;
      }
    }

    for (let install of await getInstalls) {
      if (
        install.existingAddon ||
        install.state == AddonManager.STATE_AVAILABLE
      ) {
        continue;
      }

      this.onInstalled(install);
      hiddenTypes.delete(install.type);

      if (!hiddenTypes.size) {
        return;
      }
    }

    for (let type of hiddenTypes) {
      let button = this.getButtonByName(type);
      if (button.selected) {
        // Cancel the load if this view should be hidden.
        gViewController.resetState();
      }
      this.setShouldHideCategory(type, true);
      button.hidden = true;
    }
  }
}
customElements.define("categories-box", CategoriesBox);
