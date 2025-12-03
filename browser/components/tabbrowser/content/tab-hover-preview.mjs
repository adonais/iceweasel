/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PageWireframes: "resource:///modules/sessionstore/PageWireframes.sys.mjs",
  SponsorProtection:
    "moz-src:///browser/components/newtab/SponsorProtection.sys.mjs",
});

// Denotes the amount of time (in ms) that the panel will *not* respect
// ui.tooltip.delay_ms after a tab preview panel is hidden. This is to reduce
// jitter in the event that a user accidentally moves their mouse off the tab
// strip.
const ZERO_DELAY_ACTIVATION_TIME = 300;

// Denotes the amount of time (in ms) that the tab group hover preview panel
// will remain open after the user's mouse leaves the tab group label. This
// is necessary to allow the user to move their mouse between the tab group
// label and the open panel without having it disappear before they get there.
const TAB_GROUP_PANEL_STICKY_TIME = 100;

/**
 * Shared module that contains logic for the tab hover preview (THP) and tab
 * group hover preview (TGHP) panels.
 */
export default class TabHoverPanelSet {
  /** @type {Window} */
  #win;

  /** @type {Set<HTMLElement>} */
  #openPopups;

  constructor(win) {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefDisableAutohide",
      "ui.popup.disable_autohide",
      false
    );

    this.#win = win;

    this.panelOpener = new TabPreviewPanelTimedFunction(
      ZERO_DELAY_ACTIVATION_TIME,
      this.#win
    );

    this.tabPanel = new TabPanel(
      this.#win.document.getElementById("tab-preview-panel"),
      this
    );
    this.tabGroupPanel = new TabGroupPanel(
      this.#win.document.getElementById("tabgroup-preview-panel"),
      this
    );

    this.#setExternalPopupListeners();
  }

  /**
   * Activate the tab preview or tab group preview, depending on context.
   *
   * If `tabOrGroup` is a tab, the tab preview will be activated. If
   * `tabOrGroup` is a tab group, the group preview will be activated.
   * Activating a panel of one type will automatically deactivate the other
   * type.
   *
   * @param {MozTabbrowserTab|MozTabbrowserTabGroup} tabOrGroup - The tab or group to activate the panel on.
   */
  activate(tabOrGroup) {
    if (!this.shouldActivate()) {
      return;
    }

    if (this.#win.gBrowser.isTab(tabOrGroup)) {
      if (this.tabGroupPanel.isActive) {
        this.tabGroupPanel.deactivate({ force: true });
      }
      this.tabPanel.activate(tabOrGroup);
    } else if (this.#win.gBrowser.isTabGroup(tabOrGroup)) {
      if (!tabOrGroup.collapsed) {
        return;
      }

      if (this.tabPanel.isActive) {
        this.tabPanel.deactivate();
      }
      this.tabGroupPanel.activate(tabOrGroup);
    } else {
      throw new Error("Received activate call from unknown element");
    }
  }

  /**
   * Deactivate the tab panel and/or the tab group panel.
   *
   * If `tabOrGroup` is a tab, the tab preview will be deactivated. If
   * `tabOrGroup` is a tab group, the group preview will be deactivated.
   * If neither, both are deactivated.
   *
   * The tab group panel deactivation contains special logic which keeps it
   * open for a specified interval, and then checks the hover state of the tab
   * group label and the panel itself, cancelling deactivation if either is
   * being hovered over. This is necessary to allow a user to move the mouse
   * between the group and the panel without experiencing jittery behaviour.
   * Calling functions can pass `force` to the options dict to override this
   * if necessary.
   *
   * @param {MozTabbrowserTab|MozTabbrowserTabGroup|null} tabOrGroup - The tab or group to activate the panel on.
   * @param {bool} [options.force] - If true, force immediate deactivation of the tab group panel.
   */
  deactivate(tabOrGroup, { force = false } = {}) {
    if (this._prefDisableAutohide) {
      return;
    }

    if (this.#win.gBrowser.isTab(tabOrGroup) || !tabOrGroup) {
      this.tabPanel.deactivate(tabOrGroup);
    }

    if (this.#win.gBrowser.isTabGroup(tabOrGroup) || !tabOrGroup) {
      this.tabGroupPanel.deactivate({ force });
    }
  }

  shouldActivate() {
    return (
      // All other popups are closed.
      !this.#openPopups.size &&
      // TODO (bug 1899556): for now disable in background windows, as there are
      // issues with windows ordering on Linux (bug 1897475), plus intermittent
      // persistence of previews after session restore (bug 1888148).
      this.#win == Services.focus.activeWindow
    );
  }

  /**
   * Listen for any panels or menupopups that open or close anywhere else in the DOM tree
   * and maintain a list of the ones that are currently open.
   * This is used to disable tab previews until such time as the other panels are closed.
   */
  #setExternalPopupListeners() {
    // Since the tab preview panel is lazy loaded, there is a possibility that panels could
    // already be open on init. Therefore we need to initialize `#openPopups` with existing panels
    // the first time.

    const initialPopups = this.#win.document.querySelectorAll(
      `panel[panelopen=true]:not(#tab-preview-panel):not(#tabgroup-preview-panel),
       panel[animating=true]:not(#tab-preview-panel):not(#tabgroup-preview-panel),
       menupopup[open=true]`.trim()
    );
    this.#openPopups = new Set(initialPopups);

    const handleExternalPopupEvent = (eventName, setMethod) => {
      this.#win.addEventListener(eventName, ev => {
        const { target } = ev;
        if (
          target !== this.tabPanel.panelElement &&
          target !== this.tabGroupPanel.panelElement &&
          (target.nodeName == "panel" || target.nodeName == "menupopup")
        ) {
          this.#openPopups[setMethod](target);
        }
      });
    };
    handleExternalPopupEvent("popupshowing", "add");
    handleExternalPopupEvent("popuphiding", "delete");
  }
}

