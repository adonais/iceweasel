/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { debounce } = require("resource://devtools/shared/debounce");
const EventEmitter = require("resource://devtools/shared/event-emitter.js");

loader.lazyRequireGetter(
  this,
  "gDevToolsBrowser",
  "resource://devtools/client/framework/devtools-browser.js",
  true
);

loader.lazyRequireGetter(
  this,
  "Toolbox",
  "resource://devtools/client/framework/toolbox.js",
  true
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

/* A host should always allow this much space for the page to be displayed.
 * There is also a min-height on the browser, but we still don't want to set
 * frame.style.height to be larger than that, since it can cause problems with
 * resizing the toolbox and panel layout. */
const MIN_PAGE_SIZE = 25;

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const BROWSER_SIDEBAR_CONTAINER_DEVTOOLS_HOST_TYPE_ATTR = "devtools-host-type";

/**
 * A toolbox host represents an object that contains a toolbox (e.g. the
 * sidebar or a separate window). Any host object should implement the
 * following functions:
 *
 * createElements() - synchronously create the frame into which DevTools will be loaded (if possible)
 * async finalizeCreation() - asynchronously finalize the creation of the UI (if needed)
 * raise() - bring UI in foreground
 * setTitle - update UI's visible title (if any)
 * destroy() - destroy the host's UI
 */

/**
 * Base class for any in-browser host: left, bottom, right.
 */
class BaseInBrowserHost {
  /**
   * @param {Tab} hostTab
   *              The web page's tab where DevTools are displayed.
   * @param {string} type
   *              The host type: left, bottom, right.
   */
  constructor(hostTab, type) {
    this.hostTab = hostTab;
    this.type = type;

    this._gBrowser = this.hostTab.documentGlobal.gBrowser;
    this._browserContainer = this._gBrowser.getBrowserContainer(
      this.hostTab.linkedBrowser
    );
    this.#browserSidebarContainerEl = this._browserContainer.closest(
      ".browserSidebarContainer"
    );

    // Reference to the <browser> element used to load DevTools.
    // This is created by each subclass from createElements() method
    this.frame = null;

    Services.obs.addObserver(this, "browsing-context-active-change");
  }

  #browserSidebarContainerEl;

  _createFrame() {
    this.frame = createDevToolsFrame(
      this.hostTab.ownerDocument,
      this.type == "bottom" ? "bottom-host" : "side-host"
    );
    // Set an id on the frame so we can reference it in the splitter aria-controls attribute
    const container = this.hostTab.ownerDocument.querySelector(
      ".browserSidebarContainer"
    );
    if (container) {
      this.frame.id = `${container.id}-devtools-toolbox`;
    }

    // Set attribute on the .browserSidebarContainer element so we can style the dialogs
    // depending on where the toolbox is docked.
    this.#browserSidebarContainerEl.setAttribute(
      BROWSER_SIDEBAR_CONTAINER_DEVTOOLS_HOST_TYPE_ATTR,
      this.type
    );
  }

  observe(subject, topic) {
    if (topic != "browsing-context-active-change") {
      return;
    }
    // Ignore any BrowsingContext which isn't the debugged tab's BrowsingContext
    // (toolbox may be half destroyed and the linkedBrowser be null when moving a tab
    // with DevTools to another window)
    // Note: Don't compare BCs directly, as host BC can be stale during navigation.
    if (this.hostTab.linkedBrowser?.browserId != subject.browserId) {
      return;
    }

    // The debugged tab's BC changed and the old one became inactive.
    if (subject.isReplaced) {
      return;
    }

    // In case this is called before createElements() is called
    if (!this.frame) {
      return;
    }

    // Update DevTools <browser> element's isActive according to the debugged <browser> element status.
    // This helps activate/deactivate DevTools when changing tabs.
    // It notably triggers visibilitychange events on DevTools documents.
    this.frame.docShellIsActive = subject.isActive;
  }

  /**
   * Raise the host.
   */
  raise() {
    focusTab(this.hostTab);
  }

  /**
   * Set the toolbox title.
   * Nothing to do for this host type.
   */
  setTitle() {}

  /**
   * Destroy this host.
   *
   * @param {object} options
   * @param {string} options.newHostType: The new host type, if we're switching host (e.g.
   *                 from bottom to right)
   */
  destroy(options = {}) {
    Services.obs.removeObserver(this, "browsing-context-active-change");
    this._gBrowser = null;
    this._browserContainer = null;

    const isSwitchingToInBrowserHost =
      options.newHostType === Toolbox.HostType.LEFT ||
      options.newHostType === Toolbox.HostType.RIGHT ||
      options.newHostType === Toolbox.HostType.BOTTOM;
    if (!isSwitchingToInBrowserHost) {
      // When switching to a non-in-browser host (e.g. separate window), we need to remove
      // the host type attribute.
      // We don't need to do it when switching to a in-browser host, as the attribute is
      // already set by the constructor of the new host.
      this.#browserSidebarContainerEl.removeAttribute(
        BROWSER_SIDEBAR_CONTAINER_DEVTOOLS_HOST_TYPE_ATTR
      );
    }

    this.#browserSidebarContainerEl = null;
  }
}

