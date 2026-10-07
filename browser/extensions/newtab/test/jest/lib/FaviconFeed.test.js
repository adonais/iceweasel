/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
import { actionTypes as at } from "common/Actions.mjs";
import { stubGlobals } from "test/jest/test-utils";

describe("FaviconFeed", () => {
  let FaviconFeed;
  let feed;
  let restoreChromeUtils;

  // FaviconFeed pulls in TopSites.sys.mjs, which resolves its lazy module
  // getters and builds its singleton at load time, so these globals have to
  // exist before the module is evaluated.
  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        defineESModuleGetters: object => {
          Object.setPrototypeOf(object, globalThis);
          return globalThis;
        },
        defineLazyGetter: (object, name, getter) => {
          Object.defineProperty(object, name, {
            configurable: true,
            get() {
              const value = getter();
              Object.defineProperty(object, name, {
                configurable: true,
                value,
              });
              return value;
            },
          });
        },
      },
      LinksCache: class {},
      NewTabUtils: { activityStreamLinks: {} },
    });
    ({ FaviconFeed } = await import("lib/FaviconFeed.sys.mjs"));
  });

  afterAll(() => {
    restoreChromeUtils();
  });

  beforeEach(() => {
    feed = new FaviconFeed();
    jest.spyOn(feed.faviconProvider, "fetchIcon").mockResolvedValue(undefined);
    feed.store = {
      dispatch: jest.fn(),
    };
  });

  it("should create a FaviconFeed", () => {
    expect(feed).toBeInstanceOf(FaviconFeed);
  });

  describe("#onAction", () => {
    it("should fetchIcon on RICH_ICON_MISSING", async () => {
      const url = "https://mozilla.org";
      feed.onAction({ type: at.RICH_ICON_MISSING, data: { url } });
      expect(feed.faviconProvider.fetchIcon).toHaveBeenCalledTimes(1);
      expect(feed.faviconProvider.fetchIcon).toHaveBeenCalledWith(url);
    });
  });
});