class Panel {
  get isActive() {
    return this.panelElement.state == "open";
  }
}

class TabPanel extends Panel {
  /** @type {MozTabbrowserTab|null} */
  #tab;

  /** @type {DOMElement|null} */
  #thumbnailElement;

  /** @type {TabHoverPanelSet} */
  #panelSet;

  constructor(panel, panelSet) {
    super();

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefDisplayThumbnail",
      "browser.tabs.hoverPreview.showThumbnails",
      false
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefCollectWireframes",
      "browser.history.collectWireframes"
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "officialtips",
      "officialtips.show",
      false
    );

    this.panelElement = panel;
    this.#panelSet = panelSet;

    this.win = this.panelElement.ownerGlobal;

    this.#tab = null;
    this.#thumbnailElement = null;
  }

  handleEvent(e) {
    switch (e.type) {
      case "popupshowing":
        this.#updatePreview();
        break;
      case "TabAttrModified":
        this.#updatePreview(e.target);
        break;
      case "TabSelect":
        this.deactivate();
        break;
    }
  }

  activate(tab) {
    this.#tab = tab;

    // Calling `moveToAnchor` in advance of the call to `openPopup` ensures
    // that race conditions can be avoided in cases where the user hovers
    // over a different tab while the preview panel is still opening.
    // This will ensure the move operation is carried out even if the popup is
    // in an intermediary state (opening but not fully open).
    //
    // If the popup is closed this call will be ignored.
    this.#movePanel();

    this.#thumbnailElement = null;
    this.#maybeRequestThumbnail();
    if (
      this.panelElement.state == "open" ||
      this.panelElement.state == "showing"
    ) {
      this.#updatePreview();
    }
    this.#panelSet.panelOpener.execute(() => {
      if (!this.#panelSet.shouldActivate() || (!this.officialtips && !this._prefDisplayThumbnail)) {
        return;
      }
      this.panelElement.openPopup(this.#tab, this.popupOptions);
    }, this);
    this.win.addEventListener("TabSelect", this);
    this.panelElement.addEventListener("popupshowing", this);
    this.#tab.addEventListener("TabAttrModified", this);
  }

  deactivate(leavingTab = null) {
    if (leavingTab) {
      if (this.#tab != leavingTab) {
        return;
      }
      this.win.requestAnimationFrame(() => {
        if (this.#tab == leavingTab) {
          this.deactivate();
        }
      });
      return;
    }
    this.#tab?.removeEventListener("TabAttrModified", this);
    this.#tab = null;
    this.#thumbnailElement = null;
    this.panelElement.removeEventListener("popupshowing", this);
    this.win.removeEventListener("TabSelect", this);
    this.panelElement.hidePopup();
    this.#panelSet.panelOpener.clear(this);
    this.#panelSet.panelOpener.setZeroDelay();
  }

  getPrettyURI(uri) {
    let url = URL.parse(uri);
    if (!url) {
      return uri;
    }

    if (url.protocol == "about:" && url.pathname == "reader") {
      url = URL.parse(url.searchParams.get("url"));
    }

    if (url?.protocol === "about:") {
      return url.href;
    }
    return url ? url.hostname.replace(/^w{3}\./, "") : uri;
  }

  #hasValidWireframeState(tab) {
    return (
      this._prefCollectWireframes &&
      this._prefDisplayThumbnail &&
      tab &&
      !tab.selected &&
      !!lazy.PageWireframes.getWireframeState(tab)
    );
  }

  #hasValidThumbnailState(tab) {
    return (
      this._prefDisplayThumbnail &&
      tab &&
      tab.linkedBrowser &&
      !tab.getAttribute("pending") &&
      !tab.selected
    );
  }

  #maybeRequestThumbnail() {
    let tab = this.#tab;

    if (!this.#hasValidThumbnailState(tab)) {
      let wireframeElement = lazy.PageWireframes.getWireframeElementForTab(tab);
      if (wireframeElement) {
        this.#thumbnailElement = wireframeElement;
        this.#updatePreview();
      }
      return;
    }
    let thumbnailCanvas = this.win.document.createElement("canvas");
    thumbnailCanvas.width = 280 * this.win.devicePixelRatio;
    thumbnailCanvas.height = 140 * this.win.devicePixelRatio;

    this.win.PageThumbs.captureTabPreviewThumbnail(
      tab.linkedBrowser,
      thumbnailCanvas
    )
      .then(() => {
        // in case we've changed tabs after capture started, ensure we still want to show the thumbnail
        if (this.#tab == tab && this.#hasValidThumbnailState(tab)) {
          this.#thumbnailElement = thumbnailCanvas;
          this.#updatePreview();
        }
      })
      .catch(e => {
        // Most likely the window was killed before capture completed, so just log the error
        console.error(e);
      });
  }

  get #displayTitle() {
    if (!this.#tab) {
      return "";
    }
    return this.#tab.textLabel.textContent;
  }

  get #displayURI() {
    if (!this.#tab || !this.#tab.linkedBrowser) {
      return "";
    }
    return this.getPrettyURI(this.#tab.linkedBrowser.currentURI.spec);
  }

  get #displayPids() {
    const pids = this.win.gBrowser.getTabPids(this.#tab);
    if (!pids.length) {
      return "";
    }

    let pidLabel = pids.length > 1 ? "pids" : "pid";
    return `${pidLabel}: ${pids.join(", ")}`;
  }

  get #displayActiveness() {
    return this.#tab?.linkedBrowser?.docShellIsActive ? "[A]" : "";
  }

  get #displaySponsorProtection() {
    return lazy.SponsorProtection.debugEnabled &&
      lazy.SponsorProtection.isProtectedBrowser(this.#tab?.linkedBrowser)
      ? "[S]"
      : "";
  }

  #updatePreview(tab = null) {
    if (tab) {
      this.#tab = tab;
    }

    this.panelElement.querySelector(".tab-preview-title").textContent =
      this.#displayTitle;
    this.panelElement.querySelector(".tab-preview-uri").textContent =
      this.#displayURI;

    if (this.win.gBrowser.showPidAndActiveness) {
      this.panelElement.querySelector(".tab-preview-pid").textContent =
        this.#displayPids;
      this.panelElement.querySelector(".tab-preview-activeness").textContent =
        this.#displayActiveness + this.#displaySponsorProtection;
    } else {
      this.panelElement.querySelector(".tab-preview-pid").textContent = "";
      this.panelElement.querySelector(".tab-preview-activeness").textContent =
        "";
    }

    let thumbnailContainer = this.panelElement.querySelector(
      ".tab-preview-thumbnail-container"
    );
    thumbnailContainer.classList.toggle(
      "hide-thumbnail",
      !this.#hasValidThumbnailState(this.#tab) &&
        !this.#hasValidWireframeState(this.#tab)
    );
    if (thumbnailContainer.firstChild != this.#thumbnailElement) {
      thumbnailContainer.replaceChildren();
      if (this.#thumbnailElement) {
        thumbnailContainer.appendChild(this.#thumbnailElement);
      }
      this.panelElement.dispatchEvent(
        new CustomEvent("previewThumbnailUpdated", {
          detail: {
            thumbnail: this.#thumbnailElement,
          },
        })
      );
    }
    this.#movePanel();
  }

  #movePanel() {
    if (this.#tab) {
      this.panelElement.moveToAnchor(
        this.#tab,
        this.popupOptions.position,
        this.popupOptions.x,
        this.popupOptions.y
      );
    }
  }

  get popupOptions() {
    if (!this.win.gBrowser.tabContainer.verticalMode) {
      return {
        position: "bottomleft topleft",
        x: 0,
        y: -2,
      };
    }
    if (!this.win.SidebarController._positionStart) {
      return {
        position: "topleft topright",
        x: 0,
        y: 3,
      };
    }
    return {
      position: "topright topleft",
      x: 0,
      y: 3,
    };
  }
}

