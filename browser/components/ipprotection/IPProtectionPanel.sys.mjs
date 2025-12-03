/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  IPPEnrollAndEntitleManager:
    "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtection: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
});

import {
  LINKS,
  ERRORS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

let hasCustomElements = new WeakSet();

/**
 * Manages updates for a IP Protection panelView in a given browser window.
 */
export class IPProtectionPanel {
  static CONTENT_TAGNAME = "ipprotection-content";
  static CUSTOM_ELEMENTS_SCRIPT =
    "chrome://browser/content/ipprotection/ipprotection-customelements.js";
  static WIDGET_ID = "ipprotection-button";
  static PANEL_ID = "PanelUI-ipprotection";
  static TITLE_L10N_ID = "ipprotection-title";
  static HEADER_AREA_ID = "PanelUI-ipprotection-header";
  static CONTENT_AREA_ID = "PanelUI-ipprotection-content";
  static HEADER_BUTTON_ID = "ipprotection-header-button";

  /**
   * Loads the ipprotection custom element script
   * into a given window.
   *
   * Called on IPProtection.init for a new browser window.
   *
   * @param {Window} window
   */
  static loadCustomElements(window) {
    if (hasCustomElements.has(window)) {
      // Don't add the elements again for the same window.
      return;
    }
    Services.scriptloader.loadSubScriptWithOptions(
      IPProtectionPanel.CUSTOM_ELEMENTS_SCRIPT,
      {
        target: window,
        async: true,
      }
    );
    hasCustomElements.add(window);
  }

  /**
   * @typedef {object} State
   * @property {boolean} isProtectionEnabled
   *  True if IP Protection via the proxy is enabled
   * @property {Date} protectionEnabledSince
   *  The timestamp in milliseconds since IP Protection was enabled
   * @property {boolean} isSignedOut
   *  True if not signed in to account
   * @property {object} location
   *  Data about the server location the proxy is connected to
   * @property {string} location.name
   *  The location country name
   * @property {string} location.code
   *  The location country code
   * @property {"generic" | ""} error
   *  The error type as a string if an error occurred, or empty string if there are no errors.
   * @property {boolean} isAlpha
   *  True if we're running the Alpha variant, else false.
   * @property {boolean} hasUpgraded
   *  True if a Mozilla VPN subscription is linked to the user's Mozilla account.
   */

  /**
   * @type {State}
   */
  state = {};
  panel = null;
  initiatedUpgrade = false;

  /**
   * Check the state of the enclosing panel to see if
   * it is active (open or showing).
   */
  get active() {
    let panelParent = this.panel?.closest("panel");
    if (!panelParent) {
      return false;
    }
    return panelParent.state == "open" || panelParent.state == "showing";
  }

  /**
   * Creates an instance of IPProtectionPanel for a specific browser window.
   *
   * Inserts the panel component customElements registry script.
   *
   * @param {Window} window
   *   Window containing the panelView to manage.
   */
  constructor(window) {
    this.handleEvent = this.#handleEvent.bind(this);

    let { activatedAt: protectionEnabledSince } = lazy.IPProtectionService;

    this.state = {
      isSignedOut: !lazy.IPPSignInWatcher.isSignedIn,
      isProtectionEnabled: !!protectionEnabledSince,
      protectionEnabledSince,
      location: {
        name: "United States",
        code: "us",
      },
      error: "",
      isAlpha: lazy.IPPEnrollAndEntitleManager.isAlpha,
      hasUpgraded: lazy.IPPEnrollAndEntitleManager.hasUpgraded,
    };

    if (window) {
      IPProtectionPanel.loadCustomElements(window);
    }

    this.#addProxyListeners();
  }

  /**
   * Set the state for this panel.
   *
   * Updates the current panel component state,
   * if the panel is currently active (showing or not hiding).
   *
   * @example
   * panel.setState({
   *  isSomething: true,
   * });
   *
   * @param {object} state
   *    The state object from IPProtectionPanel.
   */
  setState(state) {
    Object.assign(this.state, state);

    if (this.active) {
      this.updateState();
    }
  }

  /**
   * Updates the state of the panel component.
   *
   * @param {object} state
   *   The state object from IPProtectionPanel.
   * @param {Element} panelEl
   *   The panelEl element to update the state on.
   */
  updateState(state = this.state, panelEl = this.panel) {
    if (!panelEl?.isConnected || !panelEl.state) {
      return;
    }

    panelEl.state = state;
    panelEl.requestUpdate();
  }

  #startProxy() {
    lazy.IPProtectionService.start();
  }

  #stopProxy() {
    lazy.IPProtectionService.stop();
  }

  /**
   * Opens the help page in a new tab and closes the panel.
   *
   * @param {Event} e
   */
  static showHelpPage(e) {
    let win = e.target?.ownerGlobal;
    if (win && !Cu.isInAutomation) {
      win.openWebLinkIn(LINKS.SUPPORT_URL, "tab");
    }

    let panelParent = e.target?.closest("panel");
    if (panelParent) {
      panelParent.hidePopup();
    }
  }

  /**
   * Updates the visibility of the panel components before they will shown.
   *
   * - If the panel component has already been created, updates the state.
   * - Creates a panel component if need, state will be updated on once it has
   *   been connected.
   *
   * @param {XULElement} panelView
   *   The panelView element from the CustomizableUI widget callback.
   */
  showing(panelView) {
    if (this.initiatedUpgrade) {
      lazy.IPPEnrollAndEntitleManager.refetchEntitlement();
      this.initiatedUpgrade = false;
    }

    if (this.panel) {
      this.updateState();
    } else {
      this.#createPanel(panelView);
    }

    // TODO: Stop counting after all onboarding messages have been shown - Bug 1997332
    let currentCount = Services.prefs.getIntPref(
      "browser.ipProtection.panelOpenCount"
    );
    let updatedCount = currentCount + 1;
    Services.prefs.setIntPref(
      "browser.ipProtection.panelOpenCount",
      updatedCount
    );
  }

  /**
   * Called when the panel elements will be hidden.
   *
   * Disables updates to the panel.
   */
  hiding() {
    this.destroy();
  }

  #createPanel(panelView) {
    let { ownerDocument } = panelView;

    let headerArea = panelView.querySelector(
      `#${IPProtectionPanel.HEADER_AREA_ID}`
    );
    let headerButton = headerArea.querySelector(
      `#${IPProtectionPanel.HEADER_BUTTON_ID}`
    );
    if (!headerButton) {
      headerButton = this.#createHeaderButton(ownerDocument);
      headerArea.appendChild(headerButton);
    }
    // Reset the tab index to ensure it is focusable.
    headerButton.setAttribute("tabindex", "0");

    let contentEl = ownerDocument.createElement(
      IPProtectionPanel.CONTENT_TAGNAME
    );
    this.panel = contentEl;

    contentEl.dataset.capturesFocus = "true";

    this.#addPanelListeners(ownerDocument);

    let contentArea = panelView.querySelector(
      `#${IPProtectionPanel.CONTENT_AREA_ID}`
    );
    contentArea.appendChild(contentEl);
  }

  #createHeaderButton(ownerDocument) {
    const headerButton = ownerDocument.createXULElement("toolbarbutton");

    headerButton.id = IPProtectionPanel.HEADER_BUTTON_ID;
    headerButton.className = "panel-info-button";
    headerButton.dataset.capturesFocus = "true";

    ownerDocument.l10n.setAttributes(headerButton, "ipprotection-help-button");
    headerButton.addEventListener("click", IPProtectionPanel.showHelpPage);
    return headerButton;
  }

  /**
   * Open the IP Protection panel in the given window.
   *
   * @param {Window} window - which window to open the panel in.
   * @returns {Promise<void>}
   */
  async open(window) {
    if (!lazy.IPProtection.created || !window?.PanelUI) {
      return;
    }

    let widget = lazy.CustomizableUI.getWidget(IPProtectionPanel.WIDGET_ID);
    let anchor = widget.forWindow(window).anchor;
    await window.PanelUI.showSubView(IPProtectionPanel.PANEL_ID, anchor);
  }

  /**
   * Close the containing panel popup.
   */
  close() {
    let panelParent = this.panel?.closest("panel");
    if (!panelParent) {
      return;
    }
    panelParent.hidePopup();
  }

  /**
   * Start flow for signing in and then opening the panel on success
   */
  async startLoginFlow() {
    let window = this.panel.ownerGlobal;
    let browser = window.gBrowser;
    this.close();
    let isSignedIn = await lazy.IPProtectionService.startLoginFlow(browser);
    if (isSignedIn) {
      await this.open(window);
    }
  }

  /**
   * Remove added elements and listeners.
   */
  destroy() {
    if (this.panel) {
      this.panel.remove();
      this.#removePanelListeners(this.panel.ownerDocument);
      this.panel = null;
      if (this.state.error) {
        this.setState({
          error: "",
        });
      }
    }
  }

  uninit() {
    this.destroy();
    this.#removeProxyListeners();
  }

  #addPanelListeners(doc) {
    doc.addEventListener("IPProtection:Init", this.handleEvent);
    doc.addEventListener("IPProtection:ClickUpgrade", this.handleEvent);
    doc.addEventListener("IPProtection:Close", this.handleEvent);
    doc.addEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.addEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.addEventListener("IPProtection:SignIn", this.handleEvent);
    doc.addEventListener("IPProtection:UserShowSiteSettings", this.handleEvent);
  }

  #removePanelListeners(doc) {
    doc.removeEventListener("IPProtection:Init", this.handleEvent);
    doc.removeEventListener("IPProtection:ClickUpgrade", this.handleEvent);
    doc.removeEventListener("IPProtection:Close", this.handleEvent);
    doc.removeEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.removeEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.removeEventListener("IPProtection:SignIn", this.handleEvent);
    doc.removeEventListener(
      "IPProtection:UserShowSiteSettings",
      this.handleEvent
    );
  }

  #addProxyListeners() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
    lazy.IPPEnrollAndEntitleManager.addEventListener(
      "IPPEnrollAndEntitleManager:StateChanged",
      this.handleEvent
    );
  }

  #removeProxyListeners() {
    lazy.IPPEnrollAndEntitleManager.removeEventListener(
      "IPPEnrollAndEntitleManager:StateChanged",
      this.handleEvent
    );
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  #handleEvent(event) {
    if (event.type == "IPProtection:Init") {
      this.updateState();
    } else if (event.type == "IPProtection:Close") {
      this.close();
    } else if (event.type == "IPProtection:UserEnable") {
      this.#startProxy();
      Services.prefs.setBoolPref("browser.ipProtection.userEnabled", true);
    } else if (event.type == "IPProtection:UserDisable") {
      this.#stopProxy();
      Services.prefs.setBoolPref("browser.ipProtection.userEnabled", false);
    } else if (event.type == "IPProtection:ClickUpgrade") {
      // Let the service know that we tried upgrading at least once
      this.initiatedUpgrade = true;
      this.close();
    } else if (event.type == "IPProtection:SignIn") {
      this.startLoginFlow();
    } else if (
      event.type == "IPProtectionService:StateChanged" ||
      event.type === "IPPEnrollAndEntitleManager:StateChanged"
    ) {
      let { state, activatedAt: protectionEnabledSince } =
        lazy.IPProtectionService;
      let hasError =
        state === lazy.IPProtectionStates.ERROR &&
        lazy.IPProtectionService.errors.includes(ERRORS.GENERIC);

      this.setState({
        isSignedOut: !lazy.IPPSignInWatcher.isSignedIn,
        isProtectionEnabled: !!protectionEnabledSince,
        protectionEnabledSince,
        hasUpgraded: lazy.IPPEnrollAndEntitleManager.hasUpgraded,
        error: hasError ? ERRORS.GENERIC : "",
      });
    } else if (event.type == "IPProtection:UserShowSiteSettings") {
      // TODO: show subview for site settings (Bug 1997413)
    }
  }
}
