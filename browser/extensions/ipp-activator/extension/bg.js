/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global browser, ConditionFactory */

/**
 * The main class for the IPP activator add-on.
 */
class IPPAddonActivator {
  #initialized = false;

  #tabBaseBreakages;
  #webrequestBaseBreakages;

  #tabBreakages;
  #webrequestBreakages;

  #pendingTabs = new Set(); // pending due to tab URL change while inactive
  #pendingWebRequests = new Map(); // tabId -> Set of pending request URLs
  #shownDomainByTab = new Map(); // tabId -> baseDomain of currently shown notification

  constructor() {
    this.tabUpdated = this.#tabUpdated.bind(this);
    this.tabActivated = this.#tabActivated.bind(this);
    this.tabRemoved = this.#tabRemoved.bind(this);
    this.onRequest = this.#onRequest.bind(this);

    browser.ippActivator.isTesting().then(async isTesting => {
      await this.#loadAndRebuildBreakages();
      browser.ippActivator.onDynamicTabBreakagesUpdated.addListener(() =>
        this.#loadAndRebuildBreakages()
      );
      browser.ippActivator.onDynamicWebRequestBreakagesUpdated.addListener(() =>
        this.#loadAndRebuildBreakages()
      );

      if (isTesting) {
        this.#init();
        return;
      }

      // Initialize only when IPP is active, keep in sync with activation.
      if (await browser.ippActivator.isIPPActive()) {
        this.#init();
      }

      // IPP start event: initialize when service starts.
      browser.ippActivator.onIPPActivated.addListener(async () => {
        if (await browser.ippActivator.isIPPActive()) {
          this.#init();
        } else {
          this.#uninit();
        }
      });
    });
  }

  async #init() {
    if (this.#initialized) {
      return;
    }

    // Register only the listeners that are needed for existing breakages.
    this.#registerListeners();

