/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AutoTabGroupingSuggestions:
    "moz-src:///browser/components/aiwindow/ui/modules/AutoTabGroupingSuggestions.sys.mjs",
  TabMetrics: "moz-src:///browser/components/tabbrowser/TabMetrics.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "console", () =>
  console.createInstance({
    prefix: "AutoTabGrouping",
    maxLogLevelPref: "browser.smartwindow.autoTabGrouping.loglevel",
  })
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "minTabsPerGroup",
  "browser.smartwindow.autoTabGrouping.minTabsPerGroup",
  2
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "minCandidateTabs",
  "browser.smartwindow.autoTabGrouping.minCandidateTabs",
  4
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "timeoutMs",
  "browser.smartwindow.autoTabGrouping.timeoutMs",
  8000
);

const BUTTON_ITEM_ID = "smartwindow-group-tabs-button";
const BUTTON_ID = "smartwindow-group-tabs-button-inner";
const PANEL_ID = "smartwindow-group-tabs-panel";
const FLYOUT_ID = "smartwindow-group-tabs-flyout";
const CARD_TAG = "smartwindow-group-tabs-card";
const FLYOUT_HIDE_DELAY_MS = 160;

/**
 * Median and mean of a list of group sizes (tabs per group), rounded to
 * integers for the telemetry events.
 *
 * @param {number[]} sizes
 * @returns {{median: number, mean: number}}
 */
