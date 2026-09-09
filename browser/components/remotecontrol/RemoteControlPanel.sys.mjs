/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  RemoteControlServers:
    "moz-src:///browser/components/remotecontrol/RemoteControlServers.sys.mjs",
});

const PREF_DYNAMIC_START_ENABLED = "remote.experimental.dynamicstart.enabled";

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "dynamicStartEnabled",
  PREF_DYNAMIC_START_ENABLED,
  false,
  () => RemoteControlPanel.onPrefChange()
);

const FIREFOX_DEVTOOLS_MCP_ROOT = ".firefox-devtools-mcp";

const WIDGET_ID = "remote-control-toolbar-button";
const VIEW_ID = "remote-control-panel";
const TOGGLE_BUTTON_ID = `${VIEW_ID}-toggle-button`;
const STATUS_TEXT_ID = `${VIEW_ID}-status-text`;

/**
 * Nightly only toolbar button and panel which allow users to start and stop the
 * remote protocol servers at runtime. This is meant to be used to allow AI
 * assistants to drive an already running Firefox via e.g. firefox-devtools-mcp
 * without having to launch Firefox with --remote-debugging-port & --marionette.
 */
class RemoteControlPanelClass {
  #isObserving;
  #serversAlreadyStarted;
  #toggling;

  constructor() {
    this.#isObserving = false;
    this.#serversAlreadyStarted = null;
    this.#toggling = false;
  }

  init() {
    // When init() runs, check if a server is already started. If yes, it
    // was necessarily started via Firefox cli flags, and the panel + button
    // should not be displayed.
    this.#serversAlreadyStarted = lazy.RemoteControlServers.enabled;

    this.onPrefChange();
  }

  /**
   * Create or destroy the toolbar button depending on the state of the
   * dynamic start preference.
   */
  onPrefChange() {
    if (
      !AppConstants.ENABLE_WEBDRIVER ||
      !AppConstants.NIGHTLY_BUILD ||
      this.#serversAlreadyStarted
    ) {
      return;
    }

    if (lazy.dynamicStartEnabled) {
      lazy.CustomizableUI.createWidget({
        id: WIDGET_ID,
        l10nId: "remote-control-toolbar-button",
        type: "view",
        viewId: VIEW_ID,
        defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
        onCreated: node => {
          node.setAttribute("badged", "true");
          this.#updateButton(node);
        },
        onViewShowing: event => this.#onViewShowing(event),
        onViewHiding: event => this.#onViewHiding(event),
      });
      this.#addObservers();
    } else {
      lazy.CustomizableUI.destroyWidget(WIDGET_ID);
      this.#removeObservers();
    }
  }

  #addObservers() {
    if (this.#isObserving) {
      return;
    }
    this.#isObserving = true;

    Services.obs.addObserver(this, "remote-listening");
    Services.obs.addObserver(this, "marionette-listening");
  }

  #removeObservers() {
    if (!this.#isObserving) {
      return;
    }
    this.#isObserving = false;

    Services.obs.removeObserver(this, "remote-listening");
    Services.obs.removeObserver(this, "marionette-listening");
  }

  observe() {
    this.#updateAllWindows();
  }

  handleEvent(event) {
    if (event.target.id == `${VIEW_ID}-toggle-button`) {
      this.#onToggleCommand();
    }
  }

  /**
   * Specifically for firefox-devtools-mcp usage, prepare the folder where
   * Marionette is expected to write the port.
   * Typically should live at ~/.firefox-devtools-mcp/instances
   *
   * @returns {string|null}
   *     The path of the port file, or null if the folder could not be created.
   */
  async #createPortFilePath() {
    const folder = PathUtils.join(
      Services.dirsvc.get("Home", Ci.nsIFile).path,
      FIREFOX_DEVTOOLS_MCP_ROOT,
      "instances"
    );

    try {
      await IOUtils.makeDirectory(folder, {
        createAncestors: true,
        permissions: 0o700,
      });
    } catch (e) {
      console.error(`Failed to create ${folder}:`, e);
      return null;
    }

    return PathUtils.join(folder, `${Services.appinfo.processID}.port`);
  }

  async #onToggleCommand() {
    if (this.#toggling) {
      return;
    }

    // Starting or stopping the servers can take a moment, prevent any
    // additional command while it is in progress.
    this.#toggling = true;
    this.#updateAllWindows();

    try {
      if (lazy.RemoteControlServers.runningDynamically) {
        await lazy.RemoteControlServers.stop();
      } else {
        await lazy.RemoteControlServers.start({
          portFilePath: await this.#createPortFilePath(),
        });
      }
    } catch (e) {
      console.error("Failed to toggle the Remote Agent servers:", e);
    }

    this.#toggling = false;

    // The "remote-listening" and "marionette-listening" notifications already
    // refresh the UI, but they are not emitted when a server failed to start
    // or to stop.
    this.#updateAllWindows();
  }

  #onViewHiding(event) {
    event.target.removeEventListener("command", this);
  }

  #onViewShowing(event) {
    const panelview = event.target;
    panelview.addEventListener("command", this);
    this.#updatePanel(panelview);
  }

  #updateAllWindows() {
    const widget = lazy.CustomizableUI.getWidget(WIDGET_ID);
    if (widget) {
      for (const { node } of widget.instances) {
        this.#updateButton(node);

        const panelview = node.ownerDocument.getElementById(VIEW_ID);
        if (panelview) {
          this.#updatePanel(panelview);
        }
      }
    }
  }

  #updateButton(node) {
    const isRunning = lazy.RemoteControlServers.runningDynamically;

    // Selects the icon with the status dot, see toolbarbutton-icons.css.
    node.toggleAttribute("remote-control-running", isRunning);

    // The state has to be part of the accessible name as well, so that it is
    // not only conveyed by the color of the icon.
    node.ownerDocument.l10n.setAttributes(
      node,
      isRunning
        ? "remote-control-toolbar-button-on"
        : "remote-control-toolbar-button"
    );
  }

  #updatePanel(panelview) {
    const isRunning = lazy.RemoteControlServers.runningDynamically;

    panelview.toggleAttribute("remote-control-running", isRunning);

    panelview.ownerDocument.l10n.setAttributes(
      panelview.querySelector(`#${STATUS_TEXT_ID}`),
      isRunning
        ? "remote-control-panel-status-running"
        : "remote-control-panel-status-stopped"
    );
    const toggleButton = panelview.querySelector(`#${TOGGLE_BUTTON_ID}`);
    toggleButton.disabled = this.#toggling;
    panelview.ownerDocument.l10n.setAttributes(
      toggleButton,
      isRunning
        ? "remote-control-panel-turn-off-button"
        : "remote-control-panel-turn-on-button"
    );
  }

  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);
}

export const RemoteControlPanel = new RemoteControlPanelClass();