/**
 * Host object for the dock on the bottom of the browser
 */
class BottomHost extends BaseInBrowserHost {
  constructor(hostTab) {
    super(hostTab, "bottom");

    this.heightPref = "devtools.toolbox.footer.height";
  }

  #docShell;
  #destroyed;
  #gridLinesString;
  #splitter;

  /**
   * Create a box at the bottom of the host tab.
   */
  createElements() {
    const { ownerDocument } = this.hostTab;
    this.#splitter = ownerDocument.createXULElement("splitter");
    this.#splitter.classList.add(
      "devtools-toolbox-splitter",
      "for-bottom-host"
    );
    this.#splitter.setAttribute("resizebefore", "none");
    this.#splitter.setAttribute("resizeafter", "sibling");
    this.#splitter.setAttribute("orient", "vertical");

    this.#splitter.setAttribute("tabindex", "0");
    this.#splitter.setAttribute("role", "separator");
    this.#splitter.setAttribute("data-l10n-id", "tab-devtools-splitter");

    this._createFrame();
    this.#splitter.setAttribute("aria-controls", this.frame.id);
    this.#splitter.setAttribute("aria-orientation", "vertical");
    this.#splitter.addEventListener(
      "command",
      this.#updateSplitterAriaValuenow
    );

    const height = Math.min(
      Services.prefs.getIntPref(this.heightPref),
      this._browserContainer.clientHeight - MIN_PAGE_SIZE
    );
    this.frame.style.height = `${height}px`;
    this._browserContainer.append(this.#splitter, this.frame);

    // We want to update the frame max height (and possibly cap its height), as well as
    // the splitter aria-value(max|min) value when the browser container gets resized,
    // but also when other nodes are added/removed in the browser container (e.g. the
    // RDM and "Find in page" toolbars, notification in split view, …).
    // We can't use a MutationObserver for that as some nodes are added to the DOM while
    // taking no space (e.g. .notification-box).
    // So let's add a reflow observer instead where we'll check if the .browserContainer
    // lines were updated.
    // We need to store the docShell onto which we add the reflow observer so we can
    // remove it in `destroy` (retrieving it from the browserContainer documentGlobal
    // didn't seem to work, the window was leaking).
    this.#docShell = this._browserContainer.documentGlobal.docShell;
    this.#docShell.addWeakReflowObserver(this);

    this.#updateSplitterAriaAttributesAndFrameMaxHeight();
  }

  QueryInterface = ChromeUtils.generateQI([
    "nsIReflowObserver",
    "nsISupportsWeakReference",
  ]);

  reflow = () => this.#onReflow();
  reflowInterruptible = () => this.#onReflow();

  async finalizeCreation() {
    await gDevToolsBrowser.loadBrowserStyleSheet(this.hostTab.documentGlobal);
    this.frame.docShellIsActive = true;

    focusTab(this.hostTab);
  }

  #updateSplitterAriaValuenow = () => {
    this.#splitter.setAttribute(
      "aria-valuenow",
      parseFloat(this.frame.style.height)
    );
  };

  /**
   * Returns a string representation of the browserContainer grid lines, where each "part"
   * of the string is a grid line "top" starts.
   * For example "0\n0\n30\n60\n400\n400\n600\n"
   *
   * @returns {string|null} Returns null when we can't get the grid fragments.
   */
  #getGridLines = () => {
    if (!this._browserContainer) {
      return null;
    }

    const gridFragments = this._browserContainer.getGridFragments();
    // It seems like we're not getting any grid fragments when the browserContainer isn't
    // visible, which is handly, as we won't do unnecessary work.
    if (!gridFragments.length) {
      return null;
    }
    // Return a simple string with the line positions
    let str = "";
    for (const line of gridFragments[0].rows.lines) {
      str += `${line.start}\n`;
    }
    return str;
  };

  #onReflow = debounce(() => {
    if (
      this.#destroyed ||
      // We do cause reflow when we drag the splitter, but the max height of the toolbox
      // isn't impacted in such case.
      this.#splitter.hasAttribute("dragging")
    ) {
      return;
    }

    const str = this.#getGridLines();
    if (str === null || str === this.#gridLinesString) {
      return;
    }
    this.#gridLinesString = str;
    this.#updateSplitterAriaAttributesAndFrameMaxHeight();
  }, 100);

  #updateSplitterAriaAttributesAndFrameMaxHeight = () => {
    const global = this.hostTab.documentGlobal;
    const minHeight = parseFloat(global.getComputedStyle(this.frame).minHeight);
    this.#splitter.setAttribute("aria-valuemin", minHeight);
    // maxHeight of the toolbox is the height of .browserContainer (the container of both
    // the content page and DevTools toolbox), minus the min height of .browserStack and
    // the other sibling height (notification box, find in page, RDM toolbar, …)
    let maxHeight = global.windowUtils.getBoundsWithoutFlushing(
      this._browserContainer
    ).height;
    for (const el of this._browserContainer.childNodes) {
      if (
        el === this.frame ||
        // the splitter has a negative margin so it doesn't end up taking any space
        el === this.#splitter ||
        el.hasAttribute("hidden")
      ) {
        continue;
      }

      if (el.classList.contains("browserStack")) {
        maxHeight -= parseFloat(global.getComputedStyle(el).minHeight);
        continue;
      }
      maxHeight -= global.windowUtils.getBoundsWithoutFlushing(el).height;
    }

    this.#splitter.setAttribute("aria-valuemax", maxHeight);
    this.frame.style.maxHeight = `${maxHeight}px`;
    this.#updateFrameHeightIfNeeded();
    this.#updateSplitterAriaValuenow();
  };

  #updateFrameHeightIfNeeded = () => {
    const frameHeight = parseFloat(this.frame.style.height);
    const frameMaxHeight = parseFloat(this.frame.style.maxHeight);
    if (frameHeight > frameMaxHeight) {
      this.frame.style.height = this.frame.style.maxHeight;
    }
  };

  /**
   * Destroy the bottom dock.
   *
   * @param {object} options
   * @param {string} options.newHostType: The new host type, if we're switching host (e.g.
   *                 from bottom to right)
   */
  destroy(options = {}) {
    if (!this.#destroyed) {
      this.#destroyed = true;

      const height = parseInt(this.frame.style.height, 10);
      if (!isNaN(height)) {
        Services.prefs.setIntPref(this.heightPref, height);
      }
      this.#docShell.removeWeakReflowObserver(this);

      this.#splitter.removeEventListener(
        "command",
        this.#updateSplitterAriaValuenow
      );
      this.#splitter.remove();
      this.frame.remove();

      this.#docShell = null;
      this.frame = null;
      this.#splitter = null;

      super.destroy(options);
    }

    return Promise.resolve(null);
  }
}

