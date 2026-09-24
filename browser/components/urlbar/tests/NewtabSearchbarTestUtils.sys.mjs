/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// The globals a `SpecialPowers.spawn` task runs with.
/* global content, NewtabSearchbarContentTestUtils */

import { UrlbarInputBaseTestUtils } from "resource://testing-common/UrlbarTestUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserTestUtils: "resource://testing-common/BrowserTestUtils.sys.mjs",
  TestUtils: "resource://testing-common/TestUtils.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

const CONTENT_UTILS_URL =
  "resource://testing-common/NewtabSearchbarContentTestUtils.sys.mjs";

/**
 * Methods of `NewtabSearchbarContentTestUtils` that need nothing but their name and
 * their arguments to reach the content process, and whose return value survives
 * a structured clone.
 */
const FORWARDED = [
  "blur",
  "fireInputEvent",
  "getPlaceholderL10n",
  "getResultCount",
  "getSelectedElementIndex",
  "getSelectedRowIndex",
  "getState",
  "inputIntoURLBar",
  "isPopupOpen",
  "promiseSuggestionsPresent",
  "setSelectedRowIndex",
  "waitForResults",
  "waitForRowIcon",
  "waitForViewClosed",
];

/**
 * Drives the `<moz-urlbar>` on about:newtab from a browser-chrome test. The
 * element lives in a content process, so every method here forwards to
 * `NewtabSearchbarContentTestUtils` over one `SpecialPowers.spawn` and takes a
 * `browser` where the chrome utils take a window.
 *
 * A sequence of steps is better spent in one task than a round trip each:
 *
 *     await NewtabSearchbarTestUtils.spawn(browser, [], async () => { ... });
 */
class NewtabTestUtils {
  /**
   * @param {object} scope
   *   The global scope where tests are being run.
   * @param {ChromeWindow} win
   *   The browser window. `SpecialPowers` and `gBrowser` hang off it rather
   *   than off the scope.
   */
  init(scope, win) {
    this.scope = scope;
    this.window = win;
    win.SpecialPowers.addTaskImport(
      "NewtabSearchbarContentTestUtils",
      CONTENT_UTILS_URL
    );
  }

  /**
   * `SpecialPowers.spawn` with `NewtabSearchbarContentTestUtils` set up around
   * the task, so the task can call into it against `content`.
   *
   * @param {MozBrowser} browser
   * @param {any[]} args
   * @param {Function} task
   * @returns {Promise<any>}
   *   What `task` returns.
   */
  spawn(browser, args, task) {
    // `SpecialPowers.spawn` runs the task by stringifying it and evaluating
    // that source in a fresh sandbox, and takes the source location off the
    // same function. Wrapping in `toString` therefore keeps errors pointing at
    // the test, and keeping the wrapper on one line keeps their line numbers.
    let source = String(task);
    task.toString = () =>
      `(...args) => NewtabSearchbarContentTestUtils.run(() => (${source})(...args))`;
    try {
      return this.window.SpecialPowers.spawn(browser, args, task);
    } finally {
      delete task.toString;
    }
  }

  /**
   * Calls one method of the content-side utils. Methods this class doesn't
   * carry can be reached through it, so long as their arguments and their
   * result are both cloneable.
   *
   * @param {MozBrowser} browser
   * @param {string} method
   * @param {any[]} args
   * @returns {Promise<any>}
   */
  forward(browser, method, args) {
    return this.spawn(browser, [method, args], (name, methodArgs) =>
      NewtabSearchbarContentTestUtils[name](content, ...methodArgs)
    );
  }

  /**
   * Opens about:newtab, waits for its address bar to be in the document, and
   * gives the window focus. Focus and blur events only fire while the content
   * document has it, and the bar reacts to those rather than to the active
   * element.
   *
   * @returns {Promise<MozTabbrowserTab>}
   */
  async openNewTabPage() {
    // about:newtab is preloaded, so its load event may already have fired.
    let tab = await lazy.BrowserTestUtils.openNewForegroundTab(
      this.window.gBrowser,
      "about:newtab",
      false
    );
    // Swapping in the preloaded page replaces the frame loader, taking the
    // actor a query is in flight over with it.
    await lazy.TestUtils.waitForCondition(
      () =>
        this.window.SpecialPowers.spawn(
          tab.linkedBrowser,
          [],
          () => !!content.document.querySelector("moz-urlbar")
        ).catch(() => false),
      "waiting for <moz-urlbar> on about:newtab"
    );
    await this.scope.SimpleTest.promiseFocus(tab.linkedBrowser);
    return tab;
  }

  /**
   * Types a value into the bar and waits for the query to finish. The query
   * context stays in the content process; what the query produced is readable
   * through the other methods here.
   *
   * Asserts along the way that the icon of every visible row loads.
   *
   * @param {object} options
   *   As `UrlbarTestUtils.promiseAutocompleteResultPopup` takes them, with
   *   `browser` in place of `window`.
   * @param {MozBrowser} options.browser
   * @param {boolean} [options.expectUnloadableIcons]
   *   Skips the row icon check, for a query whose icons are meant not to load.
   */
  async promiseAutocompleteResultPopup({
    browser,
    expectUnloadableIcons,
    ...options
  }) {
    await this.forward(browser, "search", [options, expectUnloadableIcons]);
  }

  /**
   * The result at an index, its live nodes dropped and its result rebuilt in
   * this process. The url and post data are resolved here too, since a search
   * result's url comes from the search service.
   *
   * @param {MozBrowser} browser
   * @param {number} index
   * @returns {Promise<object>}
   *   As `UrlbarTestUtils.getDetailsOfResultAt` returns it, except that
   *   `element` is null.
   */
  async getDetailsOfResultAt(browser, index) {
    let details = await this.forward(browser, "snapshotDetailsOfResultAt", [
      index,
    ]);
    let result = lazy.UrlbarResult.fromWire(details.result);
    return {
      ...details,
      result,
      ...lazy.UrlbarUtils.getUrlFromResult(result),
    };
  }
}

// Form history is the profile's, reachable from the parent process only.
NewtabTestUtils.prototype.formHistory =
  UrlbarInputBaseTestUtils.prototype.formHistory;

for (let method of FORWARDED) {
  NewtabTestUtils.prototype[method] = function (browser, ...args) {
    return this.forward(browser, method, args);
  };
}

export var NewtabSearchbarTestUtils = new NewtabTestUtils();
