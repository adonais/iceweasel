/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { WEATHER_OPTIN_REGIONS } from "./ActivityStream.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
  Region: "resource://gre/modules/Region.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "MerinoClient", () => {
  try {
    return ChromeUtils.importESModule(
      "moz-src:///browser/components/urlbar/MerinoClient.sys.mjs"
    ).MerinoClient;
  } catch {
    // Fallback to URI format prior to FF 144.
    return ChromeUtils.importESModule(
      "resource:///modules/MerinoClient.sys.mjs"
    ).MerinoClient;
  }
});

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";

const CACHE_KEY = "weather_feed";
const WEATHER_UPDATE_TIME = 10 * 60 * 1000; // 10 minutes
const MERINO_PROVIDER = ["accuweather"];
const MERINO_CLIENT_KEY = "HNT_WEATHER_FEED";

const PREF_WEATHER_QUERY = "weather.query";
const PREF_SHOW_WEATHER = "showWeather";
const PREF_SYSTEM_SHOW_WEATHER = "system.showWeather";

/**
 * A feature that periodically fetches weather suggestions from Merino for HNT.
 */
export class WeatherFeed {
  constructor() {
    this.loaded = false;
    this.merino = null;
    this.suggestions = [];
    this.lastUpdated = null;
    this.locationData = {};
    this.fetchTimer = null;
    this.fetchIntervalMs = 30 * 60 * 1000; // 30 minutes
    this.timeoutMS = 5000;
    this.lastFetchTimeMs = 0;
    this.fetchDelayAfterComingOnlineMs = 3000; // 3s
    this.cache = this.PersistentCache(CACHE_KEY, true);
  }

  async resetCache() {
    if (this.cache) {
      await this.cache.set("weather", {});
    }
  }

  async resetWeather() {
    await this.resetCache();
    this.suggestions = [];
    this.lastUpdated = null;
  }

  isEnabled() {
    return (
      this.store.getState().Prefs.values[PREF_SHOW_WEATHER] &&
      this.store.getState().Prefs.values[PREF_SYSTEM_SHOW_WEATHER]
    );
  }

  async init() {
    await this.loadWeather(true /* isStartup */);
  }

  stopFetching() {
    if (!this.merino) {
      return;
    }

    lazy.clearTimeout(this.fetchTimer);
    this.merino = null;
    this.suggestions = null;
    this.fetchTimer = 0;
  }

  /**
   * This thin wrapper around the fetch call makes it easier for us to write
   * automated tests that simulate responses.
   */
  async fetchHelper(retries = 3, queryOverride = null) {
    this.restartFetchTimer();
    const weatherQuery = this.store.getState().Prefs.values[PREF_WEATHER_QUERY];
    let suggestions = [];
    let retry = 0;
    const query = queryOverride ?? weatherQuery ?? "";
    while (retry++ < retries && suggestions.length === 0) {
      try {
        suggestions = await this.merino.fetch({
          query,
          providers: MERINO_PROVIDER,
          timeoutMs: 7000,
          otherParams: {
            request_type: "weather",
            source: "newtab",
          },
        });
      } catch (error) {
        // We don't need to do anything with this right now.
      }
    }

    // results from the API or empty array if null
    this.suggestions = suggestions ?? [];
    return this.suggestions;
  }

  async fetch() {
    // Keep a handle on the `MerinoClient` instance that exists at the start of
    // this fetch. If fetching stops or this `Weather` instance is uninitialized
    // during the fetch, `#merino` will be nulled, and the fetch should stop. We
    // can compare `merino` to `this.merino` to tell when this occurs.
    if (!this.merino) {
      this.merino = await this.MerinoClient(MERINO_CLIENT_KEY);
    }

    await this.fetchHelper();

    if (this.suggestions.length) {
      const hasLocationData =
        !this.store.getState().Prefs.values[PREF_WEATHER_QUERY];
      this.lastUpdated = this.Date().now();
      await this.cache.set("weather", {
        suggestions: this.suggestions,
        lastUpdated: this.lastUpdated,
      });

      // only calls to merino without the query parameter would return the location data (and only city name)
      if (hasLocationData && this.suggestions.length) {
        const [data] = this.suggestions;
        this.locationData = {
          city: data.city_name,
          adminArea: "",
          country: "",
        };
        await this.cache.set("locationData", this.locationData);
      }
    }

    this.update();
  }

  async loadWeather(isStartup = false) {
    const cachedData = (await this.cache.get()) || {};
    const { weather, locationData } = cachedData;

    // if we have locationData in the cache set it to this.locationData so it is added to the redux store
    if (locationData?.city) {
      this.locationData = locationData;
    }
    // If we have nothing in cache, or cache has expired, we can make a fresh fetch.
    if (
      !weather?.lastUpdated ||
      !(this.Date().now() - weather.lastUpdated < WEATHER_UPDATE_TIME)
    ) {
      await this.fetch(isStartup);
    } else if (!this.lastUpdated) {
      this.suggestions = weather.suggestions;
      this.lastUpdated = weather.lastUpdated;
      this.update();
    }
  }

  update() {
    this.store.dispatch(
      ac.BroadcastToContent({
        type: at.WEATHER_UPDATE,
        data: {
          suggestions: this.suggestions,
          lastUpdated: this.lastUpdated,
          locationData: this.locationData,
        },
      })
    );
  }

