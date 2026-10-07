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
    getFlags = jest.fn().mockReturnValue({});
    restoreGlobals = stubGlobals({ RemoteSettings: rsFactory });
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
});
