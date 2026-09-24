/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetEnabled,
} from "resource://newtab/common/WidgetsRegistry.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  DEFAULT_FORM_HISTORY_PARAM:
    "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs",
  FormHistory: "resource://gre/modules/FormHistory.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  SearchSuggestionController:
    "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs",
  SearchUIUtils: "moz-src:///browser/components/search/SearchUIUtils.sys.mjs",
  SearchUtils: "moz-src:///toolkit/components/search/SearchUtils.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
});

const SEARCH_SAP_SOURCE = "newtab_search_widget";

const PREF_WIDGETS_ENABLED = "widgets.enabled";

// The tab the widget is showing, stored in a pref to ensure it is
// remembered when opening new tabs.
const TAB_PREF = "widgets.recentSearches.tab";
const TRENDING_TAB = "trending";

const EXPIRATION_PREF = "recentsearches.expirationMs";
const LASTDEFAULTCHANGED_PREF = "recentsearches.lastDefaultChanged";

// Enough searches to fill the large card.
export const MAX_SEARCHES = 6;

const FORM_HISTORY_TOPIC = "satchel-storage-changed";

const FORM_HISTORY_CHANGES = new Set([
  "formhistory-add",
  "formhistory-update",
  "formhistory-remove",
  "formhistory-expireoldentries",
]);

const RECENT_SEARCHES_ENTRY = WIDGET_REGISTRY.find(
  w => w.id === "recentSearches"
);

// Prefs that can flip the widget's registry enablement, including trainhop
// config. A change to any of these should re-evaluate whether to send an update.
const ENABLEMENT_PREFS = new Set([
  PREF_WIDGETS_ENABLED,
  RECENT_SEARCHES_ENTRY.enabledPref,
  RECENT_SEARCHES_ENTRY.systemEnabledPref,
  "trainhopConfig",
]);

/**
 * Feed for the Recent Searches widget. Runs in the parent process.
 */
export class RecentSearchesFeed {
  #observing = false;
  #updateQueued = false;

