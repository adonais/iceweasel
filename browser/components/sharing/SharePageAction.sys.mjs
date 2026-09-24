/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PanelMultiView:
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
  SharingUtils: "moz-src:///browser/components/sharing/SharingUtils.sys.mjs",
});

const ENABLED_PREF = "browser.urlbar.share-button.enabled";
const BUTTON_ID = "share-button";
const PANEL_ID = "share-panel";
const TEMPLATE_ID = "template-share-panel";
const COPY_LINK_BUTTON_ID = "share-panel-copy-link";
const OS_SHARE_BUTTON_ID = "share-panel-os-share";
const MAIL_SHARE_BUTTON_ID = "share-panel-mail";
const SCREENSHOTS_BUTTON_ID = "share-panel-screenshot";
const QR_CODE_BUTTON_ID = "share-panel-qr-code";
const DEVICE_SHARE_BUTTON_ID = "share-panel-send-to-device";
const CONNECT_DEVICE_BUTTON_ID = "share-panel-connect-device";
const DEVICE_HELP_BUTTON_ID = "share-panel-device-help";

function shouldButtonBeVisible(buttonId, isShareable) {
  switch (buttonId) {
    case SCREENSHOTS_BUTTON_ID: {
      return true;
    }
    case OS_SHARE_BUTTON_ID: {
      if (AppConstants.platform === "macosx") {
        // Bug 2058695: Make this visible onces bug 2009747 lands.
        return false;
      }
      return AppConstants.platform !== "linux" && isShareable;
    }
    case MAIL_SHARE_BUTTON_ID: {
      return AppConstants.platform === "linux" && isShareable;
    }
    case COPY_LINK_BUTTON_ID:
    case QR_CODE_BUTTON_ID:
    case DEVICE_SHARE_BUTTON_ID: {
      return isShareable;
    }
  }

  return false;
}

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "SHARE_BUTTON_ENABLED",
  ENABLED_PREF,
  false,
  () => {
    SharePageAction.updateGlobalButtonVisibility();
  }
);

/**
 * Manages the share panel anchored to the share button in the URL bar. The
 * panel markup lives in browser/components/sharing/content/sharePanel.inc.xhtml
 * and is only instantiated the first time the panel is opened.
 */
class SharePageActionClass {
  #windowToAction = new WeakMap();
  #openedByKeyboard = false;

  /**
   * Sets up the share button for a browser window. Called for every window at
   * delayed startup through the browser-window-delayed-startup category.
   *
   * @param {DOMWindow} window
   *   The browser window.
   */
  init(window) {
    if (!window.toolbar.visible) {
      // Popup windows don't get page actions.
      return;
    }

    this.updateButtonVisibility(window);

    let button = window.document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    button.addEventListener("click", this, true);
    button.addEventListener("keydown", this, true);
  }

  updateGlobalButtonVisibility() {
    for (let window of Services.wm.getEnumerator("navigator:browser")) {
      this.updateButtonVisibility(window);
    }
  }

  updateButtonVisibility(window) {
    let button = window.document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    button.hidden = !lazy.SHARE_BUTTON_ENABLED;
  }

  handleEvent(event) {
    switch (event.type) {
      case "click": {
        this.togglePanel(event);
        break;
      }
      case "keydown":
        this.handleKeydown(event);
        break;
      case "command": {
        this.handleCommand(event);
        break;
      }
      case "popupshowing": {
        this.handlePopupShowing(event);
        break;
      }
      case "popuphidden": {
        this.#openedByKeyboard = false;
        this.#recordActions(event.target.documentGlobal);
        this.#setButtonExpanded(event.target, false);
        break;
      }
    }
  }

  handleKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      this.#openedByKeyboard = true;
    }
  }

  handleCommand(event) {
    let panel = event.currentTarget;
    let hintL10nId;

    if (event.target.classList.contains("share-panel-device")) {
      this.#saveAction(event.target.documentGlobal, "send-to-device");

      lazy.SharingUtils.sendToDevice(panel, event.target.deviceId);
      lazy.PanelMultiView.hidePopup(panel);
      return;
    }

    let action = event.target.id.replace("share-panel-", "");

    switch (event.target.id) {
      case COPY_LINK_BUTTON_ID: {
        hintL10nId = this.#copyLink(panel);
        break;
      }
      case SCREENSHOTS_BUTTON_ID: {
        Services.obs.notifyObservers(
          event.target.documentGlobal,
          "menuitem-screenshot",
          "SharePanel"
        );
        break;
      }
      case QR_CODE_BUTTON_ID: {
        this.#showQRCode(panel);
        break;
      }
      case OS_SHARE_BUTTON_ID: {
        this.#handleOsShare(panel);
        break;
      }
      case MAIL_SHARE_BUTTON_ID: {
        lazy.SharingUtils.sendEmail(panel);
        break;
      }
      case DEVICE_SHARE_BUTTON_ID: {
        if (this.#showDeviceView(panel, event)) {
          return;
        }
        action = "connect-or-sign-in";
        break;
      }
      case CONNECT_DEVICE_BUTTON_ID: {
        lazy.SharingUtils.openPairingFlow(event.target.documentGlobal);
        break;
      }
      case DEVICE_HELP_BUTTON_ID: {
        event.target.documentGlobal.gSync.openSendTabHelp();
        break;
      }
      default: {
        return;
      }
    }

    this.#saveAction(event.target.documentGlobal, action);

    if (hintL10nId) {
      this.#showConfirmationHint(panel, hintL10nId);
    }

    lazy.PanelMultiView.hidePopup(panel);
  }

  /**
   * Copies the current page URL to the clipboard.
   *
   * @param {Element} panel
   * @returns {string|null} The l10n id of the confirmation hint to show, or
   *   null if nothing was copied.
   */
  #copyLink(panel) {
    if (!lazy.SharingUtils.getLinkToShare(panel).urlToShare) {
      return null;
    }

    lazy.SharingUtils.copyLink(panel);

    return "confirmation-hint-link-copied";
  }

  /**
   * Open the QR code panel for a given url
   *
   * @param {Element} panel The share panel
   */
  #showQRCode(panel) {
    let { urlToShare } = lazy.SharingUtils.getLinkToShare(panel);
    if (!urlToShare) {
      return;
    }

    let window = panel.documentGlobal;
    let browser = panel.contextBrowserToShare?.get();

    lazy.SharingUtils.showQRCodePanel(window, browser, urlToShare);
  }

  #handleOsShare(panel) {
    if (AppConstants.platform === "win") {
      lazy.SharingUtils.shareOnWindows(panel);
    }
  }

  /**
   * Shows a confirmation hint on the share button once the panel has closed.
   *
   * @param {Element} panel
   * @param {string} l10nId
   */
  #showConfirmationHint(panel, l10nId) {
    let window = panel.documentGlobal;
    let button = window.document.getElementById(BUTTON_ID);
    panel.addEventListener(
      "popuphidden",
      () => {
        window.ConfirmationHint.show(button, l10nId);
      },
      { once: true }
    );
  }

  handlePopupShowing(event) {
    const panel = event.target;
    let isShareable = !!lazy.SharingUtils.getLinkToShare(panel).urlToShare;

    for (let button of panel.querySelectorAll(
      "#share-panel-mainView toolbarbutton"
    )) {
      button.hidden = !shouldButtonBeVisible(button.id, isShareable);
    }

    this.#startActions(panel.documentGlobal, isShareable);

    if (this.#openedByKeyboard) {
      let mainView = panel.querySelector("#share-panel-mainView");
      lazy.PanelMultiView.forNode(mainView).focusWhenActive = true;
    }

    this.#setButtonExpanded(panel, true);
  }

  #setButtonExpanded(panel, expanded) {
    let button = panel.documentGlobal?.document.getElementById(BUTTON_ID);
    button?.setAttribute("aria-expanded", String(expanded));
  }

  togglePanel(event) {
    if (event.button !== 0) {
      return;
    }

    let window = event.target.documentGlobal;
    let button = window.document.getElementById(BUTTON_ID);
    let panel = this.#ensurePanel(window);

    if (panel.state === "open" || panel.state === "showing") {
      lazy.PanelMultiView.hidePopup(panel);
      return;
    }

    panel.contextBrowserToShare = Cu.getWeakReference(
      window.gBrowser.selectedBrowser
    );

    this.#updateSendToDeviceButton(window);
    if (window.gSync.sendTabConfiguredAndLoading) {
      window.gSync.ensureFxaDevices().then(() => {
        if (!window.closed) {
          this.#updateSendToDeviceButton(window);
        }
      });
    }

    lazy.PanelMultiView.openPopup(panel, button, {
      position: "bottomright topright",
      triggerEvent: event,
    });
  }

  /**
   * Updates the label, subview arrow and disabled state of the send to device
   * button based on whether any device targets are available. The button is
   * disabled while the device list is still being fetched.
   *
   * @param {DOMWindow} window
   */
  #updateSendToDeviceButton(window) {
    let button = window.document.getElementById("share-panel-send-to-device");
    let hasTargets = !!window.gSync.getSendTabTargets().length;
    window.document.l10n.setAttributes(
      button,
      hasTargets ? "share-panel-send-to-device" : "share-panel-send-to-mobile"
    );
    button.classList.toggle("subviewbutton-nav", hasTargets);
    button.toggleAttribute(
      "disabled",
      window.gSync.sendTabConfiguredAndLoading
    );
  }

  /**
   * Handles the send to device button in the main view. Opens the device
   * subview when connected devices are available. Otherwise, opens the
   * sign-in page if the user isn't signed in, or the flow to connect
   * another device if they are signed in, but have no devices connected.
   *
   * @param {Element} panel
   * @param {XULCommandEvent} event
   * @returns {boolean} Whether the device subview was shown.
   */
  #showDeviceView(panel, event) {
    let window = panel.documentGlobal;
    if (!window.gSync.getSendTabTargets().length) {
      if (window.gSync.isSignedIn) {
        window.gSync.openConnectAnotherDevice("share-panel");
      } else {
        window.gSync.openSignInAgainPage("share-panel");
      }
      return false;
    }

    this.#populateDeviceView(panel);
    window.document
      .getElementById("share-panel-multiview")
      .showSubView("share-panel-deviceView", event.target);
    return true;
  }

  /**
   * Populates the device submenu with an entry per device.
   *
   * @param {Element} panel
   */
  #populateDeviceView(panel) {
    let window = panel.documentGlobal;
    let document = panel.ownerDocument;
    let body = document.getElementById("share-panel-deviceView-body");

    let deviceButtons = window.gSync.getSendTabTargets().map(target => {
      let button = document.createXULElement("toolbarbutton");
      button.classList.add(
        "subviewbutton",
        "subviewbutton-iconic",
        "sendToDevice-device",
        "share-panel-device"
      );
      button.setAttribute("label", target.name);
      button.setAttribute(
        "clientType",
        window.gSync.getTargetClientType(target)
      );
      button.deviceId = target.id;
      return button;
    });

    let separator = document.createXULElement("toolbarseparator");

    let connectButton = document.createXULElement("toolbarbutton");
    connectButton.id = CONNECT_DEVICE_BUTTON_ID;
    connectButton.classList.add("subviewbutton", "subviewbutton-iconic");
    document.l10n.setAttributes(connectButton, "share-panel-connect-device-2");

    let helpButton = document.createXULElement("toolbarbutton");
    helpButton.id = DEVICE_HELP_BUTTON_ID;
    helpButton.classList.add("subviewbutton", "subviewbutton-iconic");
    document.l10n.setAttributes(helpButton, "share-panel-missing-device");

    body.replaceChildren(
      ...deviceButtons,
      separator,
      connectButton,
      helpButton
    );
  }

  /**
   * Turns the panel template into DOM the first time it is needed.
   *
   * @param {DOMWindow} window
   *   The browser window.
   * @returns {Element}
   *   The panel element for this window.
   */
  #ensurePanel(window) {
    let panel = window.document.getElementById(PANEL_ID);
    if (!panel) {
      let template = window.document.getElementById(TEMPLATE_ID);
      panel = template.content.firstElementChild;
      template.replaceWith(template.content);

      panel.addEventListener("command", this);
      panel.addEventListener("popupshowing", this);
      panel.addEventListener("popuphidden", this);
    }

    return panel;
  }

  #startActions(window, isShareable) {
    this.#windowToAction.set(window, { isShareable, action: "" });
  }

  #saveAction(window, action) {
    const actionObject = this.#windowToAction.get(window);
    if (!actionObject) {
      return;
    }

    actionObject.action = action;
  }

  #recordActions(window) {
    const actionObject = this.#windowToAction.get(window);
    if (!actionObject) {
      return;
    }

    const { isShareable, action } = actionObject;
    Glean.shareButton.impression.record({
      is_shareable: isShareable,
      action,
    });

    this.#windowToAction.delete(window);
  }
}

export const SharePageAction = new SharePageActionClass();