/**
 * Base Host object for the in-browser left or right sidebars
 */
class SidebarHost extends BaseInBrowserHost {
  constructor(hostTab, type) {
    super(hostTab, type);

    this.widthPref = "devtools.toolbox.sidebar.width";
  }

  #browserContainerResizeObserver;
  #destroyed;
  #splitter;

  /**
   * Create a box in the sidebar of the host tab.
   */
  createElements() {
    const { ownerDocument } = this.hostTab;

    const dockedCls = this.type === "left" ? "docked-left" : "docked-right";
    this.#splitter = ownerDocument.createXULElement("splitter");
    this.#splitter.classList.add(
      "devtools-toolbox-splitter",
      "for-side-host",
      dockedCls
    );
    this.#splitter.setAttribute("resizebefore", "none");
    this.#splitter.setAttribute("resizeafter", "none");
    this.#splitter.setAttribute("orient", "horizontal");

    this.#splitter.setAttribute("tabindex", "0");
    this.#splitter.setAttribute("role", "separator");
    this.#splitter.setAttribute("data-l10n-id", "tab-devtools-splitter");

    this._createFrame();
    this.frame.classList.add(dockedCls);
    this.#splitter.setAttribute("aria-controls", this.frame.id);
    this.#splitter.setAttribute("aria-orientation", "horizontal");
    this.#splitter.addEventListener(
      "command",
      this.#updateSplitterAriaValuenow
    );

    const width = Math.min(
      Services.prefs.getIntPref(this.widthPref),
      this._browserContainer.clientWidth - MIN_PAGE_SIZE
    );
    this.frame.style.width = `${width}px`;

    // We should consider the direction when changing the dock position.
    const topWindow = this.hostTab.documentGlobal;
    const topDoc = topWindow.document.documentElement;
    const isLTR = topWindow.getComputedStyle(topDoc).direction === "ltr";

    if ((isLTR && this.type == "right") || (!isLTR && this.type == "left")) {
      this.#splitter.setAttribute("resizeafter", "sibling");
      this._browserContainer.append(this.#splitter, this.frame);
    } else {
      this.#splitter.setAttribute("resizebefore", "sibling");
      this._browserContainer.prepend(this.frame, this.#splitter);
    }
    this.#browserContainerResizeObserver =
      new this.hostTab.documentGlobal.ResizeObserver(
        this.#updateSplitterAriaAttributesAndFrameMaxWidth
      );
    this.#browserContainerResizeObserver.observe(this._browserContainer);
  }

  async finalizeCreation() {
    await gDevToolsBrowser.loadBrowserStyleSheet(this.hostTab.documentGlobal);
    this.frame.docShellIsActive = true;

    focusTab(this.hostTab);
  }

  #updateSplitterAriaValuenow = () => {
    const frameWidth = parseFloat(this.frame.style.width);
    this.#splitter.setAttribute("aria-valuenow", frameWidth);

    // Make the side toolbox width available so the content area can reserve it
    // for its min-width.
    this.hostTab.documentGlobal.document
      .getElementById("tabbrowser-tabbox")
      .style.setProperty(
        "--devtools-toolbox-width",
        `${Math.round(frameWidth)}px`
      );
  };

  #updateSplitterAriaAttributesAndFrameMaxWidth = () => {
    const global = this.hostTab.documentGlobal;
    const minWidth = parseFloat(global.getComputedStyle(this.frame).minWidth);
    this.#splitter.setAttribute("aria-valuemin", minWidth);

    // maxWidth of the toolbox is the height of .browserContainer (the container of
    // both the content page and DevTools toolbox), minus the min-width of .browserStack
    const browserStackEl =
      this._browserContainer.querySelector(".browserStack");
    const browserStackElMinWidth = parseFloat(
      global.getComputedStyle(browserStackEl).minWidth
    );
    const maxWidth =
      global.windowUtils.getBoundsWithoutFlushing(this._browserContainer)
        .width - browserStackElMinWidth;

    this.#splitter.setAttribute("aria-valuemax", maxWidth);
    this.frame.style.maxWidth = `${maxWidth}px`;
    this.#updateFrameWidthIfNeeded();
    this.#updateSplitterAriaValuenow();
  };

  #updateFrameWidthIfNeeded = () => {
    const frameWidth = parseFloat(this.frame.style.width);
    const frameMaxWidth = parseFloat(this.frame.style.maxWidth);
    if (frameWidth > frameMaxWidth) {
      this.frame.style.width = this.frame.style.maxWidth;
    }
  };

  /**
   * Destroy the sidebar.
   *
   * @param {object} options
   * @param {string} options.newHostType: The new host type, if we're switching host (e.g.
   *                 from right to bottom)
   */
  destroy(options = {}) {
    if (!this.#destroyed) {
      this.#destroyed = true;

      const width = parseInt(this.frame.style.width, 10);
      if (!isNaN(width)) {
        Services.prefs.setIntPref(this.widthPref, width);
      }

      this.hostTab.documentGlobal.document
        .getElementById("tabbrowser-tabbox")
        .style.removeProperty("--devtools-toolbox-width");

      this.#browserContainerResizeObserver.disconnect();

      this.#splitter.removeEventListener(
        "command",
        this.#updateSplitterAriaValuenow
      );
      this.#splitter.remove();

      this.frame.remove();

      this.#browserContainerResizeObserver = null;
      this.#splitter = null;
      this.frame = null;

      super.destroy(options);
    }

    return Promise.resolve(null);
  }
}

