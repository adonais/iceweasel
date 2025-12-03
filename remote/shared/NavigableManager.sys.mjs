/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowsingContextListener:
    "chrome://remote/content/shared/listeners/BrowsingContextListener.sys.mjs",
  generateUUID: "chrome://remote/content/shared/UUID.sys.mjs",
  TabManager: "chrome://remote/content/shared/TabManager.sys.mjs",
});

/**
 * The navigable manager is intended to be used as a singleton and is
 * responsible for tracking open browsing contexts by assigning each a
 * unique identifier. This allows them to be referenced unambiguously.
 * For top-level browsing contexts, the content browser instance itself
 * is used as the anchor, since cross-origin navigations can result in
 * browsing context replacements. Using the browser as a stable reference
 * ensures that protocols like WebDriver BiDi and Marionette can reliably
 * point to the intended "navigable" — a concept from the HTML specification
 * that is not implemented in Firefox.
 */
class NavigableManagerClass {
  #tracking;
  #browserIds;
  #contextListener;
  #navigableIds;

  constructor() {
    this.#tracking = false;

    // Maps browser's `permanentKey` to an uuid: WeakMap.<Object, string>
    //
    // It's required as a fallback, since in the case when a context was
    // discarded embedderElement is gone, and we cannot retrieve the
    // context id from the formerly known browser.
    this.#browserIds = new WeakMap();

    // Maps browsing contexts to uuid: WeakMap.<BrowsingContext, string>.
    this.#navigableIds = new WeakMap();

    // Start tracking by default when the class gets instantiated.
    this.startTracking();
  }

  /**
   * Retrieve the browser element corresponding to the provided unique id,
   * previously generated via getIdForBrowser.
   *
   * TODO: To avoid creating strong references on browser elements and
   * potentially leaking those elements, this method loops over all windows and
   * all tabs. It should be replaced by a faster implementation in Bug 1750065.
   *
   * @param {string} id
   *     A browser unique id created by getIdForBrowser.
   *
   * @returns {XULBrowser}
   *     The <xul:browser> corresponding to the provided id. Will return
   *     `null` if no matching browser element is found.
   */
  getBrowserById(id) {
    for (const tab of lazy.TabManager.allTabs) {
      const contentBrowser = lazy.TabManager.getBrowserForTab(tab);
      if (this.getIdForBrowser(contentBrowser) == id) {
        return contentBrowser;
      }
    }

    return null;
  }

  /**
   * Retrieve the browsing context corresponding to the provided navigabl id.
   *
   * @param {string} id
   *     A browsing context unique id (created by getIdForBrowsingContext).
   *
   * @returns {BrowsingContext=}
   *     The browsing context found for this id, null if none was found or
   *     browsing context is discarded.
   */
  getBrowsingContextById(id) {
    let browsingContext;

    const browser = this.getBrowserById(id);
    if (browser) {
      // top-level browsing context
      browsingContext = browser.browsingContext;
    } else {
      browsingContext = BrowsingContext.get(id);
    }

    if (!browsingContext || browsingContext.isDiscarded) {
      return null;
    }

    return browsingContext;
  }

  /**
   * Retrieve the unique id for the given xul browser element. The id is a
   * dynamically generated uuid associated with the permanentKey property of the
   * given browser element. This method is preferable over getIdForBrowsingContext
   * in case of working with browser element of a tab, since we can not guarantee
   * that browsing context is attached to it.
   *
   * @param {XULBrowser} browser
   *     The <xul:browser> for which we want to retrieve the id.
   *
   * @returns {string|null}
   *     The unique id for this browser or `null` if invalid.
   */
  getIdForBrowser(browser) {
    if (!(XULElement.isInstance(browser) && browser.permanentKey)) {
      // Ignore those browsers that do not have a permanentKey
      // attached like the print preview (bug 1990485), but which
      // we need to uniquely identify a top-level browsing context.
      return null;
    }

    const key = browser.permanentKey;
    if (!this.#browserIds.has(key)) {
      this.#browserIds.set(key, lazy.generateUUID());
    }
    return this.#browserIds.get(key);
  }

