/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Manages updates for a IP Protection panelView in a given browser window.
 */
export class IPProtectionPanel {
  static HEADER_TAGNAME = "ipprotection-header";
  static CONTENT_TAGNAME = "ipprotection-content";
  static HEADER_ROOT_ELEMENT = "#PanelUI-ipprotection-header";
  static CONTENT_ROOT_ELEMENT = "#PanelUI-ipprotection-content";
  static CUSTOM_ELEMENTS_SCRIPT =
    "chrome://browser/content/ipprotection/ipprotection-customelements.js";

  static PANEL_ID = "PanelUI-ipprotection";
  static TITLE_L10N_ID = "ipprotection-title";

  // TODO: this is temporary URL. Update it once finalized (Bug 1972462).
  static HELP_PAGE_URL =
    "https://support.mozilla.org/en-US/products/firefox-private-network-vpn";
  /**
   * Loads the ipprotection custom element script
   * into a given window.
   *
   * Called on IPProtection.init for a new browser window.
   *
   * @param {Window} window
   */
  static loadCustomElements(window) {
    Services.scriptloader.loadSubScriptWithOptions(
      IPProtectionPanel.CUSTOM_ELEMENTS_SCRIPT,
      {
        target: window,
        async: true,
      }
    );
  }

  /**
   * @typedef {object} State
   * @property {boolean} isProtectionEnabled
   *  True if IP Protection via the proxy is enabled
   * @property {Date} protectionEnabledSince
   *  The timestamp in milliseconds since IP Protection was enabled
   * @property {boolean} isSignedIn
   *  True if signed in to account
   */

  /**
   * @type {State}
   */
  state = {};
  panel = null;
  header = null;

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

    // TODO: let proxy assign our starting values (Bug 1976021)
    this.state = {
      // TODO: Add logic for determining sign-in state once we have details about the proxy - Bug 1976094
      isSignedIn: true,
      isProtectionEnabled: false,
      protectionEnabledSince: null,
    };

    if (window) {
      IPProtectionPanel.loadCustomElements(window);
    }
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

  // TODO: actually connect to proxy, hardcode for now (Bug 1976021)
  #startProxy() {}

  // TODO: actually disconnect from proxy, hardcode for now (Bug 1976021)
  #stopProxy() {}

  showHelpPage() {
    let win = this.panel.ownerGlobal;
    if (win && !Cu.isInAutomation) {
      win.openWebLinkIn(IPProtectionPanel.HELP_PAGE_URL, "tab");
      this.close();
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
    if (!this.header) {
      this.#createHeader(panelView);
    }

    if (this.panel) {
      this.updateState();
    } else {
      this.#createPanel(panelView);
    }
  }

  /**
   * Called when the panel elements will be hidden.
   *
   * Disables updates to the panel.
   */
  hiding() {}

  /**
   * Creates a panel component in a panelView.
   *
   * @param {XULBrowserElement} panelView
   */
  #createPanel(panelView) {
    let { ownerDocument } = panelView;
    let contentRootEl = panelView.querySelector(
      IPProtectionPanel.CONTENT_ROOT_ELEMENT
    );

    let contentEl = ownerDocument.createElement(
      IPProtectionPanel.CONTENT_TAGNAME
    );
    this.panel = contentEl;

    this.#addPanelListeners(ownerDocument);

    contentRootEl.appendChild(contentEl);
  }

  /**
   * Creates the header for the panel component in the panelView.
   *
   * @param {XULBrowserElement} panelView
   *  The panelView element that the panel header is in.
   */
  #createHeader(panelView) {
    let headerRootEl = panelView.querySelector(
      IPProtectionPanel.HEADER_ROOT_ELEMENT
    );

    let headerEl = panelView.ownerDocument.createElement(
      IPProtectionPanel.HEADER_TAGNAME
    );
    headerEl.titleId = IPProtectionPanel.TITLE_L10N_ID;
    this.header = headerEl;

    headerRootEl.appendChild(headerEl);
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
   * Remove added elements and listeners.
   */
  destroy() {
    if (this.header) {
      this.header.remove();
      this.header = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.#removePanelListeners(this.panel.ownerDocument);
      this.panel = null;
    }
  }

  #addPanelListeners(doc) {
    doc.addEventListener("IPProtection:Init", this.handleEvent);
    doc.addEventListener("IPProtection:Close", this.handleEvent);
    doc.addEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.addEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.addEventListener("IPProtection:ShowHelpPage", this.handleEvent);
  }

  #removePanelListeners(doc) {
    doc.removeEventListener("IPProtection:Init", this.handleEvent);
    doc.removeEventListener("IPProtection:Close", this.handleEvent);
    doc.removeEventListener("IPProtection:UserEnable", this.handleEvent);
    doc.removeEventListener("IPProtection:UserDisable", this.handleEvent);
    doc.removeEventListener("IPProtection:ShowHelpPage", this.handleEvent);
  }

  #handleEvent(event) {
    if (event.type == "IPProtection:Init") {
      this.updateState();
    } else if (event.type == "IPProtection:Close") {
      this.close();
    } else if (event.type == "IPProtection:UserEnable") {
      this.#startProxy();
    } else if (event.type == "IPProtection:UserDisable") {
      this.#stopProxy();
    } else if (event.type == "IPProtection:ShowHelpPage") {
      this.showHelpPage();
    }
  }
}
