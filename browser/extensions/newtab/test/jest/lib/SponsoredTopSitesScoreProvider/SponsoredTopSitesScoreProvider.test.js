/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stubGlobals } from "test/jest/test-utils";

describe("SponsoredTopSitesScoreProvider", () => {
  let SponsoredTopSitesScoreProvider;
  let restoreChromeUtils;
  let restoreGlobals;
  let rsFactory;
  let rsClient;
  let executePlacesQuery;
  let getFlags;
  let provider;

  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        defineESModuleGetters: object => {
          Object.setPrototypeOf(object, globalThis);
          return globalThis;
        },
      },
    });
    ({ SponsoredTopSitesScoreProvider } =
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
    getFlags = jest.fn().mockReturnValue({});
    restoreGlobals = stubGlobals({
      RemoteSettings: rsFactory,
      PlacesUtils: {
        getReversedHost: url => `${url.host.split("").reverse().join("")}.`,
        history: { TRANSITIONS: { LINK: 1, TYPED: 2, BOOKMARK: 3 } },
      },
      NewTabUtils: {
        activityStreamProvider: { executePlacesQuery },
      },
    });
    provider = new SponsoredTopSitesScoreProvider(getFlags);
  });

  afterEach(() => {
    restoreGlobals();
    jest.useRealTimers();
  });

  const RECORD_ID = "sponsored_top_site_scoring";

  it("constructs with no scores", () => {
    expect(provider).toBeInstanceOf(SponsoredTopSitesScoreProvider);
    expect(provider.getScores()).toEqual({});
  });

  describe("#init", () => {
    it("creates the Remote Settings client and starts the refresh timer", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      rsClient.get.mockResolvedValue([{ id: RECORD_ID }]);

      await provider.init();

      expect(rsFactory).toHaveBeenCalledWith(
        "newtab-sponsored-topsites-scoring"
      );
      expect(provider._refreshTimer).not.toBeNull();
    });
  });

  describe("#uninit", () => {
    it("clears the timer, client, and scores", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      await provider.init();

      provider.uninit();

      expect(provider._refreshTimer).toBeNull();
      expect(provider._rs).toBeNull();
      expect(provider.getScores()).toEqual({});
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
    beforeEach(() => {
      provider._rs = rsClient;
    });

    it("returns the record matching the enabled flag", async () => {
      getFlags.mockReturnValue({ [RECORD_ID]: true });
      const record = { id: RECORD_ID, targets: {} };
      rsClient.get.mockResolvedValue([record]);

      await expect(provider._loadConfig()).resolves.toEqual(record);
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

  describe("#_getDomainDayCounts", () => {
    const config = {
      targets: { t1: ["example.com", "sub.example.org"] },
      lookback_days: 28,
    };

    it("buckets visits per configured domain and day, merging subdomains and dropping other domains", async () => {
      executePlacesQuery.mockResolvedValue([
        { rev_host: "moc.elpmaxe.", day: 100, visits: 3 },
        { rev_host: "moc.elpmaxe.", day: 101, visits: 1 },
        // www.example.com merges into example.com on the same day.
        { rev_host: "moc.elpmaxe.www.", day: 101, visits: 2 },
        { rev_host: "gro.elpmaxe.bus.", day: 101, visits: 2 },
        // Not a configured target, so it is dropped.
        { rev_host: "moc.rehto.", day: 101, visits: 9 },
        // A null rev_host is dropped without error.
        { rev_host: null, day: 101, visits: 1 },
      ]);

      const domainDayCounts = await provider._getDomainDayCounts(config);

      expect(domainDayCounts.get("example.com")).toEqual(
        new Map([
          [100, 3],
          [101, 3],
        ])
      );
      expect(domainDayCounts.get("sub.example.org")).toEqual(
        new Map([[101, 2]])
      );
      expect(domainDayCounts.size).toBe(2);
    });

    it("attributes a visit to the most specific configured domain", async () => {
      executePlacesQuery.mockResolvedValue([
        // sub.example.com is the more specific match and wins over example.com.
        { rev_host: "moc.elpmaxe.bus.", day: 100, visits: 2 },
        // Other subdomains fall back to the parent example.com.
        { rev_host: "moc.elpmaxe.www.", day: 100, visits: 1 },
      ]);

      const domainDayCounts = await provider._getDomainDayCounts({
        targets: { t1: ["example.com", "sub.example.com"] },
        lookback_days: 28,
      });

      expect(domainDayCounts.get("sub.example.com")).toEqual(
        new Map([[100, 2]])
      );
      expect(domainDayCounts.get("example.com")).toEqual(new Map([[100, 1]]));
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
});
