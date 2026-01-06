/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { ERRORS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ASRouter: "resource:///modules/asrouter/ASRouter.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPPProxyStates: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  requestIdleCallback: "resource://gre/modules/Timer.sys.mjs",
  cancelIdleCallback: "resource://gre/modules/Timer.sys.mjs",
});

const FXA_WIDGET_ID = "fxa-toolbar-menu-button";
const EXT_WIDGET_ID = "unified-extensions-button";

/**
 * IPProtectionWidget is the class for the singleton IPProtection.
 *
 * It is a minimal manager for creating and removing a CustomizableUI widget
 * for IP protection features.
 *
 * It maintains the state of the panels and updates them when the
 * panel is shown or hidden.
 */
class IPProtectionWidget {
  static WIDGET_ID = "ipprotection-button";
  static PANEL_ID = "PanelUI-ipprotection";

  static ENABLED_PREF = "browser.ipProtection.enabled";
  static VARIANT_PREF = "browser.ipProtection.variant";
  static ADDED_PREF = "browser.ipProtection.added";

  #inited = false;
  created = false;
  #panels = new WeakMap();

  constructor() {
    this.sendReadyTrigger = this.#sendReadyTrigger.bind(this);
    this.handleEvent = this.#handleEvent.bind(this);
  }

  /**
   * Creates the widget.
   */
  init() {
    if (this.#inited) {
      return;
    }
    this.#inited = true;

    if (!this.created) {
      this.#createWidget();
    }

    lazy.CustomizableUI.addListener(this);
  }

  /**
   * Destroys the widget and prevents any updates.
   */
  uninit() {
    if (!this.#inited) {
      return;
    }
    this.#destroyWidget();
    this.#uninitPanels();

    lazy.CustomizableUI.removeListener(this);

    this.#inited = false;
  }

  /**
   * Returns the initialization status
   */
  get isInitialized() {
    return this.#inited;
  }

  /**
   * Updates the toolbar icon to reflect the VPN connection status
   *
   * @param {XULElement} toolbaritem - toolbaritem to update
   * @param {object} status - VPN connection status
   */
  updateIconStatus(toolbaritem, status = { isActive: false, isError: false }) {
    let isActive = status.isActive;
    let isError = status.isError;
    let l10nId = isError ? "ipprotection-button-error" : "ipprotection-button";

    if (isError) {
      toolbaritem.classList.remove("ipprotection-on");
      toolbaritem.classList.add("ipprotection-error");
    } else if (isActive) {
      toolbaritem.classList.remove("ipprotection-error");
      toolbaritem.classList.add("ipprotection-on");
    } else {
      toolbaritem.classList.remove("ipprotection-error");
      toolbaritem.classList.remove("ipprotection-on");
    }

    toolbaritem.setAttribute("data-l10n-id", l10nId);
  }

  /**
   * Creates the CustomizableUI widget.
   */
  #createWidget() {
    const onViewShowing = this.#onViewShowing.bind(this);
    const onViewHiding = this.#onViewHiding.bind(this);
    const onBeforeCreated = this.#onBeforeCreated.bind(this);
    const onCreated = this.#onCreated.bind(this);
    const onDestroyed = this.#onDestroyed.bind(this);
    const item = {
      id: IPProtectionWidget.WIDGET_ID,
      l10nId: "ipprotection-button",
      type: "view",
      viewId: IPProtectionWidget.PANEL_ID,
      onViewShowing,
      onViewHiding,
      onBeforeCreated,
      onCreated,
      onDestroyed,
    };
    lazy.CustomizableUI.createWidget(item);

    this.#placeWidget();