function sizeStats(sizes) {
  if (!sizes.length) {
    return { median: 0, mean: 0 };
  }
  const sorted = [...sizes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const mean = Math.round(sizes.reduce((sum, n) => sum + n, 0) / sizes.length);
  return { median, mean };
}

/**
 * Front-end orchestrator for the Smart Window "Organize Tabs" feature. Opens a
 * toolbar-anchored panel that suggests tab groups (clustered on-device by
 * AutoTabGroupingSuggestions) and creates the ones the user picks.
 *
 * The whole feature is gated behind browser.smartwindow.autoTabGrouping.enabled
 * (default false). This module owns the XUL panels, their lifecycle, and all ML
 * and tab-group work; the panel and flyout markup are rendered by the
 * smartwindow-group-tabs-card / -flyout custom elements, which report user
 * intent back through events.
 */
export const AutoTabGrouping = {
  _nextId: 1,

  /**
   * A suggested group the panel offers (not yet created).
   *
   * @typedef {object} GroupSuggestion
   * @property {number} id - Stable id used to find the row across re-renders.
   * @property {string} label - Suggested group name.
   * @property {string} color - Tab-group color name (a --tab-group-<name>).
   * @property {MozTabbrowserTab[]} tabs - Tabs the group would contain.
   * @property {object[]} tabInfos - Per-tab display data (tile color, letter,
   *   site name, title) for the rows and flyout.
   */

  /**
   * A group the feature created and can still ungroup.
   *
   * @typedef {object} RecentGroup
   * @property {number} id - Stable id used to find the row across re-renders.
   * @property {MozTabGroup} group - The created tab group, used to ungroup it.
   * @property {string} label - The created group's name.
   * @property {string} color - The created group's color name.
   */

  /**
   * Per-window state that must survive the panel being closed and rebuilt.
   * suggestions holds the not-yet-created proposals; consumed proposals are
   * dropped and are not recomputed, so a suggestion the user acts on does not
   * resurface.
   *
   * computePromise memoizes the in-flight clustering run (it resolves to
   * undefined once suggestions are stored) so a panel reopened while it is
   * still running awaits the same computation instead of getting stuck on the
   * loading state. computeCount counts finished runs, used to flag reopened
   * offers as recomputes in telemetry.
   *
   * recent holds the groups created from suggestions (newest first); the panel
   * lists them under "Just created" and the "Ungroup" button reverses all of
   * them at once. It is emptied when the panel closes: a group is only "just
   * created" while the panel that created it stays open.
   *
   * @type {WeakMap<ChromeWindow, {computed: boolean, computing: boolean,
   *   computeCount: number, computePromise: ?Promise<void>,
   *   suggestions: GroupSuggestion[], recent: RecentGroup[]}>}
   */
  _state: new WeakMap(),

  /**
   * The main panel currently in the DOM for a window, if any.
   *
   * @type {WeakMap<ChromeWindow, XULElement>}
   */
  _panels: new WeakMap(),

  _getState(win) {
    let state = this._state.get(win);
    if (!state) {
      state = {
        computed: false,
        computing: false,
        computePromise: null,
        computeCount: 0,
        suggestions: [],
        recent: [],
      };
      this._state.set(win, state);
    }
    return state;
  },

  /**
   * Toggle the "Organize Tabs" panel from the toolbar button.
   *
   * @param {ChromeWindow} win - The Smart Window.
   */
  toggleGroupTabsPanel(win) {
    const existing = this._panels.get(win);
    if (existing) {
      existing.hidePopup();
      return;
    }
    this.showGroupTabsPanel(win).catch(e =>
      lazy.console.warn("showGroupTabsPanel failed", e)
    );
  },

  /**
   * Build the panel, show it, then populate it once the clustering models have
   * run (or immediately if suggestions were already computed).
   *
   * @param {ChromeWindow} win
   */
  async showGroupTabsPanel(win) {
    if (!win?.gBrowser || win.closed) {
      return;
    }
    const doc = win.document;
    const anchor = doc.getElementById(BUTTON_ITEM_ID);
    const button = doc.getElementById(BUTTON_ID);
    const popupSet = doc.getElementById("mainPopupSet");
    if (!anchor || !popupSet) {
      return;
    }

    const panel = this._buildPanelSkeleton(win);
    popupSet.appendChild(panel);
    this._panels.set(win, panel);

    // Both panels are noautohide so hovering the flyout (a second popup) cannot
    // roll up the main panel; dismiss it ourselves on Escape or a click outside
    // both popups and the toolbar button.
    const onMouseDown = event => {
      const target = event.target;
      if (
        panel.contains(target) ||
        panel._flyoutPanel?.contains(target) ||
        anchor.contains(target)
      ) {
        return;
      }
      panel.hidePopup();
    };
    const onKeyDown = event => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      const flyoutState = panel._flyoutPanel?.state;
      if (flyoutState && flyoutState !== "closed") {
        this._leaveFlyout(panel);
        return;
      }
      panel._restoreFocus = true;
      panel.hidePopup();
    };

    panel.addEventListener(
      "popupshown",
      () => {
        button?.setAttribute("aria-expanded", "true");
        panel._card.focus();
        win.addEventListener("mousedown", onMouseDown, true);
        win.addEventListener("keydown", onKeyDown, true);
      },
      { once: true }
    );
    panel.addEventListener(
      "popuphidden",
      () => {
        button?.setAttribute("aria-expanded", "false");
        win.removeEventListener("mousedown", onMouseDown, true);
        win.removeEventListener("keydown", onKeyDown, true);
        this._cancelHideFlyout(panel);
        panel._flyoutPanel?.remove();
        this._getState(win).recent = [];
        if (this._panels.get(win) === panel) {
          this._panels.delete(win);
        }
        panel.remove();
        if (panel._restoreFocus) {
          button?.focus();
        }
      },
      { once: true }
    );

    panel.openPopup(anchor, "after_end", 0, 6, false, false);

    const state = this._getState(win);
    if (!state.computing) {
      state.computed = false;
      state.suggestions = [];
    }
    const done = this._computeSuggestions(win);
    this._syncCard(win, panel);
    await done;
    if (this._panels.get(win) !== panel) {
      return;
    }
    this._syncCard(win, panel);
  },

  /**
   * @param {ChromeWindow} win
   * @returns {XULElement} A detached main panel hosting the card element, with
   *   its events wired to the model actions.
   */
  _buildPanelSkeleton(win) {
    const doc = win.document;

    const panel = this._createPanel(win, PANEL_ID);

    const card = doc.createElement(CARD_TAG);
    card.addEventListener("create-all", () =>
      this._createSuggestions(
        win,
        panel,
        this._getState(win).suggestions.slice()
      )
    );
    card.addEventListener("create-one", e =>
      this._createById(win, panel, e.detail.id)
    );
    card.addEventListener("ungroup", () => this._ungroupRecent(win, panel));
    card.addEventListener("close-duplicates", () =>
      this._closeDuplicateTabs(win, panel)
    );
    card.addEventListener("preview", e => {
      // Focusing a row whose flyout was just dismissed must not reopen it;
      // pointing at it again is a fresh request and does.
      if (
        e.detail.source === "focus" &&
        panel._dismissedRow === e.detail.anchor
      ) {
        return;
      }
      if (e.detail.source === "hover" && this._flyoutHasFocus(panel)) {
        return;
      }
      panel._dismissedRow = null;
      this._showFlyoutById(win, panel, e.detail.id, e.detail.anchor);
    });
    card.addEventListener("preview-end", () => this._scheduleHideFlyout(panel));
    card.addEventListener("mouseover", e =>
      this._dismissPreviewOnRow(panel, e)
    );
    card.addEventListener("preview-enter", e => {
      panel._dismissedRow = null;
      this._showFlyoutById(win, panel, e.detail.id, e.detail.anchor);
      this._focusFlyout(panel);
    });
    panel.appendChild(card);

    panel._card = card;
    panel._flyoutPanel = null;
    panel._activeRow = null;
    panel._hideTimer = 0;
    panel._dismissedRow = null;
    panel._focusFlyoutController = null;
    panel._restoreFocus = false;
    return panel;
  },

  /**
   * Create a non-auto-hiding panel that hosts one of our cards. Shared by the
   * main panel and the hover flyout. `type="arrow"` is what makes popup.css
   * paint the panel from the --panel-* design tokens; the rest of the styling
   * lives in the smartwindowGroupTabs.css theme sheet, scoped to the panel ids
   * and swgt- classes.
   *
   * @param {ChromeWindow} win
   * @param {string} id
   * @returns {XULElement}
   */
  _createPanel(win, id) {
    const panel = win.document.createXULElement("panel");
    panel.id = id;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("noautohide", "true");
    panel.setAttribute("ignorekeys", "true");
    return panel;
  },

  /**
   * Lazily create the flyout sub-panel that floats past the end side of a
   * hovered suggestion row.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel - The main panel.
   * @returns {XULElement}
   */
  _ensureFlyoutPanel(win, panel) {
    if (panel._flyoutPanel?.parentNode) {
      return panel._flyoutPanel;
    }
    const flyoutPanel = this._createPanel(win, FLYOUT_ID);
    flyoutPanel.setAttribute("animate", "false");
    // Slide along the block axis to stay on screen near the bottom edge, and
    // keep flipping to the panel's other side when there is no room beside it.
    flyoutPanel.setAttribute("flip", "slide");
    const flyoutEl = win.document.createElement(FLYOUT_ID);
    flyoutEl.addEventListener("select-tab", e =>
      this._selectTab(win, panel, e.detail.id, e.detail.index)
    );
    flyoutEl.addEventListener("close-flyout", () => this._leaveFlyout(panel));
    flyoutPanel.appendChild(flyoutEl);
    flyoutPanel.addEventListener("mouseenter", () =>
      this._cancelHideFlyout(panel)
    );
    flyoutPanel.addEventListener("mouseleave", () =>
      this._scheduleHideFlyout(panel)
    );
    flyoutPanel.addEventListener("focusin", () =>
      this._cancelHideFlyout(panel)
    );
    flyoutPanel.addEventListener("focusout", () =>
      this._scheduleHideFlyout(panel)
    );
    flyoutPanel._flyoutEl = flyoutEl;

    win.document.getElementById("mainPopupSet").appendChild(flyoutPanel);
    panel._flyoutPanel = flyoutPanel;
    return flyoutPanel;
  },

  /**
   * Push the window's state onto the card element, which re-renders. Called
   * after clustering finishes and whenever a suggestion or recent group is
   * consumed. New arrays are passed so the element sees a change.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel
   */
  _syncCard(win, panel) {
    const state = this._getState(win);
    this._pruneRecent(win);
    const hidden = this._hideFlyout(panel);

    const card = panel._card;
    card.computing = state.computing;
    card.suggestions = [...state.suggestions];
    card.recent = [...state.recent];
    card.duplicates = win.gBrowser.getAllDuplicateTabsToClose().length;
    return hidden;
  },

  _createById(win, panel, id) {
    const suggestion = this._getState(win).suggestions.find(s => s.id === id);
    if (suggestion) {
      this._createSuggestions(win, panel, [suggestion]);
    }
  },

  _showFlyoutById(win, panel, id, anchorRow) {
    const suggestion = this._getState(win).suggestions.find(s => s.id === id);
    if (suggestion) {
      this._cancelHideFlyout(panel);
      this._showFlyout(win, panel, anchorRow, suggestion);
    }
  },

  _showFlyout(win, panel, anchorRow, suggestion) {
    const flyoutPanel = this._ensureFlyoutPanel(win, panel);
    flyoutPanel._flyoutEl.suggestion = suggestion;

    if (panel._activeRow && panel._activeRow !== anchorRow) {
      panel._activeRow.classList.remove("is-active");
      panel._activeRow.setAttribute("aria-expanded", "false");
    }
    anchorRow.classList.add("is-active");
    anchorRow.setAttribute("aria-expanded", "true");
    panel._activeRow = anchorRow;

    // Float the flyout past the end of the hovered row, top-aligned with it.
    // moveToAnchor repositions without a hide/show flicker when the pointer
    // slides between rows; the panel is an arrow panel, so it keeps following
    // its anchor instead of freezing to the screen position of the first row.
    const flyoutState = flyoutPanel.state;
    if (flyoutState === "open" || flyoutState === "showing") {
      flyoutPanel.moveToAnchor(anchorRow, "end_before", 0, 0);
    } else {
      flyoutPanel.openPopup(anchorRow, "end_before", 0, 0, false, false);
    }
  },

  /**
   * Hide the flyout, resolving once the popup has finished hiding: it hands
   * focus back as it goes, so anything setting focus afterwards must wait.
   *
   * @param {XULElement} panel
   * @returns {Promise<void>}
   */
  _hideFlyout(panel) {
    this._cancelHideFlyout(panel);
    const flyoutPanel = panel._flyoutPanel;
    const hidden =
      flyoutPanel && flyoutPanel.state !== "closed"
        ? new Promise(resolve =>
            flyoutPanel.addEventListener("popuphidden", resolve, { once: true })
          )
        : Promise.resolve();
    panel._focusFlyoutController?.abort();
    flyoutPanel?.hidePopup();
    if (panel._activeRow) {
      panel._activeRow.classList.remove("is-active");
      panel._activeRow.setAttribute("aria-expanded", "false");
      panel._activeRow = null;
    }
    return hidden;
  },

  _focusFlyout(panel) {
    const flyoutPanel = panel._flyoutPanel;
    if (!flyoutPanel) {
      return;
    }
    // Focus is refused while the popup is still opening, and the request goes
    // stale if the flyout hides before it opens.
    const focusFirstTab = () =>
      flyoutPanel.querySelector(".swgt-flyout-tab")?.focus();
    if (flyoutPanel.state === "open") {
      focusFirstTab();
      return;
    }
    panel._focusFlyoutController?.abort();
    panel._focusFlyoutController = new AbortController();
    flyoutPanel.addEventListener("popupshown", focusFirstTab, {
      once: true,
      signal: panel._focusFlyoutController.signal,
    });
  },

  /**
   * Back out of the flyout, closing it and returning focus to its row.
   *
   * @param {XULElement} panel
   */
  _leaveFlyout(panel) {
    const row = panel._activeRow;
    // Hiding a popup that holds focus hands it back to the row, whose own
    // preview would reopen the flyout we are closing.
    panel._dismissedRow = row;
    this._hideFlyout(panel);
    row?.focus();
  },

  /**
   * Switch to one of the tabs listed in the flyout. The suggestion is left
   * alone: previewing a group's tabs is not the same as creating it.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel
   * @param {number} id - Suggestion id.
   * @param {number} index - Position of the tab within the suggestion.
   */
  _selectTab(win, panel, id, index) {
    const suggestion = this._getState(win).suggestions.find(s => s.id === id);
    const tab = suggestion?.tabs[index];
    if (!tab || tab.closing || !win.gBrowser.tabs.includes(tab)) {
      return;
    }
    win.gBrowser.selectedTab = tab;
    panel.hidePopup();
  },

  _flyoutHasFocus(panel) {
    const active = panel.ownerDocument.activeElement;
    return !!active && !!panel._flyoutPanel?.contains(active);
  },

  _dismissPreviewOnRow(panel, event) {
    if (!panel._activeRow || this._flyoutHasFocus(panel)) {
      return;
    }
    // .swgt-row is every row the card makes actionable ("Create Groups", the
    // suggestions, "Ungroup Tabs", "Close Duplicate Tabs"); .swgt-recent-row is
    // a "Just created" entry, which is only there to be read. Another
    // suggestion is left out because it repositions the flyout instead.
    const row = event.target.closest(".swgt-row, .swgt-recent-row");
    if (
      row &&
      row !== panel._activeRow &&
      !row.classList.contains("swgt-suggestion")
    ) {
      this._hideFlyout(panel);
    }
  },

  _scheduleHideFlyout(panel) {
    this._cancelHideFlyout(panel);
    if (this._flyoutHasFocus(panel)) {
      return;
    }
    panel._hideTimer = lazy.setTimeout(() => {
      panel._hideTimer = 0;
      this._hideFlyout(panel);
    }, FLYOUT_HIDE_DELAY_MS);
  },

  _cancelHideFlyout(panel) {
    if (panel._hideTimer) {
      lazy.clearTimeout(panel._hideTimer);
      panel._hideTimer = 0;
    }
  },

  /**
   * Create the given suggestions as tab groups and drop them from the
   * suggestion list. The panel stays open so the user can create the remaining
   * groups one at a time.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel
   * @param {object[]} suggestions
   */
  _createSuggestions(win, panel, suggestions) {
    const state = this._getState(win);
    const windowTabs = new Set(win.gBrowser.tabs);
    // Our groups arrive fully formed (label and color chosen by the
    // suggestion), so create them non-user-triggered: a user-triggered
    // addTabGroup dispatches TabGroupCreateByUser, which pops the built-in
    // "name your group" editor. We track creation with our own Glean event.
    // (bug 2024819 tracks decoupling that editor trigger from the standard
    // tab-group metrics; if it lands we may need to revisit this call.)
    const metricsContext = {
      isUserTriggered: false,
      telemetrySource:
        lazy.TabMetrics.METRIC_SOURCE.SMART_WINDOW_GROUP_SUGGESTIONS,
    };
    const created = [];
    const sizes = [];
    for (const suggestion of suggestions) {
      const tabs = this._creatableTabs(windowTabs, suggestion);
      if (tabs.length < lazy.minTabsPerGroup) {
        continue;
      }
      try {
        const group = win.gBrowser.addTabGroup(tabs, {
          label: suggestion.label,
          color: suggestion.color,
          metricsContext,
        });
        if (group) {
          const entry = {
            id: this._nextId++,
            group,
            label: suggestion.label,
            color: suggestion.color,
          };
          state.recent.unshift(entry);
          created.push(entry);
          sizes.push(tabs.length);
        }
      } catch (e) {
        lazy.console.warn("addTabGroup failed", e);
      }
    }

    if (created.length) {
      const { median, mean } = sizeStats(sizes);
      Glean.smartWindow.autoTabGroupCreated.record({
        type: suggestions.length > 1 ? "all" : "individual",
        count: created.length,
        median_tabs: median,
        mean_tabs: mean,
      });
    }

    const consumed = new Set(suggestions.map(s => s.id));
    const focusIndex = state.suggestions.findIndex(s => consumed.has(s.id));
    state.suggestions = state.suggestions.filter(s => !consumed.has(s.id));
    this._pruneSuggestions(win);
    const hidden = this._syncCard(win, panel);
    this._focusAfterRowRemoved(panel, hidden, focusIndex);
  },

  /**
   * Tabs of a suggestion that can still be grouped: creating one group can
   * leave a later suggestion short of tabs, so this is re-checked every time.
   *
   * @param {Set<MozTabbrowserTab>} windowTabs
   * @param {object} suggestion
   * @returns {MozTabbrowserTab[]}
   */
  _creatableTabs(windowTabs, suggestion) {
    return suggestion.tabs.filter(
      t => !t.closing && !t.group && windowTabs.has(t)
    );
  },

  /**
   * Drop suggestions that can no longer be created, so the panel never offers
   * a row that would do nothing.
   *
   * @param {ChromeWindow} win
   */
  _pruneSuggestions(win) {
    const state = this._getState(win);
    const windowTabs = new Set(win.gBrowser.tabs);
    state.suggestions = state.suggestions.filter(
      s => this._creatableTabs(windowTabs, s).length >= lazy.minTabsPerGroup
    );
  },

  /**
   * Move focus off a row the re-render is about to destroy, so the keyboard
   * can keep working: onto the suggestion that took its place, or the card
   * itself when there is none.
   *
   * @param {XULElement} panel
   * @param {Promise<void>} hidden - Resolves once any flyout has finished
   *   hiding, which hands focus back and would otherwise undo this.
   * @param {number} [index] - Position the removed suggestion held.
   */
  async _focusAfterRowRemoved(panel, hidden, index = -1) {
    const card = panel._card;
    await Promise.all([card.updateComplete, hidden]);
    if (!panel.parentNode) {
      return;
    }
    const rows = card.querySelectorAll(".swgt-suggestion");
    const row = rows[Math.min(index, rows.length - 1)];
    const target = row?.isConnected ? row : card;
    panel._dismissedRow = target;
    target.focus();
  },

  _metricsContext() {
    return lazy.TabMetrics.userTriggeredContext(
      lazy.TabMetrics.METRIC_SOURCE.SMART_WINDOW_GROUP_SUGGESTIONS
    );
  },

  _isGroupLive(win, group) {
    return win.gBrowser.tabGroups.includes(group);
  },

  /**
   * Ungroup every recent group at once: dissolve each group (its tabs stay
   * open) and clear the "Just created" list. Reverses everything the feature
   * created since the panel was last cleared.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel
   */
  _ungroupRecent(win, panel) {
    const state = this._getState(win);
    const entries = state.recent.slice();
    let count = 0;
    for (const entry of entries) {
      if (this._ungroup(win, entry)) {
        count++;
      }
    }
    this._forgetEntries(win, entries);
    if (count) {
      Glean.smartWindow.autoTabGroupUndone.record({ count });
    }
    this._focusAfterRowRemoved(panel, this._syncCard(win, panel));
  },

  /**
   * Close this window's duplicate tabs, reusing the same tabbrowser action the
   * All Tabs menu offers. The panel is dismissed first: closing tabs raises a
   * confirmation hint anchored to the All Tabs button, which an open panel
   * would cover, and the warning prompt is modal.
   *
   * @param {ChromeWindow} win
   * @param {XULElement} panel
   */
  _closeDuplicateTabs(win, panel) {
    panel._restoreFocus = true;
    panel.hidePopup();
    win.gBrowser.removeAllDuplicateTabs();
  },

  _ungroup(win, entry) {
    if (!this._isGroupLive(win, entry.group)) {
      return false;
    }
    try {
      entry.group.ungroupTabs(this._metricsContext());
      return true;
    } catch (e) {
      lazy.console.warn("ungroupTabs failed", e);
      return false;
    }
  },

  _forgetEntries(win, entries) {
    const state = this._getState(win);
    const ids = new Set(entries.map(e => e.id));
    state.recent = state.recent.filter(e => !ids.has(e.id));
  },

  _pruneRecent(win) {
    const state = this._getState(win);
    const dead = state.recent.filter(e => !this._isGroupLive(win, e.group));
    if (dead.length) {
      this._forgetEntries(win, dead);
    }
  },

  _withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = lazy.setTimeout(
        () => reject(new Error("Auto Tab Grouping timed out")),
        ms
      );
    });
    return Promise.race([promise, timeout]).finally(() =>
      lazy.clearTimeout(timer)
    );
  },

  /**
   * Run clustering + labeling once and cache the resulting suggestions on the
   * window state. Stays uncomputed when there are too few tabs so a later open
   * retries once more tabs exist.
   *
   * @param {ChromeWindow} win
   */
  _computeSuggestions(win) {
    const state = this._getState(win);
    if (state.computed) {
      return Promise.resolve();
    }
    if (state.computePromise) {
      return state.computePromise;
    }
    if (!lazy.AutoTabGroupingSuggestions.isAvailable) {
      return Promise.resolve();
    }
    const candidates = lazy.AutoTabGroupingSuggestions.getCandidateTabs(win);
    if (candidates.length < lazy.minCandidateTabs) {
      return Promise.resolve();
    }
    state.computing = true;
    state.computePromise = (async () => {
      try {
        const proposals = await this._withTimeout(
          lazy.AutoTabGroupingSuggestions.buildProposals(candidates),
          lazy.timeoutMs
        );
        state.suggestions = proposals.map((proposal, index) => ({
          id: this._nextId++,
          ...lazy.AutoTabGroupingSuggestions.toSuggestionData(proposal, index),
        }));
        state.computed = true;
        state.computeCount++;
        if (state.suggestions.length) {
          const { median, mean } = sizeStats(
            state.suggestions.map(s => s.tabs.length)
          );
          Glean.smartWindow.autoTabGroupOffered.record({
            count: state.suggestions.length,
            median_tabs: median,
            mean_tabs: mean,
            recomputed: state.computeCount > 1,
          });
        }
      } catch (e) {
        lazy.console.warn("Building group proposals failed", e);
      } finally {
        state.computing = false;
        state.computePromise = null;
      }
    })();
    return state.computePromise;
  },
};