  restartFetchTimer(ms = this.fetchIntervalMs) {
    lazy.clearTimeout(this.fetchTimer);
    this.fetchTimer = lazy.setTimeout(() => {
      this.fetch();
    }, ms);
  }

  async fetchLocationAutocomplete() {
    if (!this.merino) {
      this.merino = await this.MerinoClient(MERINO_CLIENT_KEY);
    }

    const query = this.store.getState().Weather.locationSearchString;
    let response = await this.merino.fetch({
      query: query || "",
      providers: MERINO_PROVIDER,
      timeoutMs: 7000,
      otherParams: {
        request_type: "location",
        source: "newtab",
      },
    });
    const data = response?.[0];
    if (data?.locations.length) {
      this.store.dispatch(
        ac.BroadcastToContent({
          type: at.WEATHER_LOCATION_SUGGESTIONS_UPDATE,
          data: data.locations,
        })
      );
    }
  }

  async fetchLocationByIP() {
    if (!this.merino) {
      this.merino = await this.MerinoClient(MERINO_CLIENT_KEY);
    }

    // First we fetch the forecast through user's IP Address
    // which is done by not adding in a query parameter, but keeping the "weather" request_type.
    // This method is mentioned in the AccuWeather docs:
    // https://apidev.accuweather.com/developers/locationsAPIguide#IPAddress
    try {
      const ipLocation = await this.fetchHelper(3, "");

      const ipData = ipLocation?.[0];

      // Second, we use the city name that came from the IP look up to get the normalized merino response
      // For context, the IP lookup response does not have the complete response data we need
      const locationData = await this.merino.fetch({
        query: ipData.city_name,
        providers: MERINO_PROVIDER,
        timeoutMs: 7000,
        otherParams: {
          request_type: "location",
          source: "newtab",
        },
      });

      const response = locationData?.[0]?.locations?.[0];
      return response;
      // return response
    } catch (err) {
      console.error("WeatherFeed failed to look up IP");
      return null;
    }
  }

  async onPrefChangedAction(action) {
    switch (action.data.name) {
      case PREF_WEATHER_QUERY:
        await this.fetch();
        break;
      case PREF_SHOW_WEATHER:
      case PREF_SYSTEM_SHOW_WEATHER:
        if (this.isEnabled() && action.data.value) {
          await this.loadWeather();
        } else {
          await this.resetWeather();
        }
        break;
    }
  }

  async checkOptInRegion() {
    const currentRegion = await lazy.Region.home;
    const optIn =
      this.isEnabled() && WEATHER_OPTIN_REGIONS.includes(currentRegion);
    this.store.dispatch(ac.SetPref("system.showWeatherOptIn", optIn));
    return optIn;
  }

  async onAction(action) {
    switch (action.type) {
      case at.INIT:
        await this.checkOptInRegion();
        if (this.isEnabled()) {
          await this.init();
        }
        break;
      case at.UNINIT:
        await this.resetWeather();
        break;
      case at.DISCOVERY_STREAM_DEV_SYSTEM_TICK:
      case at.SYSTEM_TICK:
        if (this.isEnabled()) {
          await this.loadWeather();
        }
        break;
      case at.PREF_CHANGED:
        if (action.data.name === "system.showWeather") {
          await this.checkOptInRegion();
        }
        await this.onPrefChangedAction(action);
        break;
      case at.WEATHER_LOCATION_SEARCH_UPDATE:
        await this.fetchLocationAutocomplete();
        break;
      case at.WEATHER_LOCATION_DATA_UPDATE: {
        // check that data is formatted correctly before adding to cache
        if (action.data.city) {
          await this.cache.set("locationData", {
            city: action.data.city,
            adminName: action.data.adminName,
            country: action.data.country,
          });
          this.locationData = action.data;
        }

        // Remove static weather data once location has been set
        this.store.dispatch(ac.SetPref("weather.staticData.enabled", false));
        break;
      }
      case at.WEATHER_USER_OPT_IN_LOCATION: {
        this.store.dispatch(ac.SetPref("weather.optInAccepted", true));
        this.store.dispatch(ac.SetPref("weather.optInDisplayed", false));

        const detectedLocation = await this.fetchLocationByIP();

        if (detectedLocation) {
          // Build the payload exactly like manual search does

          this.store.dispatch(
            ac.BroadcastToContent({
              type: at.WEATHER_LOCATION_DATA_UPDATE,
              data: {
                city: detectedLocation.localized_name,
                adminName: detectedLocation.administrative_area,
                country: detectedLocation.country,
              },
            })
          );

          // Use the AccuWeather key (canonical ID)
          if (detectedLocation.key) {
            this.store.dispatch(
              ac.SetPref("weather.query", detectedLocation.key)
            );
          }
        }
        break;
      }
    }
  }
}

/**
 * Creating a thin wrapper around MerinoClient, PersistentCache, and Date.
 * This makes it easier for us to write automated tests that simulate responses.
 */
WeatherFeed.prototype.MerinoClient = (...args) => {
  return new lazy.MerinoClient(...args);
};
WeatherFeed.prototype.PersistentCache = (...args) => {
  return new lazy.PersistentCache(...args);
};
WeatherFeed.prototype.Date = () => {
  return Date;
};
