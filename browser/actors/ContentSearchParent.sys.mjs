/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
});

/**
 * @import {SearchEngine} from "moz-src:///toolkit/components/search/SearchEngine.sys.mjs"
 */

const SEARCH_ENGINE_PLACEHOLDER_ICON =
  "chrome://browser/skin/search-engine-placeholder.png";

// Set of all ContentSearch actors, used to broadcast messages to all of them.
let gContentSearchActors = new Set();

/**
 * Inbound messages have the following types:
 *
 * GetEngine
 *   Requests to get the current engine. Responds with ``Engine``.
 * GetHandoffSearchModePrefs
 *   Requests to find out if the handoff will hand off into search mode or not.
 *   Responds with ``HandoffSearchModePrefs``.
 * SearchHandoff
 *   Hands off a search to the address bar. No response.
 *
 * Outbound messages have the following types:
 *
 *   CurrentEngine
 *     Broadcast when the current engine changes.
 *     data: see _currentEngineObj
 */

export let ContentSearch = {
  initialized: false,

  // Inbound events are queued and processed in FIFO order instead of handling
  // them immediately, which would result in non-FIFO responses due to the
  // asynchrononicity added by converting image data URIs to ArrayBuffers.
  _eventQueue: [],
  _currentEventPromise: null,

  // Resolved when we finish shutting down.
  _destroyedPromise: null,

  init() {
    if (!this.initialized) {
      Services.obs.addObserver(this, "browser-search-engine-modified");
      Services.obs.addObserver(this, "shutdown-leaks-before-check");
      lazy.UrlbarPrefs.addObserver(this);

      this.initialized = true;
    }
  },

  destroy() {
    if (!this.initialized) {
      return new Promise();
    }

    if (this._destroyedPromise) {
      return this._destroyedPromise;
    }

    Services.obs.removeObserver(this, "browser-search-engine-modified");
    Services.obs.removeObserver(this, "shutdown-leaks-before-check");

    this._eventQueue.length = 0;
    this._destroyedPromise = Promise.resolve(this._currentEventPromise);
    return this._destroyedPromise;
  },

  observe(subj, topic, data) {
    switch (topic) {
      case "browser-search-engine-modified":
        this._eventQueue.push({
          type: "Observe",
          data,
        });
        this._processEventQueue();
        break;
      case "shutdown-leaks-before-check":
        subj.wrappedJSObject.client.addBlocker(
          "ContentSearch: Wait until the service is destroyed",
          () => this.destroy()
        );
        break;
    }
  },

  /**
   * Observes changes in prefs tracked by UrlbarPrefs.
   *
   * @param {string} pref
   *   The name of the pref, relative to `browser.urlbar.` if the pref is
   *   in that branch.
   */
  onPrefChanged(pref) {
    if (lazy.UrlbarPrefs.shouldHandOffToSearchModePrefs.includes(pref)) {
      this._eventQueue.push({
        type: "Observe",
        data: "shouldHandOffToSearchMode",
      });
      this._processEventQueue();
    }
  },

  /**
   * Construct a state object representing the search engine state.
   *
   * @returns {object} state
   */
  async currentStateObj() {
    let state = {
      engines: [],
      currentEngine: await this._currentEngineObj(false),
      currentPrivateEngine: await this._currentEngineObj(true),
    };

    for (let engine of await lazy.SearchService.getVisibleEngines()) {
      state.engines.push({
        name: engine.name,
        iconData: await this._getEngineIconURL(engine),
        hidden: engine.hideOneOffButton,
        isConfigEngine: engine.isConfigEngine,
      });
    }

    return state;
  },

  _processEventQueue() {
    if (this._currentEventPromise || !this._eventQueue.length) {
      return;
    }

    let event = this._eventQueue.shift();

    this._currentEventPromise = (async () => {
      try {
        await this["_on" + event.type](event);
      } catch (err) {
        console.error(err);
      } finally {
        this._currentEventPromise = null;

        this._processEventQueue();
      }
    })();
  },

  async _onMessage(eventItem) {
    let methodName = "_onMessage" + eventItem.name;
    if (methodName in this) {
      await this._initService();
      await this[methodName](eventItem);
      eventItem.browser.removeEventListener("SwapDocShells", eventItem, true);
    }
  },

  async _onMessageGetEngine({ actor }) {
    let state = await this.currentStateObj();
    let { usePrivateBrowsing } = actor.browsingContext;
    return this._reply(actor, "Engine", {
      isPrivateEngine: usePrivateBrowsing,
      engine: usePrivateBrowsing
        ? state.currentPrivateEngine
        : state.currentEngine,
    });
  },

  _onMessageGetHandoffSearchModePrefs({ actor }) {
    this._reply(
      actor,
      "HandoffSearchModePrefs",
      lazy.UrlbarPrefs.get("shouldHandOffToSearchMode")
    );
  },

  _onMessageSearchHandoff({ browser, data, actor }) {
    let win = browser.ownerGlobal;
    let text = data.text;
    let urlBar = win.gURLBar;
    let inPrivateBrowsing = lazy.PrivateBrowsingUtils.isBrowserPrivate(browser);
    let searchEngine = inPrivateBrowsing
      ? lazy.SearchService.defaultPrivateEngine
      : lazy.SearchService.defaultEngine;
    let isFirstChange = true;

    // It's possible that this is a handoff from about:home / about:newtab,
    // in which case we want to include the newtab_session_id in our call to
    // urlBar.handoff. We have to jump through some unfortunate hoops to get
    // that.
    let newtabSessionId = null;
    let newtabActor =
      browser.browsingContext?.currentWindowGlobal?.getExistingActor(
        "AboutNewTab"
      );
    if (newtabActor) {
      const portID = newtabActor.getTabDetails()?.portID;
      if (portID) {
        newtabSessionId = lazy.AboutNewTab.activityStream.store.feeds
          .get("feeds.telemetry")
          ?.sessions.get(portID)?.session_id;
      }
    }

    if (!text) {
      urlBar.setHiddenFocus();
    } else {
      // Pass the provided text to the awesomebar
      urlBar.handoff(text, searchEngine, newtabSessionId);
      isFirstChange = false;
    }

    let checkFirstChange = () => {
      // Check if this is the first change since we hidden focused. If it is,
      // remove hidden focus styles, prepend the search alias and hide the
      // in-content search.
      if (isFirstChange) {
        isFirstChange = false;
        urlBar.removeHiddenFocus(true);
        urlBar.handoff("", searchEngine, newtabSessionId);
        actor.sendAsyncMessage("DisableSearch");
        urlBar.removeEventListener("compositionstart", checkFirstChange);
        urlBar.removeEventListener("paste", checkFirstChange);
      }
    };

    let onKeydown = ev => {
      // Check if the keydown will cause a value change.
      if (ev.key.length === 1 && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
        checkFirstChange();
      }
      // If the Esc button is pressed, we are done. Show in-content search and cleanup.
      if (ev.key === "Escape") {
        onDone();
      }
    };

    let onDone = ev => {
      // We are done. Show in-content search again and cleanup.
      const forceSuppressFocusBorder = ev?.type === "mousedown";
      urlBar.removeHiddenFocus(forceSuppressFocusBorder);

      urlBar.removeEventListener("keydown", onKeydown);
      urlBar.removeEventListener("mousedown", onDone);
      urlBar.removeEventListener("blur", onDone);
      urlBar.removeEventListener("compositionstart", checkFirstChange);
      urlBar.removeEventListener("paste", checkFirstChange);

      actor.sendAsyncMessage("ShowSearch");
    };

    urlBar.addEventListener("keydown", onKeydown);
    urlBar.addEventListener("mousedown", onDone);
    urlBar.addEventListener("blur", onDone);
    urlBar.addEventListener("compositionstart", checkFirstChange);
    urlBar.addEventListener("paste", checkFirstChange);
  },

  async _onObserve(eventItem) {
    let engine;
    switch (eventItem.data) {
      case "engine-default":
        engine = await this._currentEngineObj(false);
        this._broadcast("CurrentEngine", engine);
        break;
      case "engine-default-private":
        engine = await this._currentEngineObj(true);
        this._broadcast("CurrentPrivateEngine", engine);
        break;
      case "shouldHandOffToSearchMode":
        this._broadcast(
          "HandoffSearchModePrefs",
          lazy.UrlbarPrefs.get("shouldHandOffToSearchMode")
        );
        break;
    }
  },

  _reply(actor, type, data) {
    actor.sendAsyncMessage(type, data);
  },

  _broadcast(type, data) {
    for (let actor of gContentSearchActors) {
      actor.sendAsyncMessage(type, data);
    }
  },

  async _currentEngineObj(usePrivate) {
    let engine = usePrivate
      ? await lazy.SearchService.getDefaultPrivate()
      : await lazy.SearchService.getDefault();
    return {
      name: engine.name,
      iconData: await this._getEngineIconURL(engine),
      isConfigEngine: engine.isConfigEngine,
    };
  },

  /**
   * Used in _getEngineIconURL
   *
   * @typedef {object} iconData
   * @property {ArrayBuffer|string} icon
   *   The icon data in an ArrayBuffer or a placeholder icon string.
   * @property {string|null} mimeType
   *   The MIME type of the icon.
   */

  /**
   * Converts the engine's icon into a URL or an ArrayBuffer for passing to the
   * content process.
   *
   * @param {SearchEngine} engine
   *   The engine to get the icon for.
   * @returns {string|iconData}
   *   The icon's URL or an iconData object containing the icon data.
   */
  async _getEngineIconURL(engine) {
    let url = await engine.getIconURL();
    if (!url) {
      return SEARCH_ENGINE_PLACEHOLDER_ICON;
    }

    // The uri received here can be one of several types:
    // 1 - moz-extension://[uuid]/path/to/icon.ico
    // 2 - data:image/x-icon;base64,VERY-LONG-STRING
    // 3 - blob:
    //
    // For moz-extension URIs we can pass the URI to the content process and
    // use it directly as they can be accessed from there and it is cheaper.
    //
    // For blob URIs the content process is a different scope and we can't share
    // the blob with that scope. Hence we have to create a copy of the data.
    //
    // For data: URIs we convert to an ArrayBuffer as that is more optimal for
    // passing the data across to the content process. This is passed to the
    // 'icon' field of the return object. The object also receives the
    // content-type of the URI, which is passed to its 'mimeType' field.
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      return url;
    }

    try {
      const response = await fetch(url);
      const mimeType = response.headers.get("Content-Type") || "";
      const data = await response.arrayBuffer();
      return { icon: data, mimeType };
    } catch (err) {
      console.error("Fetch error: ", err);
      return SEARCH_ENGINE_PLACEHOLDER_ICON;
    }
  },

  _initService() {
    if (!this._initServicePromise) {
      this._initServicePromise = lazy.SearchService.init();
    }
    return this._initServicePromise;
  },
};

export class ContentSearchParent extends JSWindowActorParent {
  constructor() {
    super();
    ContentSearch.init();
    gContentSearchActors.add(this);
  }

  didDestroy() {
    gContentSearchActors.delete(this);
  }

  receiveMessage(msg) {
    // Add a temporary event handler that exists only while the message is in
    // the event queue.  If the message's source docshell changes browsers in
    // the meantime, then we need to update the browser.  event.detail will be
    // the docshell's new parent <xul:browser> element.
    let browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      // The associated browser has gone away, so there's nothing more we can
      // do here.
      return;
    }
    let eventItem = {
      type: "Message",
      name: msg.name,
      data: msg.data,
      browser,
      actor: this,
      handleEvent: event => {
        browser.removeEventListener("SwapDocShells", eventItem, true);
        eventItem.browser = event.detail;
        eventItem.browser.addEventListener("SwapDocShells", eventItem, true);
      },
    };
    browser.addEventListener("SwapDocShells", eventItem, true);

    ContentSearch._eventQueue.push(eventItem);
    ContentSearch._processEventQueue();
  }
}