    this.#initialized = true;
  }

  async #uninit() {
    if (!this.#initialized) {
      return;
    }

    this.#unregisterListeners();

    const ids = Array.from(this.#shownDomainByTab.keys());
    await Promise.allSettled(
      ids.map(id => browser.ippActivator.hideMessage(id))
    );

    this.#shownDomainByTab.clear();

    this.#initialized = false;
  }

  async #loadAndRebuildBreakages() {
    if (!this.#tabBaseBreakages) {
      try {
        const url = browser.runtime.getURL("breakages/tab.json");
        const res = await fetch(url);
        const base = await res.json();
        this.#tabBaseBreakages = Array.isArray(base) ? base : [];
      } catch (e) {
        this.#tabBaseBreakages = [];
      }
    }

    if (!this.#webrequestBaseBreakages) {
      try {
        const url = browser.runtime.getURL("breakages/webrequest.json");
        const res = await fetch(url);
        const base = await res.json();
        this.#webrequestBaseBreakages = Array.isArray(base) ? base : [];
      } catch (e) {
        this.#webrequestBaseBreakages = [];
      }
    }

    let dynamicTab = [];
    try {
      const dynT = await browser.ippActivator.getDynamicTabBreakages();
      dynamicTab = Array.isArray(dynT) ? dynT : [];
    } catch (_) {
      console.warn("Unable to retrieve dynamicTabBreakages");
    }

    let dynamicWr = [];
    try {
      const dynW = await browser.ippActivator.getDynamicWebRequestBreakages();
      dynamicWr = Array.isArray(dynW) ? dynW : [];
    } catch (_) {
      console.warn("Unable to retrieve dynamicWebRequestBreakages");
    }

    this.#tabBreakages = [...(this.#tabBaseBreakages || []), ...dynamicTab];
    this.#webrequestBreakages = [
      ...(this.#webrequestBaseBreakages || []),
      ...dynamicWr,
    ];

    // Adjust listeners if we've already initialized.
    if (this.#initialized) {
      this.#registerListeners();
    }
  }

  #registerListeners() {
    this.#unregisterListeners();

    const needTabUpdated =
      Array.isArray(this.#tabBreakages) && !!this.#tabBreakages.length;
    const needWebRequest =
      Array.isArray(this.#webrequestBreakages) &&
      !!this.#webrequestBreakages.length;
    const needActivation = needTabUpdated || needWebRequest;

    // tabs.onUpdated (only if there are tab breakages)
    if (needTabUpdated) {
      browser.tabs.onUpdated.addListener(this.tabUpdated, {
        properties: ["url", "status"],
      });
    }

    // webRequest.onBeforeRequest (only if there are webRequest breakages)
    if (needWebRequest) {
      browser.webRequest.onBeforeRequest.addListener(
        this.onRequest,
        {
          urls: ["<all_urls>"],
          types: ["media", "sub_frame", "xmlhttprequest"],
        },
        []
      );
    }

    // tabs.onActivated and tabs.onRemoved are needed when either above is needed
    if (needActivation) {
      browser.tabs.onActivated.addListener(this.tabActivated);
      browser.tabs.onRemoved.addListener(this.tabRemoved);
    }
  }

  #unregisterListeners() {
    if (browser.tabs.onUpdated.hasListener(this.tabUpdated)) {
      browser.tabs.onUpdated.removeListener(this.tabUpdated);
    }

    if (browser.tabs.onActivated.hasListener(this.tabActivated)) {
      browser.tabs.onActivated.removeListener(this.tabActivated);
    }

    if (browser.tabs.onRemoved.hasListener(this.tabRemoved)) {
      browser.tabs.onRemoved.removeListener(this.tabRemoved);
    }

    if (browser.webRequest.onBeforeRequest.hasListener(this.onRequest)) {
      browser.webRequest.onBeforeRequest.removeListener(this.onRequest);
    }

    this.#pendingTabs.clear();
    this.#pendingWebRequests.clear();
  }

  async #tabUpdated(tabId, changeInfo, tab) {
    // React only to URL changes and to load completion; avoid showing during 'loading'
    if (!("url" in changeInfo) && changeInfo.status !== "complete") {
      return;
    }

    // If the tab URL changed, reset any pending web requests for this tab
    if ("url" in changeInfo) {
      try {
        // If we had a notification for a different base domain, hide it
        const info = await browser.ippActivator.getBaseDomainFromURL(
          changeInfo.url || tab?.url || ""
        );
        const shownBase = this.#shownDomainByTab.get(tabId);
        if (shownBase && shownBase !== info.baseDomain) {
          await browser.ippActivator.hideMessage(tabId);
          this.#shownDomainByTab.delete(tabId);
        }
      } catch (_) {
        // ignore lookup issues
      }
      this.#pendingWebRequests.delete(tabId);
    }

    // If we haven't reached load completion yet, wait for later events
    if (changeInfo.status && changeInfo.status !== "complete") {
      if (!tab.active) {
        this.#pendingTabs.add(tabId);
      }
      return;
    }

    // At this point, either the URL changed and load already completed, or
    // we received the 'complete' status: handle only if tab is active
    if (!tab.active) {
      this.#pendingTabs.add(tabId);
      return;
    }

    await this.#maybeNotify(tab, this.#tabBreakages, tab.url);
  }

  async #tabActivated(activeInfo) {
    const { tabId } = activeInfo || {};

    const hadTabPending = this.#pendingTabs.has(tabId);
    const wrSet = this.#pendingWebRequests.get(tabId);
    const pendingWrUrls = wrSet ? Array.from(wrSet) : [];
    if (!hadTabPending && pendingWrUrls.length === 0) {
      return;
    }

    this.#pendingTabs.delete(tabId);
    this.#pendingWebRequests.delete(tabId);

    let tab;
    try {
      tab = await browser.tabs.get(tabId);
      if (!tab || !tab.active) {
        return;
      }
    } catch (_) {
      // Tab might have been closed; ignore.
      return;
    }

    if (
      hadTabPending &&
      (await this.#maybeNotify(tab, this.#tabBreakages, tab.url))
    ) {
      return;
    }

    for (const url of pendingWrUrls) {
      if (await this.#maybeNotify(tab, this.#webrequestBreakages, url)) {
        return;
      }
    }
  }

  async #maybeNotify(tab, breakages, url) {
    const info = await browser.ippActivator.getBaseDomainFromURL(url);
    if (!info.baseDomain && !info.host) {
      return false;
    }

    // Do not show the same notification again for the same base domain.
    const shown = await browser.ippActivator.getNotifiedDomains();
    if (
      info.baseDomain &&
      Array.isArray(shown) &&
      shown.includes(info.baseDomain)
    ) {
      return false;
    }

    const breakage = breakages.find(
      b =>
        Array.isArray(b.domains) &&
        (b.domains.includes(info.baseDomain) || b.domains.includes(info.host))
    );
    if (!breakage) {
      return false;
    }

    if (
      !(await ConditionFactory.run(breakage.condition, { tabId: tab.id, url }))
    ) {
      return false;
    }

    await browser.ippActivator.showMessage(breakage.message, tab.id);
    // Track which base domain this tab is showing a notification for
    this.#shownDomainByTab.set(tab.id, info.baseDomain);

    await browser.ippActivator.addNotifiedDomain(info.baseDomain);

    return true;
  }

  async #onRequest(details) {
    if (
      typeof details.tabId !== "number" ||
      details.tabId < 0 ||
      !details.url
    ) {
      return;
    }

    try {
      const tab = await browser.tabs.get(details.tabId);
      if (!tab) {
        return;
      }

      if (tab.active) {
        await this.#maybeNotify(tab, this.#webrequestBreakages, details.url);
      } else {
        const set = this.#pendingWebRequests.get(details.tabId) || new Set();
        set.add(details.url);

        this.#pendingWebRequests.set(details.tabId, set);
      }
    } catch (_) {
      // tab may not exist
    }
  }

  async #tabRemoved(tabId, _removeInfo) {
    // Clean up any pending state associated with the closed tab
    this.#pendingTabs.delete(tabId);
    this.#pendingWebRequests.delete(tabId);
    this.#shownDomainByTab.delete(tabId);
  }
}

/* This object is kept alive by listeners */
new IPPAddonActivator();
