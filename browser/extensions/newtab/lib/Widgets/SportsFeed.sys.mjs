/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
  TemporaryMerinoClientShim:
    "resource://newtab/lib/TemporaryMerinoClientShim.sys.mjs",
});

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";

const PREF_SPORTS_ENABLED = "widgets.sportsWidget.enabled";
const PREF_SYSTEM_SPORTS_ENABLED = "widgets.system.sportsWidget.enabled";
const FOLLOW_STATE = "sports-follow-state";
const CACHE_KEY = "sports_feed";
const MERINO_CLIENT_KEY = "HNT_SPORTS_FEED";

/**
 * Manages persistent state for the Sports widget (selected teams and widget
 * state), syncing with PersistentCache so state survives page refreshes.
 * Also fetches teams and match data from the Merino WCS endpoints.
 */
export class SportsFeed {
  constructor() {
    this.initialized = false;
    this.cache = this.PersistentCache(CACHE_KEY, true);
    this.merino = this.MerinoClient(MERINO_CLIENT_KEY);
  }

  get enabled() {
    const prefs = this.store.getState()?.Prefs.values;
    const userValue = !!prefs?.[PREF_SPORTS_ENABLED];
    const systemValue = !!prefs?.[PREF_SYSTEM_SPORTS_ENABLED];
    const experimentValue = !!prefs?.trainhopConfig?.sports?.enabled;
    return userValue && (systemValue || experimentValue);
  }

  async init() {
    this.initialized = true;
    await this.syncState();
    await this.fetchSportsData();
  }

  // On startup, read whatever was saved to disk and send it to the UI.
  async syncState() {
    const cachedData = (await this.cache.get()) || {};
    const { widgetState, selectedTeams, sportsData, matchesTab } = cachedData;
    const { teams, matches } = sportsData || {};

    if (widgetState) {
      this.store.dispatch(
        ac.BroadcastToContent({
          type: at.WIDGETS_SPORTS_SET_WIDGET_STATE,
          data: widgetState,
        })
      );
    }

    if (selectedTeams) {
      this.store.dispatch(
        ac.BroadcastToContent({
          type: at.WIDGETS_SPORTS_SET_SELECTED_TEAMS,
          data: selectedTeams,
        })
      );
    }

    if (matchesTab) {
      this.store.dispatch(
        ac.BroadcastToContent({
          type: at.WIDGETS_SPORTS_SET_MATCHES_TAB,
          data: matchesTab,
        })
      );
    }

    if (teams || matches) {
      this.store.dispatch(
        ac.BroadcastToContent({
          type: at.WIDGETS_SPORTS_WIDGET_SET,
          data: { teams: teams ?? [], matches: matches ?? [] },
        })
      );
    }
  }

  async fetchSportsData() {
    const prefs = this.store.getState()?.Prefs.values;
    const teamsEndpoint =
      prefs?.trainhopConfig?.sports?.teamsEndpoint ||
      prefs?.["sports.worldCup.teamsEndpoint"];
    const matchesEndpoint =
      prefs?.trainhopConfig?.sports?.matchesEndpoint ||
      prefs?.["sports.worldCup.matchesEndpoint"];

    const allowedEndpoints = (prefs?.["discoverystream.endpoints"] ?? "")
      .split(",")
      .map(item => item.trim())
      .filter(item => item);

    if (
      teamsEndpoint &&
      !allowedEndpoints.some(prefix => teamsEndpoint.startsWith(prefix))
    ) {
      console.error(`Sports teams endpoint not in allowlist: ${teamsEndpoint}`);
      return;
    }
    if (
      matchesEndpoint &&
      !allowedEndpoints.some(prefix => matchesEndpoint.startsWith(prefix))
    ) {
      console.error(
        `Sports matches endpoint not in allowlist: ${matchesEndpoint}`
      );
      return;
    }

    const [teams, matches] = await Promise.all([
      this.merino.fetchSportsTeams({
        source: "newtab",
        endpointUrl: teamsEndpoint,
      }),
      this.merino.fetchSportsMatches({
        source: "newtab",
        endpointUrl: matchesEndpoint,
      }),
    ]);

    if (teams?.teams || matches) {
      await this.cache.set("sportsData", {
        teams: teams?.teams,
        matches,
      });
    }

    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WIDGETS_SPORTS_WIDGET_SET,
        data: { teams: teams?.teams ?? [], matches: matches ?? [] },
      })
    );
  }

  async onPrefChangedAction(action) {
    if (
      (action.data.name === PREF_SPORTS_ENABLED ||
        action.data.name === PREF_SYSTEM_SPORTS_ENABLED ||
        action.data.name === "trainhopConfig") &&
      this.enabled &&
      !this.initialized
    ) {
      await this.init();
    }
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        if (this.enabled) {
          await this.init();
        }
        break;
      case at.PREF_CHANGED:
        await this.onPrefChangedAction(action);
        break;
      // User changed the widget state — save it and send the updated state to the UI.
      case at.WIDGETS_SPORTS_CHANGE_WIDGET_STATE:
        if (action.data !== FOLLOW_STATE) {
          await this.cache.set("widgetState", action.data);
        }
        this.store.dispatch(
          ac.BroadcastToContent({
            type: at.WIDGETS_SPORTS_SET_WIDGET_STATE,
            data: action.data,
          })
        );
        break;
      // User changed their team selection — save it and send the updated list to the UI.
      case at.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS:
        await this.cache.set("selectedTeams", action.data);
        this.store.dispatch(
          ac.BroadcastToContent({
            type: at.WIDGETS_SPORTS_SET_SELECTED_TEAMS,
            data: action.data,
          })
        );
        break;
      // User changed the matches tab — save it and broadcast to the UI.
      case at.WIDGETS_SPORTS_CHANGE_MATCHES_TAB:
        await this.cache.set("matchesTab", action.data);
        this.store.dispatch(
          ac.BroadcastToContent({
            type: at.WIDGETS_SPORTS_SET_MATCHES_TAB,
            data: action.data,
          })
        );
        break;
    }
  }
}

SportsFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};

SportsFeed.prototype.MerinoClient = name => {
  return new lazy.TemporaryMerinoClientShim(name);
};