/**
 * Host object for the in-browser left sidebar
 */
class LeftHost extends SidebarHost {
  constructor(hostTab) {
    super(hostTab, "left");
  }
}

/**
 * Host object for the in-browser right sidebar
 */
class RightHost extends SidebarHost {
  constructor(hostTab) {
    super(hostTab, "right");
  }
}

/**
 * Host object for the toolbox in a separate window
 */
class WindowHost extends EventEmitter {
  constructor(hostTab, options) {
    super();

    this._boundUnload = this._boundUnload.bind(this);
    this.hostTab = hostTab;
    this.options = options;
  }

  type = "window";

  WINDOW_URL = "chrome://devtools/content/framework/toolbox-window.xhtml";

  /**
   * For window host, there is nothing we can create synchronously.
   */
  createElements() {}

  /**
   * Create a new xul window to contain the toolbox.
   */
  async finalizeCreation() {
    return new Promise(resolve => {
      let flags = "chrome,centerscreen,resizable,dialog=no";

      // If we are debugging a tab which is in a Private window, we must also
      // set the private flag on the DevTools host window. Otherwise switching
      // hosts between docked and window modes can fail due to incompatible
      // docshell origin attributes. See 1581093.
      const owner = this.hostTab?.documentGlobal;
      if (owner && lazy.PrivateBrowsingUtils.isWindowPrivate(owner)) {
        flags += ",private";
      }

      // If the current window is a non-fission window, force the non-fission
      // flag. Otherwise switching to window host from a non-fission window in
      // a fission Firefox (!) will attempt to swapFrameLoaders between fission
      // and non-fission frames. See Bug 1650963.
      if (this.hostTab && !this.hostTab.documentGlobal.gFissionBrowser) {
        flags += ",non-fission";
      }

      // When debugging local Web Extension, the toolbox is opened in an
      // always foremost top level window in order to be kept visible
      // when interacting with the Firefox Window.
      if (this.options?.alwaysOnTop) {
        flags += ",alwaysontop";
      }

      const win = Services.ww.openWindow(
        null,
        this.WINDOW_URL,
        "_blank",
        flags,
        null
      );

      const frameLoad = () => {
        win.removeEventListener("load", frameLoad, true);
        win.focus();

        this.frame = createDevToolsFrame(win.document, "window-host");
        win.document
          .getElementById("devtools-toolbox-window")
          .appendChild(this.frame);
        this.frame.docShellIsActive = true;

        // The forceOwnRefreshDriver attribute is set to avoid Windows only issues with
        // CSS transitions when switching from docked to window hosts.
        // Added in Bug 832920, should be reviewed in Bug 1542468.
        this.frame.setAttribute("forceOwnRefreshDriver", "");
        resolve(this.frame);
      };

      win.addEventListener("load", frameLoad, true);
      win.addEventListener("unload", this._boundUnload);

      this._window = win;
    });
  }