  /**
   * Whether the widget is showing its trending tab.
   *
   * @returns {boolean}
   */
  #onTrendingTab() {
    return this.store.getState()?.Prefs.values[TAB_PREF] === TRENDING_TAB;
  }

  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    // Share the registry enablement logic the UI uses, so a trainhop rollout
    // starts the feed even when the system pref defaults false.
    return isWidgetEnabled(
      RECENT_SEARCHES_ENTRY,
      prefs,
      prefs?.[PREF_WIDGETS_ENABLED]
    );
  }

  /**
   * Fetches the list of recent searches.
   *
   * @returns {Promise<Array<{value: string, lastUsed: number}>>} The searches,
   *   newest first.
   */
  async #fetchSearches() {
    await lazy.SearchService.init();
    let engine = lazy.SearchService.defaultEngine;
    if (!engine) {
      return [];
    }

    let now = Date.now();
    let expiration = parseInt(lazy.UrlbarPrefs.get(EXPIRATION_PREF), 10);
    let lastDefaultChanged = parseInt(
      lazy.UrlbarPrefs.get(LASTDEFAULTCHANGED_PREF),
      10
    );
    // If the user changes the default engine we only show searches since
    // they did so.
    if (lastDefaultChanged !== -1) {
      expiration = Math.min(expiration, now - lastDefaultChanged);
    }

    let entries = await lazy.FormHistory.search(["value", "lastUsed"], {
      fieldname: lazy.DEFAULT_FORM_HISTORY_PARAM,
      source: engine.name,
      lastUsedStart: (now - expiration) * 1000,
    });

    return entries
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, MAX_SEARCHES)
      .map(entry => ({
        value: entry.value,
        // FormHistory keeps microseconds; the UI formats a ms epoch.
        lastUsed: Math.floor(entry.lastUsed / 1000),
      }));
  }

  /**
   * Fetch the trending searches using the current default engine.
   *
   * @returns {Promise<{engineName: string, trending: string[]}>} The engine
   *   asked, and the trending search strings it gave.
   */
  async #fetchTrending() {
    await lazy.SearchService.init();
    let engine = lazy.SearchService.defaultEngine;
    if (
      !engine ||
      !lazy.SearchSuggestionController.engineOffersSuggestions(engine, true)
    ) {
      return { engineName: "", trending: [] };
    }

    let controller = new lazy.SearchSuggestionController();
    let fetchData = await controller.fetch({
      searchString: "",
      inPrivateBrowsing: false,
      engine,
      fetchTrending: true,
      maxLocalResults: 0,
      maxRemoteResults: MAX_SEARCHES,
    });

    return {
      engineName: engine.name,
      trending: (fetchData?.remote ?? []).map(suggestion => suggestion.value),
    };
  }

  #startObserving() {
    if (this.#observing) {
      return;
    }
    Services.obs.addObserver(this, FORM_HISTORY_TOPIC);
    Services.obs.addObserver(this, lazy.SearchUtils.TOPIC_ENGINE_MODIFIED);
    this.#observing = true;
  }

  #stopObserving() {
    if (!this.#observing) {
      return;
    }
    Services.obs.removeObserver(this, FORM_HISTORY_TOPIC);
    Services.obs.removeObserver(this, lazy.SearchUtils.TOPIC_ENGINE_MODIFIED);
    this.#observing = false;
  }

  /**
   * nsIObserver. Subscribes to: a form history change, which may have added or
   * removed one of the listed searches, and a default engine change, which decides
   * both which searches are listed and what is trending.
   *
   * @param {nsISupports} subject Unused; the subject differs per topic.
   * @param {string} topic Either `satchel-storage-changed` or
   *   `SearchUtils.TOPIC_ENGINE_MODIFIED`.
   * @param {string} data What changed: one of the form history operations for
   *   the former, a `SearchUtils.MODIFIED_TYPE` for the latter.
   */
  observe(_subject, topic, data) {
    if (topic === FORM_HISTORY_TOPIC) {
      if (FORM_HISTORY_CHANGES.has(data)) {
        this.#queueUpdate();
      }
      return;
    }
    if (
      topic === lazy.SearchUtils.TOPIC_ENGINE_MODIFIED &&
      data === lazy.SearchUtils.MODIFIED_TYPE.DEFAULT
    ) {
      this.#queueUpdate();
      if (this.#onTrendingTab()) {
        this.updateTrending();
      }
    }
  }

  /**
   * Read the searches once the notifications are done with. Form history sends
   * one per changed entry, so a burst - clearing history, an expiration run -
   * would otherwise be a read and a broadcast each. This also puts the read
   * after every other observer of the same notification, which is what lets it
   * see the default engine change the urlbar records for `#fetchSearches`.
   */
  #queueUpdate() {
    if (this.#updateQueued) {
      return;
    }
    this.#updateQueued = true;
    Services.tm.dispatchToMainThread(() => {
      this.#updateQueued = false;
      // Both can have changed while this waited its turn.
      if (this.#observing && this.enabled) {
        this.updateSearches();
      }
    });
  }

  /**
   * Broadcast the current recent searches to every tab.
   */
  async updateSearches() {
    let searches = [];
    try {
      searches = await this.#fetchSearches();
    } catch (error) {
      console.error("Recent searches widget failed to read searches", error);
    }
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_RECENT_SEARCHES_UPDATE,
        data: { searches },
      })
    );
  }

  /**
   * Broadcast what is trending.
   */
  async updateTrending() {
    // The name goes with the trends it credits, so the attribution line cannot
    // be left naming an engine the trends did not come from.
    let data = { engineName: "", trending: [] };
    try {
      data = await this.#fetchTrending();
    } catch (error) {
      console.error("Recent searches widget failed to read trending", error);
    }
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_RECENT_SEARCHES_UPDATE,
        data,
      })
    );
  }

  /**
   * Forget one of the listed searches.
   *
   * @param {object} action The WIDGETS_RECENT_SEARCHES_REMOVE_SEARCH action.
   */
  async removeSearch(action) {
    const { search } = action.data || {};
    if (!search) {
      return;
    }
    try {
      await lazy.FormHistory.update({
        op: "remove",
        fieldname: lazy.DEFAULT_FORM_HISTORY_PARAM,
        value: search,
      });
    } catch (error) {
      console.error("Recent searches widget failed to remove a search", error);
      return;
    }
    await this.updateSearches();
  }

  /**
   * Run one of the listed searches again, against the current default engine.
   *
   * @param {object} action The WIDGETS_RECENT_SEARCHES_OPEN_LINK action.
   */
  async openSearch(action) {
    const { search, eventInfo } = action.data || {};
    const window = action._target?.window;
    if (!search || !window) {
      return;
    }
    try {
      await lazy.SearchUIUtils.loadSearch({
        window,
        searchText: search,
        where: lazy.BrowserUtils.whereToOpenLink(eventInfo || null),
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
        sapSource: SEARCH_SAP_SOURCE,
      });
    } catch (error) {
      console.error("Recent searches widget failed to open a search", error);
    }
  }

  /**
   * Start following the searches and populate the last tab the
   * user selected.
   */
  async #start() {
    this.#startObserving();
    await this.updateSearches();
    if (this.#onTrendingTab()) {
      await this.updateTrending();
    }
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        if (this.enabled) {
          await this.#start();
        }
        break;
      case at.UNINIT:
        this.#stopObserving();
        break;
      case at.WIDGETS_RECENT_SEARCHES_OPEN_LINK:
        await this.openSearch(action);
        break;
      case at.WIDGETS_RECENT_SEARCHES_REMOVE_SEARCH:
        await this.removeSearch(action);
        break;
      case at.PREF_CHANGED:
        if (
          action.data?.name === TAB_PREF &&
          action.data.value === TRENDING_TAB &&
          this.enabled
        ) {
          await this.updateTrending();
        }
        // Enablement can flip on after startup (e.g. a trainhop rollout lands
        // its config); update as soon as it does.
        if (ENABLEMENT_PREFS.has(action.data?.name)) {
          if (this.enabled) {
            await this.#start();
          } else {
            this.#stopObserving();
          }
        }
        break;
    }
  }
}