    this.created = true;
  }

  /**
   * Places the widget in the nav bar, next to the FxA widget.
   */
  #placeWidget() {
    let wasAddedToToolbar = Services.prefs.getBoolPref(
      IPProtectionWidget.ADDED_PREF,
      false
    );
    let alreadyPlaced = lazy.CustomizableUI.getPlacementOfWidget(
      IPProtectionWidget.WIDGET_ID,
      false,
      true
    );
    if (wasAddedToToolbar || alreadyPlaced) {
      return;
    }

    let prevWidget =
      lazy.CustomizableUI.getPlacementOfWidget(FXA_WIDGET_ID) ||
      lazy.CustomizableUI.getPlacementOfWidget(EXT_WIDGET_ID);
    let pos = prevWidget ? prevWidget.position - 1 : null;

    lazy.CustomizableUI.addWidgetToArea(
      IPProtectionWidget.WIDGET_ID,
      lazy.CustomizableUI.AREA_NAVBAR,
      pos
    );
    Services.prefs.setBoolPref(IPProtectionWidget.ADDED_PREF, true);
  }

  /**
   * Destroys the widget if it has been created.
   *
   * This will not remove the pref listeners, so the widget
   * can be recreated later.
   */
  #destroyWidget() {
    if (!this.created) {
      return;
    }
    this.#destroyPanels();
    lazy.CustomizableUI.destroyWidget(IPProtectionWidget.WIDGET_ID);
    this.created = false;
    if (this.readyTriggerIdleCallback) {
      lazy.cancelIdleCallback(this.readyTriggerIdleCallback);
    }
  }

  /**
   * Get the IPProtectionPanel for q given window.
   *
   * @param {Window} window - which window to get the panel for.
   * @returns {IPProtectionPanel}
   */
  getPanel(window) {
    if (!this.created || !window?.PanelUI) {
      return null;
    }

    return this.#panels.get(window);
  }

  /**
   * Remove all panels content, but maintains state for if the widget is
   * re-enabled in the same window.
   *
   * Panels will only be removed from the WeakMap if their window is closed.
   */
  #destroyPanels() {
    let panels = ChromeUtils.nondeterministicGetWeakMapKeys(this.#panels);
    for (let panel of panels) {
      this.#panels.get(panel).destroy();
    }
  }

  /**
   * Uninit all panels and clear the WeakMap.
   */
  #uninitPanels() {
    let panels = ChromeUtils.nondeterministicGetWeakMapKeys(this.#panels);
    for (let panel of panels) {
      this.#panels.get(panel).uninit();
    }
    this.#panels = new WeakMap();
  }

  /**
   * Updates the state of the panel before it is shown.
   *
   * @param {Event} event - the panel shown.
   */
  #onViewShowing(event) {
    let { ownerGlobal } = event.target;
    if (this.#panels.has(ownerGlobal)) {
      let panel = this.#panels.get(ownerGlobal);
      panel.showing(event.target);
    }
  }

  /**
   * Updates the panels visibility.
   *
   * @param {Event} event - the panel hidden.
   */
  #onViewHiding(event) {
    let { ownerGlobal } = event.target;
    if (this.#panels.has(ownerGlobal)) {
      let panel = this.#panels.get(ownerGlobal);
      panel.hiding();
    }
  }

  /**
   * Creates a new IPProtectionPanel for a browser window.
   *
   * @param {Document} doc - the document containing the panel.
   */
  #onBeforeCreated(doc) {
    let { ownerGlobal } = doc;
    if (ownerGlobal && !this.#panels.has(ownerGlobal)) {
      let panel = new lazy.IPProtectionPanel(ownerGlobal, this.variant);
      this.#panels.set(ownerGlobal, panel);
    }
  }

  /**
   * Gets the toolbaritem after the widget has been created and
   * adds content to the panel.
   *
   * @param {XULElement} toolbaritem - the widget toolbaritem.
   */
  #onCreated(toolbaritem) {
    let isActive = lazy.IPPProxyManager.state === lazy.IPPProxyStates.ACTIVE;
    let isError =
      lazy.IPPProxyManager.state === lazy.IPPProxyStates.ERROR &&
      lazy.IPPProxyManager.errors.includes(ERRORS.GENERIC);
    this.updateIconStatus(toolbaritem, {
      isActive,
      isError,
    });

    this.readyTriggerIdleCallback = lazy.requestIdleCallback(
      this.sendReadyTrigger
    );

    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
    lazy.IPPProxyManager.addEventListener(
      "IPPProxyManager:StateChanged",
      this.handleEvent
    );
  }

  #onDestroyed() {
    lazy.IPPProxyManager.removeEventListener(
      "IPPProxyManager:StateChanged",
      this.handleEvent
    );
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  async onWidgetRemoved(widgetId) {
    if (widgetId != IPProtectionWidget.WIDGET_ID) {
      return;
    }

    // Shut down VPN connection when widget is removed,
    // but wait to check if it has been moved.
    await Promise.resolve();
    let moved = !!lazy.CustomizableUI.getPlacementOfWidget(widgetId);
    if (!moved) {
      lazy.IPPProxyManager.stop();
    }
  }

  async #sendReadyTrigger() {
    await lazy.ASRouter.waitForInitialized;
    const win = Services.wm.getMostRecentBrowserWindow();
    const browser = win?.gBrowser?.selectedBrowser;
    await lazy.ASRouter.sendTriggerMessage({
      browser,
      id: "ipProtectionReady",
    });
  }

  #handleEvent(event) {
    if (
      event.type == "IPProtectionService:StateChanged" ||
      event.type == "IPPProxyManager:StateChanged"
    ) {
      if (
        lazy.IPProtectionService.state === lazy.IPProtectionStates.OPTED_OUT
      ) {
        lazy.CustomizableUI.removeWidgetFromArea(IPProtectionWidget.WIDGET_ID);
        return;
      }

      let status = {
        isActive: lazy.IPPProxyManager.state === lazy.IPPProxyStates.ACTIVE,
        isError:
          lazy.IPPProxyManager.state === lazy.IPPProxyStates.ERROR &&
          lazy.IPPProxyManager.errors.includes(ERRORS.GENERIC),
      };

      let widget = lazy.CustomizableUI.getWidget(IPProtectionWidget.WIDGET_ID);
      let windows = ChromeUtils.nondeterministicGetWeakMapKeys(this.#panels);
      for (let win of windows) {
        let toolbaritem = widget.forWindow(win).node;
        this.updateIconStatus(toolbaritem, status);
      }
    }
  }
}

const IPProtection = new IPProtectionWidget();

XPCOMUtils.defineLazyPreferenceGetter(
  IPProtection,
  "variant",
  IPProtectionWidget.VARIANT_PREF,
  ""
);

export { IPProtection, IPProtectionWidget };