  /**
   * Catch the user closing the window.
   */
  _boundUnload(event) {
    if (event.target.location != this.WINDOW_URL) {
      return;
    }
    this._window.removeEventListener("unload", this._boundUnload);

    this.emit("window-closed");
  }

  /**
   * Raise the host.
   */
  raise() {
    this._window.focus();
  }

  /**
   * Set the toolbox title.
   */
  setTitle(title) {
    this._window.document.title = title;
  }

  /**
   * Destroy the window.
   */
  destroy() {
    if (!this._destroyed) {
      this._destroyed = true;

      this._window.removeEventListener("unload", this._boundUnload);
      this._window.close();
    }

    return Promise.resolve(null);
  }
}

/**
 * Host object for the Browser Toolbox
 */
class BrowserToolboxHost extends EventEmitter {
  constructor(hostTab, options) {
    super();

    this.doc = options.doc;
  }

  type = "browsertoolbox";

  createElements() {
    this.frame = createDevToolsFrame(this.doc, "browsertoolbox-host");

    this.doc.body.appendChild(this.frame);
  }

  async finalizeCreation() {
    this.frame.docShellIsActive = true;
  }

  /**
   * Raise the host.
   */
  raise() {
    this.doc.defaultView.focus();
  }

  /**
   * Set the toolbox title.
   */
  setTitle(title) {
    this.doc.title = title;
  }

