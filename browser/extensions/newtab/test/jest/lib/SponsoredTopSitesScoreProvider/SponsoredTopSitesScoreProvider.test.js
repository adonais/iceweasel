/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stubGlobals } from "test/jest/test-utils";

// Grants requests for the same lock one at a time, in the order they were
// made, like the Web Locks API.
function createFakeLocks() {
  const held = new Map();
  return {
    request(name, callback) {
      const result = (held.get(name) ?? Promise.resolve()).then(() =>
        callback()
      );
      held.set(
        name,
        result.catch(() => {})
      );
      return result;
    },
  };
}

describe("SponsoredTopSitesScoreProvider", () => {
  let _SponsoredTopSitesScoreProvider;
  let hasScoringFlag;
  let restoreChromeUtils;
  let restoreGlobals;
  let rsFactory;
  let rsClient;
  let executePlacesQuery;
  let cacheStore;
  let prefStore;
  let getFlags;
  let logConsole;
  let placesObservers;
  let provider;

  const PREF_LAST_TIME =
    "browser.newtabpage.activity-stream.sponsoredTopSitesScoring.lastReleaseTime";

  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        defineESModuleGetters: object => {
          Object.setPrototypeOf(object, globalThis);
          return globalThis;
        },
        importESModule: () => globalThis,
        // Leave lazy getters unset so they resolve to globals stubbed per test.
        defineLazyGetter: () => {},
      },
    });
    ({ _SponsoredTopSitesScoreProvider, hasScoringFlag } =
      await import("lib/SponsoredTopSitesScoreProvider/SponsoredTopSitesScoreProvider.mjs"));
  });

  afterAll(() => {
    restoreChromeUtils();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    rsClient = {
      get: jest.fn().mockResolvedValue([]),
    };
    rsFactory = jest.fn(() => rsClient);
    executePlacesQuery = jest.fn().mockResolvedValue([]);
    cacheStore = {};
    prefStore = {};
    getFlags = jest.fn().mockReturnValue({});
    logConsole = { debug: jest.fn() };
    placesObservers = { addListener: jest.fn(), removeListener: jest.fn() };
    restoreGlobals = stubGlobals({
      RemoteSettings: rsFactory,
      Services: {
        prefs: {
          getIntPref: (name, def) =>
            name in prefStore ? prefStore[name] : def,
          setIntPref: (name, value) => {
            prefStore[name] = value;
          },
        },
      },
      PersistentCache: class {
        async get(key) {
          return key ? cacheStore[key] : cacheStore;
        }
        async set(key, value) {
          cacheStore[key] = value;
        }
      },
      PlacesUtils: {
        getReversedHost: url => `${url.host.split("").reverse().join("")}.`,
        history: { TRANSITIONS: { LINK: 1, TYPED: 2, BOOKMARK: 3 } },
        observers: placesObservers,
      },
      PlacesVisitRemoved: { REASON_DELETED: 0, REASON_EXPIRED: 1 },
      locks: createFakeLocks(),
      NewTabUtils: {
        activityStreamProvider: { executePlacesQuery },
      },
      logConsole,
    });
    provider = new _SponsoredTopSitesScoreProvider();
    provider.init(getFlags);
  });

  afterEach(() => {
    provider.uninit();
    restoreGlobals();
    jest.useRealTimers();
  });

  const RECORD_ID = "sponsored_top_site_scoring";

  // A raw Remote Settings record that passes validation.
  const VALID_RECORD = {
    id: RECORD_ID,
    targets: { t1: ["example.com"] },
    lookback_days: 28,
    recency_halflife_days: 7,
    trend_days: 30,
    allowed_targets: 2,
    decimals: 1,
    privacy_parameter: 50,
    repeat_visit_weight: 80,
    normalization_cap: 150,
  };

  it("constructs with no scores", async () => {
    expect(provider).toBeInstanceOf(_SponsoredTopSitesScoreProvider);
    expect(await provider.getScores()).toEqual({});
  });

  describe("#init", () => {
    // Start from a provider that has not been initialized yet.
    beforeEach(() => {
      provider.uninit();
      provider = new _SponsoredTopSitesScoreProvider();
      rsFactory.mockClear();
    });

    it("creates the Remote Settings client without refreshing the scores", () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([VALID_RECORD]);

      provider.init(getFlags);

      expect(rsFactory).toHaveBeenCalledWith(
        "newtab-sponsored-topsites-scoring"
      );
      expect(rsClient.get).not.toHaveBeenCalled();
    });

    it("listens for history removals once", () => {
      const onPlacesEvent = jest
        .spyOn(provider, "_onPlacesEvent")
        .mockImplementation(() => {});
      placesObservers.addListener.mockClear();

      provider.init(getFlags);
      provider.init(getFlags);

      expect(placesObservers.addListener).toHaveBeenCalledTimes(1);
      const [[eventTypes, listener]] = placesObservers.addListener.mock.calls;
      expect(eventTypes).toEqual(["history-cleared", "page-removed"]);
      const events = [{ type: "history-cleared" }];
      listener(events);
      expect(onPlacesEvent).toHaveBeenCalledWith(events);
    });

    it("restores persisted scores from the cache", async () => {
      cacheStore.scores = { "example.com": 5 };

      provider.init(getFlags);

      expect(await provider.getScores()).toEqual({ "example.com": 5 });
    });
  });

  describe("#getScores", () => {
    it("returns the cached scores and starts a background refresh", async () => {
      cacheStore.scores = { "example.com": 5 };
      const refreshScores = jest
        .spyOn(provider, "_refreshScores")
        .mockResolvedValue();

      expect(await provider.getScores()).toEqual({ "example.com": 5 });
      expect(refreshScores).toHaveBeenCalled();
    });

    it("does not start a refresh while one is still running", async () => {
      let finishRefresh;
      const refreshScores = jest
        .spyOn(provider, "_refreshScores")
        .mockReturnValue(new Promise(resolve => (finishRefresh = resolve)));

      await provider.getScores();
      await provider.getScores();
      expect(refreshScores).toHaveBeenCalledTimes(1);

      finishRefresh();
      await provider._refreshPromise;
      await provider.getScores();
      expect(refreshScores).toHaveBeenCalledTimes(2);
    });

    it("does not refresh after uninit", async () => {
      const refreshScores = jest.spyOn(provider, "_refreshScores");
      provider.uninit();

      await provider.getScores();

      expect(refreshScores).not.toHaveBeenCalled();
    });

    it("logs refresh errors instead of throwing", async () => {
      const error = new Error("refresh failed");
      jest.spyOn(provider, "_refreshScores").mockRejectedValue(error);

      await expect(provider.getScores()).resolves.toEqual({});
      await provider._refreshPromise;
      expect(logConsole.debug).toHaveBeenCalledWith(expect.any(String), error);
    });
  });

  describe("#clearData", () => {
    it("clears the scores and history and restarts the release interval", async () => {
      cacheStore.scores = { t1: 0.3 };
      cacheStore.scoreHistory = [{ day: 100, scores: { t1: 0.31 } }];
      jest.spyOn(provider, "_getLastReleaseTime").mockReturnValue(1000);

      await provider.clearData();

      expect(cacheStore.scores).toEqual({});
      expect(cacheStore.scoreHistory).toEqual([]);
      expect(prefStore[PREF_LAST_TIME]).toBe(Math.round(Date.now() / 1000));
    });

    it("waits for a running refresh before clearing", async () => {
      cacheStore.scores = { t1: 0.3 };
      let finishRefresh;
      jest.spyOn(provider, "_refreshScores").mockReturnValue(
        new Promise(resolve => {
          finishRefresh = () => {
            cacheStore.scores = { t2: 0.5 };
            resolve();
          };
        })
      );
      jest.spyOn(provider, "_getLastReleaseTime").mockReturnValue(1000);
      await provider.getScores();

      const clearing = provider.clearData();
      // Give the clear every chance to run while the refresh is still going.
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      expect(cacheStore.scores).toEqual({ t1: 0.3 });

      finishRefresh();
      await clearing;
      expect(cacheStore.scores).toEqual({});
    });

    it("holds back a refresh started during a clear, which then writes nothing", async () => {
      cacheStore.scores = { t1: 0.3 };
      cacheStore.scoreHistory = [{ day: 100, scores: { t1: 0.31 } }];
      jest
        .spyOn(provider, "_getLastReleaseTime")
        .mockImplementation(() => prefStore[PREF_LAST_TIME] ?? 1000);
      const refreshScores = jest.spyOn(provider, "_refreshScores");
      const loadConfig = jest.spyOn(provider, "_loadConfig");
      let finishRead;
      jest.spyOn(provider._cache, "get").mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishRead = () => resolve({ ...cacheStore });
          })
      );

      const clearing = provider.clearData();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      await provider.getScores();
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
      expect(refreshScores).not.toHaveBeenCalled();

      finishRead();
      await clearing;
      await provider._refreshPromise;

      expect(refreshScores).toHaveBeenCalled();
      expect(loadConfig).not.toHaveBeenCalled();
      expect(cacheStore.scores).toEqual({});
      expect(cacheStore.scoreHistory).toEqual([]);
    });

    it("does not write anything when no scores were stored or released", async () => {
      jest.spyOn(provider, "_getLastReleaseTime").mockReturnValue(0);

      await provider.clearData();

      expect(cacheStore).toEqual({});
      expect(prefStore).toEqual({});
    });
  });

  describe("#_onPlacesEvent", () => {
    let clearData;

    beforeEach(() => {
      clearData = jest.spyOn(provider, "clearData").mockResolvedValue();
    });

    it("clears the data when all history is cleared", () => {
      provider._onPlacesEvent([{ type: "history-cleared" }]);

      expect(clearData).toHaveBeenCalledTimes(1);
    });

    it("clears the data once when the user removes pages", () => {
      provider._onPlacesEvent([
        { type: "page-removed", reason: PlacesVisitRemoved.REASON_DELETED },
        { type: "page-removed", reason: PlacesVisitRemoved.REASON_DELETED },
      ]);

      expect(clearData).toHaveBeenCalledTimes(1);
    });

    it("ignores pages removed by history expiration", () => {
      provider._onPlacesEvent([
        { type: "page-removed", reason: PlacesVisitRemoved.REASON_EXPIRED },
      ]);

      expect(clearData).not.toHaveBeenCalled();
    });
  });

  describe("#_refreshScores", () => {
    it("clears stale scores when there is no config", async () => {
      cacheStore.scores = { "example.com": 5 };

      await provider._refreshScores();

      expect(cacheStore.scores).toEqual({});
    });

    it("does not write the cache when there is no config and no scores", async () => {
      const setScores = jest.spyOn(provider, "_setScores");

      await provider._refreshScores();

      expect(setScores).not.toHaveBeenCalled();
    });

    it("persists the scores and records the release time", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ ...VALID_RECORD, targets: {} }]);

      await provider._refreshScores();

      expect(cacheStore.scores).toEqual({});
      expect(prefStore[PREF_LAST_TIME]).toBe(Math.round(Date.now() / 1000));
    });

    it("skips recomputing when last release interval is 60 seconds ago", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ id: RECORD_ID }]);
      cacheStore.scores = { "example.com": 5 };
      jest
        .spyOn(provider, "_getLastReleaseTime")
        .mockReturnValue(Math.round(Date.now() / 1000) - 60);

      await provider._refreshScores();

      // Check that scores are untouched and release time is not set.
      expect(await provider.getScores()).toEqual({ "example.com": 5 });
      expect(prefStore[PREF_LAST_TIME]).toBeUndefined();
      expect(rsClient.get).not.toHaveBeenCalled();
    });
  });

  describe("#_refreshScores pipeline", () => {
    const TODAY = 20000;
    const config = {
      id: RECORD_ID,
      targets: {
        t1: ["example.com"],
        t2: ["example.org"],
        t3: ["example.net"],
      },
      lookback_days: 2,
      recency_halflife_days: 1,
      repeat_visit_weight: 50,
      normalization_cap: 100,
      privacy_parameter: 100,
      trend_days: 2,
      decimals: 1,
      allowed_targets: 2,
    };

    beforeEach(() => {
      jest.setSystemTime(TODAY * 24 * 60 * 60 * 1000);
      provider._rs = rsClient;
    });

    it("stores today's private scores and persists the top trend scores", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([config]);
      executePlacesQuery.mockResolvedValue([
        { rev_host: "moc.elpmaxe.", day: TODAY, visits: 1 },
        { rev_host: "gro.elpmaxe.", day: TODAY, visits: 2 },
        { rev_host: "ten.elpmaxe.", day: TODAY - 1, visits: 4 },
      ]);
      jest.spyOn(provider, "_sampleLaplace").mockReturnValue(0);
      // t3 scored high on earlier days but its trend is downward
      cacheStore.scoreHistory = [
        { day: TODAY - 2, scores: { t3: 0.8 } },
        { day: TODAY - 1, scores: { t3: 0.5 } },
      ];

      await provider._refreshScores();

      expect(cacheStore.scoreHistory.at(-1)).toEqual({
        day: TODAY,
        scores: { t1: 1 / 3, t2: 0.5, t3: 0.3125 },
      });
      expect(cacheStore.scoreHistory.at(-2)).toEqual({
        day: TODAY - 1,
        scores: { t3: 0.5 },
      });
      expect(await provider.getScores()).toEqual({ t2: 0.5, t1: 0.3 });
      expect(prefStore[PREF_LAST_TIME]).toBe(Math.round(Date.now() / 1000));
    });

    it("caps the privacy parameter at 1", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ ...config, privacy_parameter: 1000 }]);
      executePlacesQuery.mockResolvedValue([
        { rev_host: "moc.elpmaxe.", day: TODAY, visits: 1 },
      ]);
      const sampleLaplace = jest
        .spyOn(provider, "_sampleLaplace")
        .mockReturnValue(0);

      await provider._refreshScores();

      // With an overlap of 1, the scale is sqrt(1) / (1 * 2 * 1) = 0.5. An
      // uncapped privacy parameter of 10 would give 0.05.
      expect(sampleLaplace).toHaveBeenCalledWith(0.5);
    });
  });

  describe("#uninit", () => {
    it("releases the Remote Settings client", () => {
      provider.uninit();

      expect(provider._rs).toBeNull();
    });

    it("stops listening for history removals", () => {
      const [[, listener]] = placesObservers.addListener.mock.calls;

      provider.uninit();

      expect(placesObservers.removeListener).toHaveBeenCalledWith(
        ["history-cleared", "page-removed"],
        listener
      );
    });
  });

  describe("hasScoringFlag", () => {
    it("is true when a scoring flag is enabled", () => {
      expect(hasScoringFlag({ [RECORD_ID]: true })).toBe(true);
      expect(hasScoringFlag({ [`${RECORD_ID}_1`]: true, other: false })).toBe(
        true
      );
    });

    it("is false when no scoring flag is enabled", () => {
      expect(hasScoringFlag({ [RECORD_ID]: false, other: true })).toBe(false);
      expect(hasScoringFlag({})).toBe(false);
      expect(hasScoringFlag(undefined)).toBe(false);
      expect(hasScoringFlag(null)).toBe(false);
    });
  });

  describe("#_getRecordId", () => {
    it("returns the enabled flag name when exactly one is enabled", () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      expect(provider._getRecordId()).toBe(RECORD_ID);
    });

    it("returns null when no flag is enabled", () => {
      expect(provider._getRecordId()).toBeNull();
    });

    it("returns null when multiple flags are enabled", () => {
      getFlags.mockReturnValue({
        sponsored_top_site_scoring: true,
        sponsored_top_site_scoring_1: true,
      });
      expect(provider._getRecordId()).toBeNull();
    });

    it("returns null when no flags exist", () => {
      getFlags.mockReturnValue(undefined);
      expect(provider._getRecordId()).toBeNull();
    });
  });

  describe("#_loadConfig", () => {
    it("returns the record matching the enabled flag with hundredths converted", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([VALID_RECORD]);

      await expect(provider._loadConfig()).resolves.toEqual({
        ...VALID_RECORD,
        privacy_parameter: 0.5,
        repeat_visit_weight: 0.8,
        normalization_cap: 1.5,
      });
    });

    it("does not modify the Remote Settings record", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      const record = { ...VALID_RECORD };
      rsClient.get.mockResolvedValue([record]);

      await provider._loadConfig();

      expect(record).toEqual(VALID_RECORD);
    });

    it("caps the privacy parameter at 1", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([
        { ...VALID_RECORD, privacy_parameter: 500 },
      ]);

      const config = await provider._loadConfig();

      expect(config.privacy_parameter).toBe(1);
    });

    it("returns null when the matching record is invalid", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ ...VALID_RECORD, lookback_days: 0 }]);

      await expect(provider._loadConfig()).resolves.toBeNull();
    });

    it("returns null without calling Remote Settings when no flag is enabled", async () => {
      await expect(provider._loadConfig()).resolves.toBeNull();
      expect(rsClient.get).not.toHaveBeenCalled();
    });

    it("returns null when no record matches the enabled flag", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ id: "invalid_identifier" }]);

      await expect(provider._loadConfig()).resolves.toBeNull();
    });
  });

  describe("#_isValidConfig", () => {
    it("accepts a complete record", () => {
      expect(provider._isValidConfig(VALID_RECORD)).toBe(true);
    });

    it("accepts the boundary values", () => {
      expect(
        provider._isValidConfig({
          ...VALID_RECORD,
          lookback_days: 1,
          recency_halflife_days: 1,
          trend_days: 1,
          allowed_targets: 0,
          decimals: 4,
          privacy_parameter: 1,
          repeat_visit_weight: 0,
          normalization_cap: 1,
        })
      ).toBe(true);
    });

    it.each([
      ["lookback_days", 0],
      ["lookback_days", 1.5],
      ["recency_halflife_days", 0],
      ["trend_days", 0],
      ["allowed_targets", -1],
      ["decimals", 0],
      ["decimals", 5],
      ["privacy_parameter", 0],
      ["privacy_parameter", "50"],
      ["privacy_parameter", 0.5],
      ["repeat_visit_weight", -1],
      ["repeat_visit_weight", 100],
      ["normalization_cap", 0],
      ["normalization_cap", undefined],
    ])("rejects %s set to %p", (field, value) => {
      expect(provider._isValidConfig({ ...VALID_RECORD, [field]: value })).toBe(
        false
      );
    });
  });

  describe("#_getDomainDayCounts", () => {
    const config = {
      targets: { t1: ["example.com", "sub.example.org"] },
      lookback_days: 28,
    };

    const TODAY = 20000;
    beforeEach(() => {
      jest.setSystemTime(TODAY * 24 * 60 * 60 * 1000);
    });

    it("buckets visits per configured domain and day, merging subdomains and dropping other domains", async () => {
      executePlacesQuery.mockResolvedValue([
        { rev_host: "moc.elpmaxe.", day: TODAY, visits: 3 },
        { rev_host: "moc.elpmaxe.", day: TODAY - 1, visits: 1 },
        // www.example.com merges into example.com on the same day.
        { rev_host: "moc.elpmaxe.www.", day: TODAY - 1, visits: 2 },
        { rev_host: "gro.elpmaxe.bus.", day: TODAY - 1, visits: 2 },
        // Not a configured target, so it is dropped.
        { rev_host: "moc.rehto.", day: TODAY - 1, visits: 9 },
        // A null rev_host is dropped without error.
        { rev_host: null, day: TODAY - 1, visits: 1 },
      ]);

      const domainDayCounts = await provider._getDomainDayCounts(config);

      expect(domainDayCounts.get("example.com")).toEqual(
        new Map([
          [0, 3],
          [-1, 3],
        ])
      );
      expect(domainDayCounts.get("sub.example.org")).toEqual(
        new Map([[-1, 2]])
      );
      expect(domainDayCounts.size).toBe(2);
    });

    it("attributes a visit to the most specific configured domain", async () => {
      executePlacesQuery.mockResolvedValue([
        // sub.example.com is the more specific match and wins over example.com.
        { rev_host: "moc.elpmaxe.bus.", day: TODAY, visits: 2 },
        // Other subdomains fall back to the parent example.com.
        { rev_host: "moc.elpmaxe.www.", day: TODAY, visits: 1 },
      ]);

      const domainDayCounts = await provider._getDomainDayCounts({
        targets: { t1: ["example.com", "sub.example.com"] },
        lookback_days: 28,
      });

      expect(domainDayCounts.get("sub.example.com")).toEqual(new Map([[0, 2]]));
      expect(domainDayCounts.get("example.com")).toEqual(new Map([[0, 1]]));
    });

    it("returns an empty result without querying when there are no target domains", async () => {
      const domainDayCounts = await provider._getDomainDayCounts({
        targets: {},
        lookback_days: 28,
      });

      expect(domainDayCounts.size).toBe(0);
      expect(executePlacesQuery).not.toHaveBeenCalled();
    });
  });

  describe("#_domainScore", () => {
    const config = {
      recency_halflife_days: 1,
      repeat_visit_weight: 0.5,
      lookback_days: 2,
    };

    it("returns 0 when there are no visits", () => {
      expect(provider._domainScore(new Map(), config)).toBe(0);
    });

    it("repeat visits within a day", () => {
      expect(provider._domainScore(new Map([[0, 2]]), config)).toBe(0.5);
    });

    it("sums the contributions of each day", () => {
      expect(
        provider._domainScore(
          new Map([
            [0, 2],
            [-1, 1],
          ]),
          config
        )
      ).toBe(2 / 3);
    });

    it("ignores repeat visits when the weight is 0", () => {
      config.repeat_visit_weight = 0.0;
      expect(provider._domainScore(new Map([[-1, 2]]), config)).toBe(1 / 3);
    });
  });

  describe("#_sponsoredScores", () => {
    // A single visit today scores 1 / 3 per domain with this config.
    const config = {
      targets: {
        t1: ["example.com", "Example.org"],
        t2: ["example.net"],
      },
      recency_halflife_days: 1,
      repeat_visit_weight: 0.5,
      lookback_days: 2,
      normalization_cap: 2,
    };
    const domainDayCounts = new Map([
      ["example.com", new Map([[0, 1]])],
      ["example.org", new Map([[-1, 1]])],
    ]);

    it("sums domain scores per target and scores targets without visits as 0", () => {
      const scores = provider._sponsoredScores(config, domainDayCounts);

      expect(scores.t1).toBe(0.25);
      expect(scores.t2).toBe(0);
    });

    it("caps the score at 1 when the sum exceeds the normalization cap", () => {
      const scores = provider._sponsoredScores(
        { ...config, normalization_cap: 0.4 },
        domainDayCounts
      );

      expect(scores.t1).toBe(1);
      expect(scores.t2).toBe(0);
    });

    it("returns no scores when there are no targets", () => {
      expect(
        provider._sponsoredScores({ ...config, targets: {} }, domainDayCounts)
      ).toEqual({});
    });
  });

  describe("#_getOverlap", () => {
    it("returns the largest number of targets sharing one domain", () => {
      expect(
        provider._getOverlap({
          targets: {
            t1: ["example.com", "example.org"],
            t2: ["Example.com", "example.net"],
            t3: ["example.com", "example.org"],
          },
        })
      ).toBe(3);
    });

    it("returns 1 when no domain is shared between targets", () => {
      expect(
        provider._getOverlap({
          targets: {
            t1: ["example.com"],
            t2: ["example.org"],
          },
        })
      ).toBe(1);
    });

    it("returns 0 when there are no targets", () => {
      expect(provider._getOverlap({ targets: {} })).toBe(0);
    });
  });

  describe("#_differentiallyPrivateScores", () => {
    // Overlap is 4, so the scale is sqrt(4) / (0.5 * 10 * 0.5) = 0.8.
    const config = {
      targets: {
        t1: ["example.com"],
        t2: ["example.com"],
        t3: ["example.com"],
        t4: ["example.com", "example.org"],
      },
      normalization_cap: 0.5,
      lookback_days: 10,
      privacy_parameter: 0.5,
    };

    it("adds Laplace noise with the configured scale to each score", () => {
      const sampleLaplace = jest
        .spyOn(provider, "_sampleLaplace")
        .mockReturnValueOnce(0.3)
        .mockReturnValueOnce(-0.4);

      const scores = provider._differentiallyPrivateScores(
        { t1: 0.5, t2: 0.25 },
        config
      );

      expect(sampleLaplace).toHaveBeenCalledTimes(2);
      expect(sampleLaplace).toHaveBeenCalledWith(0.8);
      expect(scores.t1).toBeCloseTo(0.8);
      expect(scores.t2).toBeCloseTo(-0.15);
    });

    it("returns no scores when there are no scores", () => {
      expect(provider._differentiallyPrivateScores({}, config)).toEqual({});
    });
  });

  describe("#_sampleLaplace", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function mockRandomValue(value) {
      jest.spyOn(crypto, "getRandomValues").mockImplementation(array => {
        array[0] = value;
        return array;
      });
    }

    it("returns a negative sample below the median", () => {
      mockRandomValue(2 ** 30);
      expect(provider._sampleLaplace(2)).toBeCloseTo(-2 * Math.LN2);
    });

    it("returns a positive sample above the median", () => {
      mockRandomValue(3 * 2 ** 30);
      expect(provider._sampleLaplace(2)).toBeCloseTo(2 * Math.LN2);
    });

    it("returns finite samples at the extremes of the random range", () => {
      mockRandomValue(0);
      expect(Number.isFinite(provider._sampleLaplace(1))).toBe(true);
      mockRandomValue(2 ** 32 - 1);
      expect(Number.isFinite(provider._sampleLaplace(1))).toBe(true);
    });

    it("has a mean absolute value equal to the scale", () => {
      const samples = 10000;
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += Math.abs(provider._sampleLaplace(1));
      }
      expect(sum / samples).toBeCloseTo(1, 1);
    });
  });

  describe("#_appendScoreHistory", () => {
    it("persists each day's scores in order", async () => {
      await provider._appendScoreHistory(100, { t1: 0.1 });
      await provider._appendScoreHistory(100, { t1: 0.9 });
      await provider._appendScoreHistory(101, { t1: 0.2 });

      expect(cacheStore.scoreHistory).toEqual([
        { day: 100, scores: { t1: 0.1 } },
        { day: 101, scores: { t1: 0.2 } },
      ]);
    });

    it("keeps only the 30 most recent days", async () => {
      for (let day = 1; day <= 31; day++) {
        await provider._appendScoreHistory(day, { t1: day });
      }

      expect(cacheStore.scoreHistory).toHaveLength(30);
      expect(cacheStore.scoreHistory[0].day).toBe(2);
      expect(cacheStore.scoreHistory.at(-1).day).toBe(31);
    });
  });

  describe("#_getScoreHistory", () => {
    it("returns the scores keyed by day offset from today", async () => {
      cacheStore.scoreHistory = [
        { day: 95, scores: { t1: 0.1 } },
        { day: 99, scores: { t1: 0.2 } },
        { day: 100, scores: { t1: 0.3 } },
      ];

      expect(await provider._getScoreHistory(100)).toEqual(
        new Map([
          [-5, { t1: 0.1 }],
          [-1, { t1: 0.2 }],
          [0, { t1: 0.3 }],
        ])
      );
    });

    it("returns an empty map when there is no history", async () => {
      expect(await provider._getScoreHistory(100)).toEqual(new Map());
    });
  });

  describe("#_trendFitting", () => {
    const config = {
      targets: {
        t1: ["example.com"],
        t2: ["example.org"],
        t3: ["example.net"],
      },
      trend_days: 5,
    };

    it("fits each target over the days within the trend window", () => {
      // t1 follows y = 0.5 + 0.1x, so the fit at day 0 is 0.5. Day -5 is
      // outside the window and would pull the fit down if it were included.
      const scoreHistory = new Map([
        [-5, { t1: 10, t2: 10 }],
        [-4, { t1: 0.1, t2: 0.45 }],
        [-3, { t1: 0.2 }],
        [-2, { t2: 0.3 }],
        [0, { t1: 0.5, t2: 0.45 }],
      ]);

      const scores = provider._trendFitting(scoreHistory, config);

      expect(scores.t1).toBeCloseTo(0.5);
      expect(scores.t2).toBeCloseTo(0.4);
      expect(scores).not.toHaveProperty("t3");
    });

    it("returns no scores when there is no history", () => {
      expect(provider._trendFitting(new Map(), config)).toEqual({});
    });
  });

  describe("#_linearFitAtZero", () => {
    it("recovers the intercept of points on a line", () => {
      // y = 0.5 + 0.01x
      const points = [-1, -2, -3, -5].map(x => [x, 0.5 + 0.01 * x]);
      expect(provider._linearFitAtZero(points)).toBeCloseTo(0.5);
    });

    it("returns the least-squares fit for points not on a line", () => {
      expect(
        provider._linearFitAtZero([
          [-2, 0.5],
          [-1, 0.75],
          [0, 0.7],
        ])
      ).toBeCloseTo(0.75);
    });

    it("returns the only y value for a single point", () => {
      expect(provider._linearFitAtZero([[-3, 0.4]])).toBe(0.4);
    });
  });

  describe("#_postProcessScores", () => {
    // Each score is stored as a single day 0 entry, so the trend fit returns
    // it unchanged and it tests only the sorting, clamping, and rounding.
    function postProcess(scores, config) {
      return provider._postProcessScores(new Map([[0, scores]]), {
        targets: Object.fromEntries(Object.keys(scores).map(t => [t, []])),
        trend_days: 1,
        ...config,
      });
    }

    it("clamps to [0, 1] and rounds down to the configured decimals", () => {
      expect(
        postProcess(
          { t1: 0.19, t2: 1.4, t3: -0.2, t4: 0.5 },
          { decimals: 1, allowed_targets: 10 }
        )
      ).toEqual({ t1: 0.1, t2: 1, t3: 0, t4: 0.5 });

      expect(
        postProcess({ t1: 0.456 }, { decimals: 2, allowed_targets: 10 })
      ).toEqual({ t1: 0.45 });
    });

    it("keeps the highest scoring targets, ranked before rounding", () => {
      // All round down to 0.1, but t2 has the highest fitted score then t4.
      const scores = postProcess(
        { t1: 0.14, t2: 0.19, t3: 0.11, t4: 0.17 },
        { decimals: 1, allowed_targets: 2 }
      );

      expect(scores).toEqual({ t2: 0.1, t4: 0.1 });
    });
  });
});
