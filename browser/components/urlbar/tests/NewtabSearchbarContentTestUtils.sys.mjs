/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

import { UrlbarInputBaseTestUtils } from "resource://testing-common/UrlbarTestUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ContentTaskUtils: "resource://testing-common/ContentTaskUtils.sys.mjs",
});

/**
 * Drives the `<moz-urlbar>` that New Tab's component registry mounts on
 * about:newtab. The element lives in the page's realm in a privilegedabout
 * content process, so this runs in a `SpecialPowers.spawn` task there, where
 * the element is reachable without crossing a process boundary.
 * `NewtabSearchbarTestUtils` is the parent-side facade tests call; this is what it
 * forwards to.
 *
 * Where the inherited methods take a chrome window, the ones here take the
 * task's `content`. The chrome-only ones this class excludes outright.
 */
class NewtabContentTestUtils extends UrlbarInputBaseTestUtils {
  constructor() {
    // An Xray hides the element's plain JS properties, and the waiver
    // propagates through every property read off it.
    super(win => Cu.waiveXrays(win.document.querySelector("moz-urlbar")));
  }

  /**
   * @see UrlbarInputBaseTestUtils.addControllerListener
   * @param {UrlbarChildController} controller
   * @param {object} listener
   * @returns {object}
   */
  addControllerListener(controller, listener) {
    // The controller reads `listener[notification]` from the page's realm,
    // where a system-principal object is opaque and every property reads as
    // undefined, so the listener would be skipped and the promise never
    // resolve.
    let exposed = Cu.cloneInto(listener, this.contentWindow, {
      cloneFunctions: true,
    });
    controller.addListener(exposed);
    return exposed;
  }

  /**
   * The window holding the element, for the duration of a {@link run} task.
   *
   * @type {Window}
   */
  contentWindow = null;

  /**
   * Runs a task against the newtab address bar, taking the assertion and event
   * helpers it needs from the task's own globals.
   * {@link NewtabSearchbarTestUtils.spawn} is how a test gets here.
   *
   * @param {() => any} fn
   * @returns {Promise<any>}
   *   What `fn` returns.
   */
  async run(fn) {
    let scope = Cu.getGlobalForObject(fn);
    this.contentWindow = scope.content;
    try {
      return await this.withScope(
        // Focusing the window is the parent side's business, and the tab is
        // foreground by the time a task runs.
        { SimpleTest: { promiseFocus: () => Promise.resolve() }, ...scope },
        fn
      );
    } finally {
      this.contentWindow = null;
    }
  }

  /**
   * What the bar is showing, in one round trip. `viewOpen` is the state the
   * view keeps, `viewVisible` whether it is painted; the element stays in the
   * top layer between queries, so the two can disagree.
   *
   * @param {ChromeWindow} win
   * @returns {{focused: boolean, value: string, viewOpen: boolean,
   *   viewVisible: boolean}}
   */
  getState(win) {
    let bar = this.getUrlbar(win);
    return {
      focused: bar.focused,
      value: bar.value,
      viewOpen: bar.view.isOpen,
      viewVisible: bar.view.panel.checkVisibility(),
    };
  }

  /**
   * {@link UrlbarInputBaseTestUtils.promiseAutocompleteResultPopup} with the
   * window as its own argument, which is the shape a forwarded call arrives in.
   * The query context stays here; what the query produced is readable through
   * the other methods.
   *
   * @param {ChromeWindow} win
   * @param {object} options
   *   As that method takes them, minus `window`.
   */
  async search(win, options) {
    await this.promiseAutocompleteResultPopup({ ...options, window: win });
  }

  /**
   * Takes focus off the bar, as clicking elsewhere in the page would.
   *
   * @param {ChromeWindow} win
   */
  blur(win) {
    this.getUrlbar(win).blur();
  }

  /**
   * Waits for the results view to open, whatever opened it.
   * `promisePopupOpen` insists on being given the thing that opens it.
   *
   * @param {ChromeWindow} win
   */
  waitForResults(win) {
    return this.promisePopupOpen(win, () => {});
  }

  /**
   * Waits for the results view to close, leaving whatever closes it alone.
   * `promisePopupClose` closes it itself when given no closer.
   *
   * @param {ChromeWindow} win
   */
  async waitForViewClosed(win) {
    let bar = this.getUrlbar(win);
    if (!bar.view.isOpen) {
      return;
    }
    await new Promise(resolve => {
      this.addControllerListener(bar.controller, {
        onViewClose() {
          bar.controller.removeListener(this);
          resolve();
        },
      });
    });
  }

  /**
   * {@link UrlbarInputBaseTestUtils.getDetailsOfResultAt} in a form that
   * survives a structured clone: the result travels as its wire form, and the
   * live nodes are dropped in favour of what `displayed` says they showed.
   *
   * @param {ChromeWindow} win
   * @param {number} index
   * @returns {Promise<object>}
   */
  async snapshotDetailsOfResultAt(win, index) {
    let details = await this.getDetailsOfResultAt(win, index);
    return { ...details, result: details.result.toWire(), element: null };
  }

  /**
   * Waits for the favicon of the row showing a given title, which arrives after
   * the row itself, and reports whether it loaded.
   *
   * @param {ChromeWindow} win
   * @param {string} title
   * @param {object} until
   *   Which src to wait for: `{ src }` for that one, `{ notSrc }` for anything
   *   but.
   * @param {string} [until.src]
   * @param {string} [until.notSrc]
   * @returns {Promise<{src: string, loaded: boolean}>}
   */
  async waitForRowIcon(win, title, until) {
    let img = await lazy.ContentTaskUtils.waitForCondition(() => {
      let row = [
        ...this.getUrlbar(win).querySelectorAll(".urlbarView-row"),
      ].find(r => r.textContent.includes(title));
      let candidate = row?.querySelector("img.urlbarView-favicon");
      let matches =
        candidate &&
        (until.src
          ? candidate.src == until.src
          : candidate.src != until.notSrc);
      return matches ? candidate : false;
    }, `waiting for the icon of the row titled "${title}"`);
    if (!img.complete) {
      await new Promise(resolve => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }
    return { src: img.src, loaded: img.naturalWidth > 0 };
  }

  /**
   * @returns {never}
   */
  getUrlbarShared() {
    throw new Error(
      "getUrlbarShared is parent-only: a content window has no ChromeUtils, " +
        "and this sandbox's own copy is not the one the page calls into."
    );
  }

  /**
   * A stub installed on this sandbox's copy leaves the page's untouched, so it
   * would pass while testing nothing.
   *
   * @returns {never}
   */
  stubNowZonedDateTime() {
    throw new Error("stubNowZonedDateTime is parent-only");
  }

  /**
   * @returns {never}
   */
  stubFirstDayOfWeek() {
    throw new Error("stubFirstDayOfWeek is parent-only");
  }
}

export var NewtabSearchbarContentTestUtils = new NewtabContentTestUtils();