  /**
   * Retrieve the id of a Browsing Context.
   *
   * For a top-level browsing context a custom unique id will be returned.
   *
   * @param {BrowsingContext=} browsingContext
   *     The browsing context to get the id from.
   *
   * @returns {string|null}
   *     The unique id of the browsing context or `null` if invalid.
   */
  getIdForBrowsingContext(browsingContext) {
    if (!BrowsingContext.isInstance(browsingContext)) {
      return null;
    }

    if (!browsingContext.parent) {
      // For top-level browsing contexts always try to use the browser
      // as navigable first because it survives a cross-process navigation.
      const browser = this.#getBrowserForBrowsingContext(browsingContext);
      if (browser) {
        return this.getIdForBrowser(browser);
      }

      // If no browser can be found fallback to use the navigable id instead.
      return this.#navigableIds.has(browsingContext)
        ? this.#navigableIds.get(browsingContext)
        : null;
    }

    // Child browsing context (frame)
    return browsingContext.id.toString();
  }

  /**
   * Get the navigable for the given browsing context.
   *
   * Because Gecko doesn't support the Navigable concept in content
   * scope the content browser could be used to uniquely identify
   * top-level browsing contexts.
   *
   * @param {BrowsingContext} browsingContext
   *
   * @returns {BrowsingContext|XULBrowser} The navigable
   *
   * @throws {TypeError}
   *     If `browsingContext` is not a CanonicalBrowsingContext instance.
   */
  getNavigableForBrowsingContext(browsingContext) {
    if (!lazy.TabManager.isValidCanonicalBrowsingContext(browsingContext)) {
      throw new TypeError(
        `Expected browsingContext to be a CanonicalBrowsingContext, got ${browsingContext}`
      );
    }

    if (browsingContext.isContent && browsingContext.parent === null) {
      return this.#getBrowserForBrowsingContext(browsingContext);
    }

    return browsingContext;
  }

  startTracking() {
    if (this.#tracking) {
      return;
    }

    lazy.TabManager.getBrowsers().forEach(browser =>
      this.#setIdForBrowsingContext(browser.browsingContext)
    );

    this.#contextListener = new lazy.BrowsingContextListener();
    this.#contextListener.on("attached", this.#onContextAttached);
    this.#contextListener.startListening();

    this.#tracking = true;
  }

  stopTracking() {
    if (!this.#tracking) {
      return;
    }

    this.#contextListener.stopListening();
    this.#contextListener = null;

    this.#browserIds = new WeakMap();
    this.#navigableIds = new WeakMap();

    this.#tracking = false;
  }

  /** Private methods */

  /**
   * Try to find the browser element to browsing context is attached to.
   *
   * @param {BrowsingContext} browsingContext
   *     The browsing context to find the related browser for.
   *
   * @returns {XULBrowser|null}
   *     The <xul:browser> element, or `null` if no browser exists.
   */
  #getBrowserForBrowsingContext(browsingContext) {
    return browsingContext.top.embedderElement
      ? browsingContext.top.embedderElement
      : null;
  }

  /**
   * Update the internal maps for a new browsing context.
   *
   * @param {BrowsingContext} browsingContext
   *     The browsing context that needs to be observed.
   */
  #setIdForBrowsingContext(browsingContext) {
    const id = this.getIdForBrowsingContext(browsingContext);

    // Add a fallback to the navigable weak map so that an id can
    // also be retrieved when the related browser was closed.
    this.#navigableIds.set(browsingContext, id);
  }

  /** Event handlers */

  #onContextAttached = (_, data = {}) => {
    const { browsingContext } = data;

    if (lazy.TabManager.isValidCanonicalBrowsingContext(browsingContext)) {
      this.#setIdForBrowsingContext(browsingContext);
    }
  };
}

// Expose a shared singleton.
export const NavigableManager = new NavigableManagerClass();
