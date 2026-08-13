/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UrlbarShared } from "chrome://browser/content/urlbar/UrlbarShared.mjs";
import { UrlbarChildTelemetry } from "chrome://browser/content/urlbar/UrlbarChildTelemetry.mjs";
import { UrlbarParentControllerProxy } from "chrome://browser/content/urlbar/UrlbarParentControllerProxy.mjs";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  UrlbarParentController:
    "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

/**
 * @import {UrlbarChild} from "../../../actors/UrlbarChild.sys.mjs"
 * @import {UrlbarInput} from "chrome://browser/content/urlbar/UrlbarInput.mjs"
 * @import {UrlbarParentController} from "moz-src:///browser/components/urlbar/UrlbarParentController.sys.mjs"
 * @import {UrlbarView} from "chrome://browser/content/urlbar/UrlbarView.mjs"
 * @import {SmartbarInput} from "moz-src:///browser/components/urlbar/content/SmartbarInput.mjs"
 */

/**
 * The in-process face of the address bar controller. Lives next to the
 * `<moz-urlbar>` custom element and forwards work that has to happen in
 * the parent process to a paired `UrlbarParentController` via the
 * `UrlbarChild`/`UrlbarParent` JSWindowActor pair. The actor owns the
 * per-instance bookkeeping (instance id, lifetime); this wrapper just
 * holds the controller it hands back.
 *
 * The wrapper abstracts the transport: on the direct path (chrome `<moz-urlbar>`)
 * the actor pair hands back the real `UrlbarParentController` and calls happen
 * synchronously, while on the message path (a content-process `<moz-urlbar>`, or
 * chrome with the pref) it gets a proxy implementing the same surface. Callers
 * (`UrlbarInput`, `UrlbarView`) don't distinguish them.
 */
export class UrlbarChildController {
  /** @type {Console} */
  static #logger;

