/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mockServices, stubGlobals } from "test/jest/test-utils";

const URL = "foo.com";
const FAKE_THUMBNAIL_PATH = "fake/path/thumb.jpg";
const FAKE_THUMBNAIL_THUMB =
  "moz-page-thumb://thumbnail?url=http%3A%2F%2Ffoo.com%2F";

describe("Screenshots", () => {
  let Screenshots;
  let restoreChromeUtils;
  let restoreGlobals;
  let consoleWarnStub;
  let fakeServices;
  let testFile;
  let originalMethods;

  // Screenshots.sys.mjs resolves XPCOMUtils and its lazy module getters at load
  // time, so ChromeUtils has to exist before the module is evaluated. Pointing
  // the lazy holder's prototype at globalThis is what lets the per-test stubs
  // below (PageThumbs, gPrivilegedAboutProcessEnabled, ...) be seen.
  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        importESModule: () => ({
          XPCOMUtils: { defineLazyPreferenceGetter: () => {} },
        }),
        defineESModuleGetters: object => {
          Object.setPrototypeOf(object, globalThis);
          return globalThis;
        },
      },
    });
    ({ Screenshots } = await import("lib/Screenshots.sys.mjs"));
  });

  afterAll(() => {
    restoreChromeUtils();
  });

  beforeEach(() => {
    originalMethods = {
      getScreenshotForURL: Screenshots.getScreenshotForURL,
      _shouldGetScreenshots: Screenshots._shouldGetScreenshots,
    };
    consoleWarnStub = jest.spyOn(console, "warn").mockImplementation(() => {});
    fakeServices = mockServices(["wm"]);
    fakeServices.wm.getEnumerator.mockReturnValue(Array(10));
    testFile = { size: 1 };
    restoreGlobals = stubGlobals({
      BackgroundPageThumbs: {
        captureIfMissing: jest.fn(() => Promise.resolve()),
      },
      PageThumbs: {
        _store: jest.fn(),
        getThumbnailPath: jest.fn(() => FAKE_THUMBNAIL_PATH),
        getThumbnailURL: jest.fn(() => FAKE_THUMBNAIL_THUMB),
      },
      PrivateBrowsingUtils: {
        isWindowPrivate: jest.fn(() => false),
      },
      Services: fakeServices,
      fetch: jest.fn(() =>
        Promise.resolve({ blob: () => Promise.resolve(testFile) })
      ),
      gPrivilegedAboutProcessEnabled: false,
    });
  });
  afterEach(() => {
    Object.assign(Screenshots, originalMethods);
    restoreGlobals();
    consoleWarnStub.mockRestore();
  });

  describe("#getScreenshotForURL", () => {
    it("should call BackgroundPageThumbs.captureIfMissing with the correct url", async () => {
      await Screenshots.getScreenshotForURL(URL);
      expect(
        globalThis.BackgroundPageThumbs.captureIfMissing
      ).toHaveBeenCalledWith(URL, expect.any(Object));
    });
    it("should call PageThumbs.getThumbnailPath with the correct url", async () => {
      globalThis.gPrivilegedAboutProcessEnabled = false;
      await Screenshots.getScreenshotForURL(URL);
      expect(globalThis.PageThumbs.getThumbnailPath).toHaveBeenCalledWith(URL);
    });
    it("should call fetch", async () => {
      await Screenshots.getScreenshotForURL(URL);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
    it("should have the necessary keys in the response object", async () => {
      const screenshot = await Screenshots.getScreenshotForURL(URL);

      expect(screenshot.path).not.toBeUndefined();
      expect(screenshot.data).not.toBeUndefined();
    });
    it("should get null if something goes wrong", async () => {
      globalThis.BackgroundPageThumbs = {
        captureIfMissing: () =>
          Promise.reject(new Error("Cannot capture thumbnail")),
      };

      const screenshot = await Screenshots.getScreenshotForURL(URL);

      expect(globalThis.PageThumbs._store).toHaveBeenCalledTimes(1);
      expect(screenshot).toBeNull();
    });
    it("should get direct thumbnail url for privileged process", async () => {
      globalThis.gPrivilegedAboutProcessEnabled = true;
      await Screenshots.getScreenshotForURL(URL);
      expect(globalThis.PageThumbs.getThumbnailURL).toHaveBeenCalledWith(URL);
    });
    it("should get null without storing if existing thumbnail is empty", async () => {
      testFile.size = 0;

      const screenshot = await Screenshots.getScreenshotForURL(URL);

      expect(globalThis.PageThumbs._store).not.toHaveBeenCalled();
      expect(screenshot).toBeNull();
    });
  });

  describe("#maybeCacheScreenshot", () => {
    let link;
    beforeEach(() => {
      link = {
        __sharedCache: {
          updateLink: (prop, val) => {
            link[prop] = val;
          },
        },
      };
    });
    it("should call getScreenshotForURL", () => {
      Screenshots.getScreenshotForURL = jest.fn();
      Screenshots._shouldGetScreenshots = jest.fn(() => true);
      Screenshots.maybeCacheScreenshot(link, "mozilla.com", "image", jest.fn());

      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledTimes(1);
      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledWith(
        "mozilla.com"
      );
    });
    it("should not call getScreenshotForURL twice if a fetch is in progress", () => {
      Screenshots.getScreenshotForURL = jest.fn(() => new Promise(() => {}));
      Screenshots._shouldGetScreenshots = jest.fn(() => true);
      Screenshots.maybeCacheScreenshot(link, "mozilla.com", "image", jest.fn());
      Screenshots.maybeCacheScreenshot(link, "mozilla.org", "image", jest.fn());

      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledTimes(1);
      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledWith(
        "mozilla.com"
      );
    });
    it("should not call getScreenshotsForURL if property !== undefined", async () => {
      Screenshots.getScreenshotForURL = jest.fn(() => Promise.resolve(null));
      Screenshots._shouldGetScreenshots = jest.fn(() => true);
      await Screenshots.maybeCacheScreenshot(
        link,
        "mozilla.com",
        "image",
        jest.fn()
      );
      await Screenshots.maybeCacheScreenshot(
        link,
        "mozilla.org",
        "image",
        jest.fn()
      );

      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledTimes(1);
      expect(Screenshots.getScreenshotForURL).toHaveBeenCalledWith(
        "mozilla.com"
      );
    });
    it("should check if we are in private browsing before getting screenshots", async () => {
      Screenshots._shouldGetScreenshots = jest.fn(() => true);
      await Screenshots.maybeCacheScreenshot(
        link,
        "mozilla.com",
        "image",
        jest.fn()
      );

      expect(Screenshots._shouldGetScreenshots).toHaveBeenCalledTimes(1);
    });
    it("should not get a screenshot if we are in private browsing", async () => {
      Screenshots.getScreenshotForURL = jest.fn();
      Screenshots._shouldGetScreenshots = jest.fn(() => false);
      await Screenshots.maybeCacheScreenshot(
        link,
        "mozilla.com",
        "image",
        jest.fn()
      );

      expect(Screenshots.getScreenshotForURL).not.toHaveBeenCalled();
    });
  });

  describe("#_shouldGetScreenshots", () => {
    beforeEach(() => {
      let more = 2;
      fakeServices.wm.getEnumerator.mockImplementation(() =>
        Array(Math.max(more--, 0))
      );
    });
    it("should use private browsing utils to determine if a window is private", () => {
      Screenshots._shouldGetScreenshots();
      expect(
        globalThis.PrivateBrowsingUtils.isWindowPrivate
      ).toHaveBeenCalledTimes(1);
    });
    it("should return true if there exists at least 1 non-private window", () => {
      expect(Screenshots._shouldGetScreenshots()).toBe(true);
    });
    it("should return false if there exists private windows", () => {
      globalThis.PrivateBrowsingUtils = {
        isWindowPrivate: jest.fn(() => true),
      };
      expect(Screenshots._shouldGetScreenshots()).toBe(false);
      expect(
        globalThis.PrivateBrowsingUtils.isWindowPrivate
      ).toHaveBeenCalledTimes(2);
    });
  });
});