  // Do nothing. The BrowserToolbox is destroyed by quitting the application.
  destroy() {
    return Promise.resolve(null);
  }
}

/**
 * Host object for the toolbox as a page.
 * This is typically used by `about:debugging`, when opening toolbox in a new tab,
 * via `about:devtools-toolbox` URLs.
 * The `iframe` ends up being the tab's browser element.
 */
class PageHost {
  constructor(hostTab, options) {
    this.frame = options.customIframe;
  }

  type = "page";

  createElements() {}
  async finalizeCreation() {}

  // Focus the tab owning the browser element.
  raise() {
    // See @constructor, for the page host, the frame is also the browser
    // element.
    focusTab(this.frame.documentGlobal.gBrowser.getTabForBrowser(this.frame));
  }

  // Do nothing.
  setTitle() {}

  // Do nothing.
  destroy() {
    return Promise.resolve(null);
  }
}

/**
 *  Switch to the given tab in a browser and focus the browser window
 */
function focusTab(tab) {
  const browserWindow = tab.documentGlobal;
  browserWindow.focus();
  browserWindow.gBrowser.selectedTab = tab;
}

/**
 * Create an iframe that can be used to load DevTools via about:devtools-toolbox.
 *
 * @property {Document} doc
 * @property {string} className: A class that will be added to the iframe element
 * @returns {XULFrameElement}
 */
function createDevToolsFrame(doc, className) {
  const frame = doc.createXULElement("browser");
  frame.setAttribute("type", "content");
  frame.style.flex = "1 auto"; // Required to be able to shrink when the window shrinks
  frame.classList.add("devtools-toolbox-iframe", className);

  const inXULDocument = doc.documentElement.namespaceURI === XUL_NS;
  if (inXULDocument) {
    // When the toolbox frame is loaded in a XUL document, tooltips rely on a
    // special XUL <tooltip id="aHTMLTooltip"> element.
    // This attribute should not be set when the frame is loaded in a HTML
    // document (for instance: Browser Toolbox).
    frame.tooltip = "aHTMLTooltip";
  }

  // Allows toggling the `docShellIsActive` attribute
  frame.setAttribute("manualactiveness", "true");
  return frame;
}

exports.Hosts = {
  bottom: BottomHost,
  left: LeftHost,
  right: RightHost,
  window: WindowHost,
  browsertoolbox: BrowserToolboxHost,
  page: PageHost,
};