  get logger() {
    if (!UrlbarChildController.#logger) {
      UrlbarChildController.#logger = UrlbarShared.getLogger({
        prefix: "ChildController",
      });
    }
    return UrlbarChildController.#logger;
  }

  // TODO: rename to `#parentController` to mirror the public getter and avoid
  // confusion with the `UrlbarParent` actor.
  /** @type {UrlbarParentController} */
  #parent;

  #input;

  /** @type {UrlbarView} */
  #view = null;

  // Listeners (the view, the event bufferer, the search one-offs) live here, on
  // the child's side; the parent delegates its notifications to us via
  // setChild(). Keeping dispatch where the listeners are is what lets
  // `<moz-urlbar>` run in a content process.
  #listeners = new Set();

  #userSelectionBehavior = /** @type {"arrow"|"tab"|"none"} */ ("none");

  // The content-side engagement-telemetry collector, created lazily on the
  // message path (where the parent stand-in has no `engagementEvent`).
  #childTelemetry = null;

  /**
   * @param {object} options
   * @param {UrlbarInput} options.input
   */
  constructor(options) {
    if (!options.input) {
      throw new Error("Missing options: input");
    }
    this.#input = options.input;
    let actor = /** @type {UrlbarChild} */ (
      /** @type {unknown} */ (
        options.input.window.windowGlobalChild.getActor("Urlbar")
      )
    );
    let { sapName, isPrivate } = options.input;
    // The message path builds a proxy that trades actor messages with the
    // parent-side controller; the direct path builds the real controller in
    // place (both live in the same process, and it only needs the actor to
    // resolve the chrome window). Either way the child owns construction.
    this.#parent = actor.usesMessagePath
      ? new UrlbarParentControllerProxy(
          actor,
          actor.registerMessagePathInput(options.input),
          { sapName, isPrivate }
        )
      : new lazy.UrlbarParentController({ sapName, isPrivate, actor });
    this.#parent.setChild(this);
  }

  get input() {
    return this.#input;
  }
  // The window the input lives in. For a chrome `<moz-urlbar>` this is the
  // browser window; for a content-process one it's the content window.
  get window() {
    return this.#input.window;
  }
  get view() {
    return this.#view;
  }
  /**
   * The paired parent controller -- the real `UrlbarParentController` on the
   * direct path, or the `UrlbarParentControllerProxy` on the message path.
   *
   * @type {UrlbarParentController}
   */
  get parentController() {
    return this.#parent;
  }
  get engagementEvent() {
    // Direct path: the real parent controller's recorder. Message path: the
    // parent stand-in has none, so use a content-side collector that ships
    // engagements to the parent recorder.
    return (
      this.#parent.engagementEvent ??
      (this.#childTelemetry ??= new UrlbarChildTelemetry(this))
    );
  }
  get platform() {
    return AppConstants.platform;
  }
  /**
   * The selection behavior that the user has used to select a result. The
   * setter ignores a change to "arrow" once "tab" has been recorded, since we
   * want to know that tab was used first.
   *
   * @type {"arrow"|"tab"|"none"}
   */
  get userSelectionBehavior() {
    return this.#userSelectionBehavior;
  }

  set userSelectionBehavior(behavior) {
    // Don't change the behavior to arrow if tab has already been recorded,
    // as we want to know that the tab was used first.
    if (behavior == "arrow" && this.#userSelectionBehavior == "tab") {
      return;
    }
    this.#userSelectionBehavior = behavior;
  }
  get _lastQueryContextWrapper() {
    return this.#parent._lastQueryContextWrapper;
  }

  setView(view) {
    this.#view = view;
  }
  getViewUpdate(result, idsByName) {
    return this.#parent.getViewUpdate(result, idsByName);
  }
  onBeforeSelection(result, element) {
    return this.#parent.onBeforeSelection(result, element);
  }
  onSelection(result, element) {
    return this.#parent.onSelection(result, element);
  }
  getHeuristicResult(queryContext) {
    return this.#parent.getHeuristicResult(queryContext);
  }
  addListener(listener) {
    if (!listener || typeof listener != "object") {
      throw new TypeError("Expected listener to be an object");
    }
    this.#listeners.add(listener);
  }
  removeListener(listener) {
    this.#listeners.delete(listener);
  }
  notify(notification, ...params) {
    // When the first results arrive, pre-warm a connection to the heuristic
    // result. This runs content-side on both transports (the input has already
    // reacted to the first result before we're notified) and reaches the
    // parent's window the same way a mousedown speculative connect does.
    if (
      notification === UrlbarShared.NOTIFICATIONS.QUERY_RESULTS &&
      params[0].firstResultChanged
    ) {
      this.speculativeConnect(params[0].results[0], params[0], "resultsadded");
    }
    for (let listener of this.#listeners) {
      // Can't use "in" because some tests proxify these.
      if (typeof listener[notification] != "undefined") {
        try {
          listener[notification](...params);
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  }
  recordEngagement(wire) {
    return this.#parent.recordEngagement(wire);
  }
  resetEngagement() {
    return this.#parent.resetEngagement();
  }
  handleBounceTrigger(payload) {
    return this.#parent.handleBounceTrigger(payload);
  }
  trackBounceBrowser(browserId) {
    return this.#parent.trackBounceBrowser(browserId);
  }
  startQuery(queryContext) {
    return this.#parent.startQuery(queryContext);
  }
  cancelQuery() {
    return this.#parent.cancelQuery();
  }
  receiveResults(queryContext) {
    return this.#parent.receiveResults(queryContext);
  }
  removeResult(result, options) {
    return this.#parent.removeResult(result, options);
  }
  setLastQueryContextCache(queryContext) {
    return this.#parent.setLastQueryContextCache(queryContext);
  }
  clearLastQueryContextCache() {
    return this.#parent.clearLastQueryContextCache();
  }
  /**
   * Receives keyboard events from the input and handles those that should
   * navigate within the view or pick the currently selected item.
   *
   * @param {KeyboardEvent} event
   *   The DOM KeyboardEvent.
   * @param {boolean} executeAction
   *   Whether the event should actually execute the associated action, or just
   *   be managed (at a preventDefault() level). This is used when the event
   *   will be deferred by the event bufferer, but preventDefault() and friends
   *   should still happen synchronously.
   */
  // eslint-disable-next-line complexity
  handleKeyNavigation(event, executeAction = true) {
    // If the resultMenu is open then let them handle any key events.
    if (this.view.resultMenu.hasAttribute("open")) {
      return;
    }

    const isMac = AppConstants.platform == "macosx";
    // Handle readline/emacs-style navigation bindings on Mac.
    if (
      isMac &&
      this.view.isOpen &&
      event.ctrlKey &&
      (event.key == "n" || event.key == "p")
    ) {
      if (executeAction) {
        this.view.selectBy(1, { reverse: event.key == "p" });
      }
      event.preventDefault();
      return;
    }

    if (executeAction) {
      // In native inputs on most platforms, Shift+Up/Down moves the caret to the
      // start/end of the input and changes its selection, so in that case defer
      // handling to the input instead of changing the view's selection.
      if (
        event.shiftKey &&
        (event.keyCode === KeyEvent.DOM_VK_UP ||
          event.keyCode === KeyEvent.DOM_VK_DOWN)
      ) {
        return;
      }

      let handled = false;
      if (lazy.UrlbarPrefs.get("scotchBonnet.enableOverride")) {
        handled = this.input.searchModeSwitcher.handleKeyDown(event);
      } else if (this.view.isOpen && this._lastQueryContextWrapper) {
        let { queryContext } = this._lastQueryContextWrapper;
        handled = this.view.oneOffSearchButtons?.handleKeyDown(
          event,
          this.view.visibleRowCount,
          this.view.allowEmptySelection,
          queryContext.searchString
        );
      }
      if (handled) {
        return;
      }
    }

    switch (event.keyCode) {
      case KeyEvent.DOM_VK_ESCAPE:
        if (executeAction) {
          if (this.view.isOpen) {
            this.view.close();
          } else if (
            // Moving focus into the content document only makes sense for a
            // chrome moz-urlbar; a content-process one already has focus in
            // content. Only a browser window has `gBrowser`.
            this.window.gBrowser &&
            lazy.UrlbarPrefs.get("focusContentDocumentOnEsc") &&
            !this.input.searchMode &&
            (this.input.sapName == "searchbar"
              ? this.input.value == ""
              : this.input.getAttribute("pageproxystate") == "valid" ||
                (this.input.value == "" &&
                  this.window.isBlankPageURL(
                    this.window.gBrowser.currentURI.spec
                  )))
          ) {
            this.window.gBrowser.selectedBrowser.focus();
          } else {
            this.input.handleRevert();
          }
        }
        event.preventDefault();
        break;
      case KeyEvent.DOM_VK_SPACE:
        if (!this.view.shouldSpaceActivateSelectedElement()) {
          break;
        }
      // Fall through, we want the SPACE key to activate this element.
      case KeyEvent.DOM_VK_RETURN:
        this.logger.debug(`Enter pressed${executeAction ? "" : " delayed"}`);
        if (executeAction) {
          this.input.handleCommand(event);
        }
        event.preventDefault();
        break;
      case KeyEvent.DOM_VK_TAB: {
        if (!this.view.visibleRowCount) {
          // Leave it to the default behaviour if there are not results.
          break;
        }

        // In smartbar mode, mirror the urlbar's circular Tab pattern: cycle
        // through results, then continue into the action buttons (Add Tab,
        // memories, Submit), then wrap back to the first result. Shift+Tab
        // mirrors the cycle in reverse. The view stays open the whole time;
        // Tab from the action buttons back into the result list is handled
        // by SmartbarInput.#onActionButtonsKeyDown.
        if (
          this.input.sapName == "smartbar" &&
          this.view.isOpen &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          const atEnd =
            !event.shiftKey &&
            this.view.selectedElement == this.view.getLastSelectableElement();
          const atStart =
            event.shiftKey &&
            this.view.selectedElement == this.view.getFirstSelectableElement();

          if (atEnd || atStart) {
            if (executeAction) {
              this.view.selectedRowIndex = -1;
              // SAP is `smartbar`, so we can safely cast to SmartbarInput.
              const smartbar = /** @type {SmartbarInput} */ (
                /** @type {unknown} */ (this.input)
              );
              if (atEnd) {
                smartbar.focusFirstActionButton();
              } else {
                smartbar.focusLastActionButton();
              }
            }
            event.preventDefault();
            break;
          }
          // Otherwise, fall through to the default cycling behaviour.
        }

        // Change the tab behavior when urlbar view is open.
        if (
          lazy.UrlbarPrefs.get("scotchBonnet.enableOverride") &&
          this.view.isOpen &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          if (
            (event.shiftKey &&
              this.view.selectedElement ==
                this.view.getFirstSelectableElement()) ||
            (!event.shiftKey &&
              this.view.selectedElement == this.view.getLastSelectableElement())
          ) {
            // If pressing tab + shift when the first or pressing tab when last
            // element has been selected, move the focus to the Unified Search
            // Button. Then make urlbar results selectable by tab + shift.
            event.preventDefault();
            this.view.selectedRowIndex = -1;
            this.focusOnUnifiedSearchButton();
            break;
          } else if (
            !this.view.selectedElement &&
            this.input.focusedViaMousedown
          ) {
            if (event.shiftKey) {
              this.focusOnUnifiedSearchButton();
            } else {
              this.view.selectBy(1, {
                userPressedTab: true,
              });
            }
            event.preventDefault();
            break;
          }
        }

        // It's always possible to tab through results when the urlbar was
        // focused with the mouse or has a search string, or when the view
        // already has a selection.
        // We allow tabbing without a search string when in search mode preview,
        // since that means the user has interacted with the Urlbar since
        // opening it.
        // When there's no search string and no view selection, we want to focus
        // the next toolbar item instead, for accessibility reasons.
        let allowTabbingThroughResults =
          this.input.focusedViaMousedown ||
          this.input.searchMode?.isPreview ||
          this.input.searchMode?.source == UrlbarShared.RESULT_SOURCE.ACTIONS ||
          this.view.selectedElement ||
          (this.input.value &&
            this.input.getAttribute("pageproxystate") != "valid");
        if (
          // Even if the view is closed, we may be waiting results, and in
          // such a case we don't want to tab out of the urlbar.
          (this.view.isOpen || !executeAction) &&
          !event.ctrlKey &&
          !event.altKey &&
          allowTabbingThroughResults
        ) {
          if (executeAction) {
            this.userSelectionBehavior = "tab";
            this.view.selectBy(1, {
              reverse: event.shiftKey,
              userPressedTab: true,
            });
          }
          event.preventDefault();
        }
        break;
      }
      case KeyEvent.DOM_VK_PAGE_DOWN:
      case KeyEvent.DOM_VK_PAGE_UP:
        if (event.ctrlKey) {
          break;
        }
      // eslint-disable-next-lined no-fallthrough
      case KeyEvent.DOM_VK_DOWN:
      case KeyEvent.DOM_VK_UP:
        if (event.altKey) {
          break;
        }
        if (this.view.isOpen) {
          if (executeAction) {
            this.userSelectionBehavior = "arrow";
            this.view.selectBy(
              event.keyCode == KeyEvent.DOM_VK_PAGE_DOWN ||
                event.keyCode == KeyEvent.DOM_VK_PAGE_UP
                ? lazy.UrlbarUtils.PAGE_UP_DOWN_DELTA
                : 1,
              {
                reverse:
                  event.keyCode == KeyEvent.DOM_VK_UP ||
                  event.keyCode == KeyEvent.DOM_VK_PAGE_UP,
              }
            );
          }
        } else {
          if (this.keyEventMovesCaret(event)) {
            break;
          }
          if (executeAction) {
            this.userSelectionBehavior = "arrow";
            this.input.startQuery({
              searchString: this.input.value,
              event,
            });
          }
        }
        event.preventDefault();
        break;
      case KeyEvent.DOM_VK_RIGHT:
      case KeyEvent.DOM_VK_END:
        this.input.maybeConfirmSearchModeFromResult({
          entry: "typed",
          startQuery: true,
        });
      // Fall through.
      case KeyEvent.DOM_VK_LEFT:
      case KeyEvent.DOM_VK_HOME:
        this.view.removeAccessibleFocus();
        break;
      case KeyEvent.DOM_VK_BACK_SPACE:
        if (
          this.input.searchMode &&
          this.input.selectionStart == 0 &&
          this.input.selectionEnd == 0 &&
          !event.shiftKey
        ) {
          this.input.searchMode = null;
          if (this.input.view.oneOffSearchButtons) {
            this.input.view.oneOffSearchButtons.selectedButton = null;
          }
          this.input.startQuery({
            allowAutofill: false,
            event,
          });
        }
      // Fall through.
      case KeyEvent.DOM_VK_DELETE:
        if (!this.view.isOpen) {
          break;
        }
        if (event.shiftKey) {
          if (!executeAction || this.#dismissSelectedResult(event)) {
            event.preventDefault();
          }
        } else if (executeAction) {
          this.userSelectionBehavior = "none";
        }
        break;
    }
  }

  /**
   * Triggers a "dismiss" engagement for the selected result if one is selected.
   * Providers that can respond to dismissals of their results should implement
   * `onEngagement()`, handle the dismissal, and call `controller.removeResult()`.
   *
   * @param {Event} event
   *   The event that triggered dismissal.
   * @returns {boolean}
   *   Whether providers were notified about the engagement. Providers will not
   *   be notified if there is no selected result or the selected result is the
   *   heuristic, since the heuristic result cannot be dismissed.
   */
  #dismissSelectedResult(event) {
    if (!this._lastQueryContextWrapper) {
      console.error("Cannot dismiss selected result, last query not present");
      return false;
    }
    let { queryContext } = this._lastQueryContextWrapper;

    let { selectedElement } = this.input.view;
    if (selectedElement?.classList.contains("urlbarView-button")) {
      // For results with buttons, delete them only when the main part of the
      // row is selected, not a button.
      return false;
    }

    let result = this.input.view.selectedResult;
    if (!result) {
      return false;
    }
    if (result.heuristic && !result.autofill) {
      return false;
    }

    this.engagementEvent.record(event, {
      result,
      selType: "dismiss",
      searchString: queryContext.searchString,
      searchSource: this.input.getSearchSource(event),
    });

    return true;
  }

  /**
   * Checks whether a keyboard event that would normally open the view should
   * instead be handled natively by the input field.
   * On certain platforms, the up and down keys can be used to move the caret,
   * in which case we only want to open the view if the caret is at the
   * start or end of the input.
   *
   * @param {KeyboardEvent} event
   *   The DOM KeyboardEvent.
   * @returns {boolean}
   *   Returns true if the event should move the caret instead of opening the
   *   view.
   */
  keyEventMovesCaret(event) {
    if (this.view.isOpen) {
      return false;
    }
    if (AppConstants.platform != "macosx" && AppConstants.platform != "linux") {
      return false;
    }
    let isArrowUp = event.keyCode == KeyEvent.DOM_VK_UP;
    let isArrowDown = event.keyCode == KeyEvent.DOM_VK_DOWN;
    if (!isArrowUp && !isArrowDown) {
      return false;
    }
    let start = this.input.selectionStart;
    let end = this.input.selectionEnd;
    if (
      end != start ||
      (isArrowUp && start > 0) ||
      (isArrowDown && end < this.input.value.length)
    ) {
      return true;
    }
    return false;
  }

  speculativeConnect(result, context, reason) {
    return this.#parent.speculativeConnect(result, context, reason);
  }
  focusOnUnifiedSearchButton() {
    this.input.setUnifiedSearchButtonAvailability(true);

    /** @type {HTMLElement} */
    const switcher = this.input.querySelector(".searchmode-switcher");
    // Set tabindex to be focusable.
    switcher.setAttribute("tabindex", "-1");
    // Remove blur listener to avoid closing urlbar view panel.
    this.input.inputField.removeEventListener("blur", this.input);
    // Move the focus.
    switcher.focus();
    // Restore all.
    this.input.inputField.addEventListener("blur", this.input);
    switcher.addEventListener(
      "blur",
      /** @type {(e: FocusEvent) => void} */
      e => {
        switcher.removeAttribute("tabindex");

        let relatedTarget = /** @type {HTMLElement} */ (e.relatedTarget);
        if (
          this.input.hasAttribute("focused") &&
          !this.input.contains(relatedTarget)
        ) {
          // If the focus is not back to urlbar, fire blur event explicitly to
          // clear the urlbar. Because the input field has been losing an
          // opportunity to lose the focus since we removed blur listener once.
          this.input.inputField.dispatchEvent(
            new FocusEvent("blur", {
              relatedTarget: e.relatedTarget,
            })
          );
        }
      },
      { once: true }
    );
  }
}
