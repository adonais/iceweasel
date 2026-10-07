/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "logConsole", () =>
  console.createInstance({
    prefix: "MiniWindowChild",
    maxLogLevel: Services.prefs.getBoolPref("browser.mini-window.log", false)
      ? "Debug"
      : "Error",
  })
);

ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
});

// Scrolling fires continuously, so sample it on a timer instead of reading the
// position on every event.
const SCROLL_SAMPLE_MS = 100;

/**
 * Content-side actor for Mini Window.
 */
export class MiniWindowChild extends JSWindowActorChild {
  #lastScrollY = 0;
  #scrollTask = null;

  /**
   * Start reporting upward scrolls to reveal the toolbar.
   */
  #enableScrollReveal() {
    this.#lastScrollY = this.#scrollY();
    this.contentWindow?.addEventListener("scroll", this, {
      capture: true,
      passive: true,
    });
  }

  handleEvent(event) {
    if (event.type === "scroll") {
      this.#scrollTask ??= new lazy.DeferredTask(
        () => this.#onScroll(),
        SCROLL_SAMPLE_MS
      );
      this.#scrollTask.arm();
    }
  }

  /**
   * @returns {number} The window's vertical scroll offset, read without
   *   flushing layout - this runs off a timer, so layout may well be dirty.
   */
  #scrollY() {
    let utils = this.contentWindow?.windowUtils;
    if (!utils) {
      return 0;
    }
    let scrollX = {},
      scrollY = {};
    utils.getScrollXY(false, scrollX, scrollY);
    return scrollY.value;
  }

  /**
   * Called when the content window is scrolled.
   * The parent can't observe scrolling in remote content itself.
   */
  #onScroll() {
    let y = this.#scrollY();
    if (y === this.#lastScrollY) {
      return;
    }
    let up = y < this.#lastScrollY;
    this.#lastScrollY = y;
    this.sendAsyncMessage("Scrolled", { up });
  }

  didDestroy() {
    this.#scrollTask?.disarm();
  }

  receiveMessage(message) {
    switch (message.name) {
      case "EnableScrollReveal":
        this.#enableScrollReveal();
        break;
      case "GetSize":
        return this.#getSize();
      case "ScrollTo":
        this.#scrollTo(message.data);
        break;
    }
    return undefined;
  }

  /**
   * Measures the whole page size.
   *
   * @returns {?{width: number, height: number}} The page size in content CSS
   *   px, or null if the content window is already gone.
   */
  #getSize() {
    let win = this.contentWindow;
    let el = win?.document?.documentElement;
    if (!win || !el) {
      return null;
    }
    let size = {
      width: Math.max(el.scrollWidth, win.innerWidth),
      height: Math.max(el.scrollHeight, win.innerHeight),
    };
    lazy.logConsole.debug("size of original page is ", size);
    return size;
  }

  /**
   * Scroll the content to an absolute position. The parent normalizes scroll
   * to 0,0 before framing, since the framing transform is applied relative to
   * the page origin.
   *
   * @param {object} position - Absolute scroll offset, in content CSS px.
   * @param {number} position.x
   * @param {number} position.y
   */
  #scrollTo({ x, y }) {
    lazy.logConsole.debug("scroll position of original tab is ", { x, y });
    try {
      this.contentWindow?.scrollTo(x, y);
    } catch (e) {
      lazy.logConsole.error("Failed to scroll content", e);
    }
  }
}