class TabGroupPanel extends Panel {
  /** @type {MozTabbrowserTabGroup|null} */
  #group;

  /** @type {TabHoverPanelSet} */
  #panelSet;

  /** @type {number | null} */
  #deactivateTimer;

  static PANEL_UPDATE_EVENTS = [
    "TabAttrModified",
    "TabClose",
    "TabGrouped",
    "TabMove",
    "TabOpen",
    "TabSelect",
    "TabUngrouped",
  ];

  constructor(panel, panelSet) {
    super();

    this.panelElement = panel;
    this.panelContent = panel.querySelector("#tabgroup-panel-content");
    this.win = this.panelElement.ownerGlobal;

    this.#panelSet = panelSet;
    this.#group = null;
  }

  activate(group) {
    if (this.#group && this.#group != group) {
      this.#group.hoverPreviewPanelActive = false;
    }

    this.#group = group;
    this.#movePanel();
    this.#updatePanelContent();

    this.#panelSet.panelOpener.execute(() => {
      if (!this.#panelSet.shouldActivate() || !this.#group.collapsed) {
        return;
      }
      this.#doOpenPanel();
    }, this);
  }

  /**
   * Move keyboard focus into the group preview panel.
   *
   * @param {-1|1} [dir] Whether to focus the beginning or end of the list.
   */
  focusPanel(dir = 1) {
    let childIndex = dir > 0 ? 0 : this.panelContent.children.length - 1;
    this.panelContent.children[childIndex].focus();
  }

  deactivate({ force = false } = {}) {
    if (force) {
      this.win.clearTimeout(this.#deactivateTimer);
      this.#deactivateTimer = null;
      this.#doDeactivate();
      return;
    }

    if (this.#deactivateTimer) {
      return;
    }

    this.#deactivateTimer = this.win.setTimeout(() => {
      this.#deactivateTimer = null;
      if (this.#hasHoverState()) {
        return;
      }
      this.#doDeactivate();
    }, TAB_GROUP_PANEL_STICKY_TIME);
  }

  #doDeactivate() {
    this.panelElement.removeEventListener("mouseout", this);
    this.panelElement.removeEventListener("command", this);

    if (this.#group) {
      this.#group.hoverPreviewPanelActive = false;

      for (let event of TabGroupPanel.PANEL_UPDATE_EVENTS) {
        this.#group.removeEventListener(event, this);
      }
    }

    this.panelElement.hidePopup();
    this.#panelSet.panelOpener.clear(this);
    this.#panelSet.panelOpener.setZeroDelay();
  }

  #hasHoverState() {
    return (
      this.#group?.labelContainerElement?.matches(":hover") ||
      this.panelElement.matches(":hover")
    );
  }

  #doOpenPanel() {
    this.panelElement.addEventListener("mouseout", this);
    this.panelElement.addEventListener("command", this);

    this.#group.hoverPreviewPanelActive = true;

    for (let event of TabGroupPanel.PANEL_UPDATE_EVENTS) {
      this.#group.addEventListener(event, this);
    }

    this.panelElement.openPopup(this.#popupTarget, this.popupOptions);

    Glean.tabgroup.groupInteractions.hover_preview.add();
  }

  #updatePanelContent() {
    const fragment = this.win.document.createDocumentFragment();
    for (let tab of this.#group.tabs) {
      let tabbutton = this.win.document.createXULElement("toolbarbutton");
      tabbutton.setAttribute("role", "button");
      tabbutton.setAttribute("keyNav", false);
      tabbutton.setAttribute("tabindex", 0);
      tabbutton.setAttribute("label", tab.label);
      tabbutton.setAttribute(
        "image",
        "page-icon:" + tab.linkedBrowser.currentURI.spec
      );
      tabbutton.setAttribute("tooltiptext", tab.label);
      tabbutton.classList.add(
        "subviewbutton",
        "subviewbutton-iconic",
        "group-preview-button"
      );
      if (tab == this.win.gBrowser.selectedTab) {
        tabbutton.classList.add("active-tab");
      }
      tabbutton.tab = tab;
      fragment.appendChild(tabbutton);
    }
    this.panelContent.replaceChildren(fragment);
  }

  handleEvent(event) {
    if (event.type == "command") {
      if (this.win.gBrowser.selectedTab == event.target.tab) {
        this.deactivate({ force: true });
        return;
      }

      // bug1984732: temporarily disable CSS transitions while tabs are
      // switching to prevent an unsightly "slide" animation when switching
      // tabs within a collapsed group
      let switchingTabs = [this.win.gBrowser.selectedTab, event.target.tab];
      if (switchingTabs.every(tab => tab.group == this.#group)) {
        for (let tab of switchingTabs) {
          tab.animationsEnabled = false;
        }

        this.win.addEventListener(
          "TabSwitchDone",
          () => {
            this.win.requestAnimationFrame(() => {
              for (let tab of switchingTabs) {
                tab.animationsEnabled = true;
              }
            });
          },
          { once: true }
        );
      }

      this.win.gBrowser.selectedTab = event.target.tab;
      this.deactivate({ force: true });
    } else if (event.type == "mouseout" && event.target == this.panelElement) {
      this.deactivate();
    } else if (TabGroupPanel.PANEL_UPDATE_EVENTS.includes(event.type)) {
      this.#updatePanelContent();
    }
  }

  get popupOptions() {
    if (!this.win.gBrowser.tabContainer.verticalMode) {
      return {
        position: "bottomleft topleft",
        x: 0,
        y: -2,
      };
    }
    if (!this.win.SidebarController._positionStart) {
      return {
        position: "topleft topright",
        x: 0,
        y: -5,
      };
    }
    return {
      position: "topright topleft",
      x: 0,
      y: -5,
    };
  }

  get #popupTarget() {
    return this.#group?.labelContainerElement;
  }

  #movePanel() {
    if (!this.#popupTarget) {
      return;
    }
    this.panelElement.moveToAnchor(
      this.#popupTarget,
      this.popupOptions.position,
      this.popupOptions.x,
      this.popupOptions.y
    );
  }
}

/**
 * A wrapper that allows for delayed function execution, but with the
 * ability to "zero" (i.e. cancel) the delay for a predetermined period
 */
class TabPreviewPanelTimedFunction {
  /** @type {number} */
  #zeroDelayTime;

  /** @type {Window} */
  #win;

  /** @type {number | null} */
  #timer;

  /** @type {boolean} */
  #useZeroDelay;

  /** @type {function(): void | null} */
  #target;

  /** @type {TabPanel} */
  #from;

  constructor(zeroDelayTime, win) {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefPreviewDelay",
      "ui.tooltip.delay_ms"
    );

    this.#zeroDelayTime = zeroDelayTime;
    this.#win = win;

    this.#timer = null;
    this.#useZeroDelay = false;

    this.#target = null;
    this.#from = null;
  }

  /**
   * Execute a function after a delay, according to the following rules:
   * - By default, execute the function after the time specified by `ui.tooltip.delay_ms`.
   * - If a timer is already active, the timer will not be restarted, but the
   *   function to be executed will be set to the one from the most recent
   *   call (see notes below)
   * - If the zero delay has been set with `setZeroDelay`, the function will
   *   invoke immediately
   *
   * Multiple calls to `execute` within the delay will not invoke the function
   * each time. The original delay will be preserved (i.e. the function will
   * execute after `ui.tooltip.delay_ms` from the first call) but the function
   * that is executed may be updated by subsequent calls to execute. This
   * ensures that if the panel we want to open changes (e.g. if a user hovers
   * over a tab, then quickly switches to a tab group before the delay
   * expires), the delay is not restarted, which would cause a longer than
   * usual time to open.
   *
   * @param {function(): void | null} target
   *   The function to execute
   * @param {TabPanel} from
   *   The calling panel
   */
  execute(target, from) {
    this.#target = target;
    this.#from = from;

    if (this.delayActive) {
      return;
    }

    // Always setting a timer, even in the situation where the
    // delay is zero, seems to prevent a class of race conditions
    // where multiple tabs are hovered in quick succession
    this.#timer = this.#win.setTimeout(
      () => {
        this.#timer = null;
        this.#target();
      },
      this.#useZeroDelay ? 0 : this._prefPreviewDelay
    );
  }

  /**
   * Clear the timer, if it is active, for example when a user moves off a panel.
   * This has the effect of suppressing the delayed function execution.
   *
   * @param {TabPanel} from
   *   The calling panel. This must be the same as the panel that most recently
   *   called `execute`. If it is not, the call will be ignored. This is
   *   necessary to prevent, e.g., the tab hover panel from inadvertently
   *   cancelling the opening of the tab group hover panel in cases where the
   *   user quickly hovers between tabs and tab groups before the panel fully
   *   opens.
   */
  clear(from) {
    if (from == this.#from && this.#timer) {
      this.#win.clearTimeout(this.#timer);
      this.#timer = null;
      this.#from = null;
    }
  }

  /**
   * Temporarily suppress the delay mechanism.
   *
   * The delay will automatically reactivate after a set interval, which is
   * configured by the constructor.
   */
  setZeroDelay() {
    if (this.#useZeroDelay) {
      return;
    }

    this.#win.setTimeout(() => {
      this.#useZeroDelay = false;
    }, this.#zeroDelayTime);
    this.#useZeroDelay = true;
  }

  get delayActive() {
    return this.#timer !== null;
  }
}
