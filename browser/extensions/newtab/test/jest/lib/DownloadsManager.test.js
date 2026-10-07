/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionTypes as at } from "common/Actions.mjs";
import { DownloadsManager } from "lib/DownloadsManager.sys.mjs";
import { stubGlobals } from "test/jest/test-utils";

describe("Downloads Manager", () => {
  let downloadsManager;
  let restoreGlobals;
  let downloadData;
  let downloadsCommon;
  let isBlocked;
  const DOWNLOAD_URL = "https://site.com/download.mov";

  beforeEach(() => {
    downloadData = {
      addView: jest.fn(),
      removeView: jest.fn(),
    };
    downloadsCommon = {
      getData: jest.fn(() => downloadData),
      copyDownloadLink: jest.fn(),
      deleteDownload: jest.fn(() => Promise.resolve()),
      openDownload: jest.fn(),
      showDownloadedFile: jest.fn(),
    };
    isBlocked = jest.fn(() => false);

    restoreGlobals = stubGlobals({
      Cc: {
        "@mozilla.org/timer;1": {
          createInstance() {
            return {
              initWithCallback: jest.fn(callback => callback()),
              cancel: jest.fn(),
            };
          },
        },
      },
      Ci: { nsITimer: { TYPE_ONE_SHOT: 1 } },
      DownloadsCommon: downloadsCommon,
      // getSizeWithUnits drives the formatted description asserted below.
      DownloadsViewUI: {
        getDisplayName: () => "filename.ext",
        getSizeWithUnits: () => "1.5 MB",
      },
      FileUtils: { File: class {} },
      BrowserUtils: {
        whereToOpenLink: jest.fn(() => "current"),
      },
      NewTabUtils: { blockedLinks: { isBlocked } },
    });

    downloadsManager = new DownloadsManager();
    downloadsManager.init({ dispatch() {} });
    downloadsManager.onDownloadAdded({
      source: { url: DOWNLOAD_URL },
      endTime: Date.now(),
      target: { path: "/path/to/download.mov", exists: true },
      succeeded: true,
      refresh: async () => {},
    });
    expect(downloadsManager._downloadItems.has(DOWNLOAD_URL)).toBe(true);
  });
  afterEach(() => {
    downloadsManager._downloadItems.clear();
    restoreGlobals();
  });
  describe("#init", () => {
    it("should add a DownloadsCommon view on init", () => {
      downloadsManager.init({ dispatch() {} });
      expect(downloadData.addView).toHaveBeenCalledTimes(2);
    });
  });
  describe("#onAction", () => {
    it("should copy the file on COPY_DOWNLOAD_LINK", () => {
      downloadsManager.onAction({
        type: at.COPY_DOWNLOAD_LINK,
        data: { url: DOWNLOAD_URL },
      });
      expect(downloadsCommon.copyDownloadLink).toHaveBeenCalledTimes(1);
    });
    it("should remove the file on REMOVE_DOWNLOAD_FILE", () => {
      downloadsManager.onAction({
        type: at.REMOVE_DOWNLOAD_FILE,
        data: { url: DOWNLOAD_URL },
      });
      expect(downloadsCommon.deleteDownload).toHaveBeenCalledTimes(1);
    });
    it("should show the file on SHOW_DOWNLOAD_FILE", () => {
      downloadsManager.onAction({
        type: at.SHOW_DOWNLOAD_FILE,
        data: { url: DOWNLOAD_URL },
      });
      expect(downloadsCommon.showDownloadedFile).toHaveBeenCalledTimes(1);
    });
    it("should open the file on OPEN_DOWNLOAD_FILE if the type is download", () => {
      downloadsManager.onAction({
        type: at.OPEN_DOWNLOAD_FILE,
        data: { url: DOWNLOAD_URL, type: "download" },
        _target: { browser: {} },
      });
      expect(downloadsCommon.openDownload).toHaveBeenCalledTimes(1);
    });
    it("should copy the file on UNINIT", () => {
      // DownloadsManager._downloadData needs to exist first
      downloadsManager.onAction({ type: at.UNINIT });
      expect(downloadData.removeView).toHaveBeenCalledTimes(1);
    });
    it("should not execute a download command if we do not have the correct url", () => {
      downloadsManager.onAction({
        type: at.SHOW_DOWNLOAD_FILE,
        data: { url: "unknown_url" },
      });
      expect(downloadsCommon.showDownloadedFile).not.toHaveBeenCalled();
    });
  });
  describe("#onDownloadAdded", () => {
    let newDownload;
    beforeEach(() => {
      downloadsManager._downloadItems.clear();
      newDownload = {
        source: { url: "https://site.com/newDownload.mov" },
        endTime: Date.now(),
        target: { path: "/path/to/newDownload.mov", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
    });
    afterEach(() => {
      downloadsManager._downloadItems.clear();
    });
    it("should add a download on onDownloadAdded", () => {
      downloadsManager.onDownloadAdded(newDownload);
      expect(
        downloadsManager._downloadItems.has("https://site.com/newDownload.mov")
      ).toBe(true);
    });
    it("should not add a download if it already exists", () => {
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(newDownload);
      const results = downloadsManager._downloadItems;
      expect(results.size).toBe(1);
    });
    it("should not return any downloads if no threshold is provided", async () => {
      downloadsManager.onDownloadAdded(newDownload);
      const results = await downloadsManager.getDownloads(null, {});
      expect(results).toHaveLength(0);
    });
    it("should stop at numItems when it found one it's looking for", async () => {
      const aDownload = {
        source: { url: "https://site.com/aDownload.pdf" },
        endTime: Date.now(),
        target: { path: "/path/to/aDownload.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(aDownload);
      downloadsManager.onDownloadAdded(newDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 1,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe(aDownload.source.url);
    });
    it("should get all the downloads younger than the threshold provided", async () => {
      const oldDownload = {
        source: { url: "https://site.com/oldDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/oldDownload.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      // Add an old download (older than 36 hours in this case)
      downloadsManager.onDownloadAdded(oldDownload);
      downloadsManager.onDownloadAdded(newDownload);
      const RECENT_DOWNLOAD_THRESHOLD = 36 * 60 * 60 * 1000;
      const results = await downloadsManager.getDownloads(
        RECENT_DOWNLOAD_THRESHOLD,
        { numItems: 5, onlySucceeded: true, onlyExists: true }
      );
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe(newDownload.source.url);
    });
    it("should dispatch DOWNLOAD_CHANGED when adding a download", () => {
      downloadsManager._store.dispatch = jest.fn();
      downloadsManager._downloadTimer = null; // Nuke the timer
      downloadsManager.onDownloadAdded(newDownload);
      expect(downloadsManager._store.dispatch).toHaveBeenCalledTimes(1);
    });
    it("should refresh the downloads if onlyExists is true", async () => {
      const aDownload = {
        source: { url: "https://site.com/aDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/aDownload.pdf", exists: true },
        succeeded: true,
        refresh: () => {},
      };
      jest.spyOn(aDownload, "refresh").mockResolvedValue(undefined);
      downloadsManager.onDownloadAdded(aDownload);
      await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(aDownload.refresh).toHaveBeenCalledTimes(1);
    });
    it("should not refresh the downloads if onlyExists is false (by default)", async () => {
      const aDownload = {
        source: { url: "https://site.com/aDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/aDownload.pdf", exists: true },
        succeeded: true,
        refresh: () => {},
      };
      jest.spyOn(aDownload, "refresh").mockResolvedValue(undefined);
      downloadsManager.onDownloadAdded(aDownload);
      await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
      });
      expect(aDownload.refresh).not.toHaveBeenCalled();
    });
    it("should only return downloads that exist if specified", async () => {
      const nonExistantDownload = {
        source: { url: "https://site.com/nonExistantDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/nonExistantDownload.pdf", exists: false },
        succeeded: true,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(nonExistantDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe(newDownload.source.url);
    });
    it("should return all downloads that either exist or don't exist if not specified", async () => {
      const nonExistantDownload = {
        source: { url: "https://site.com/nonExistantDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/nonExistantDownload.pdf", exists: false },
        succeeded: true,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(nonExistantDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
      });
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe(newDownload.source.url);
      expect(results[1].url).toBe(nonExistantDownload.source.url);
    });
    it("should return only unblocked downloads", async () => {
      const nonExistantDownload = {
        source: { url: "https://site.com/nonExistantDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/nonExistantDownload.pdf", exists: false },
        succeeded: true,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(nonExistantDownload);
      isBlocked.mockImplementation(
        item => item.url === nonExistantDownload.source.url
      );

      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty("url", newDownload.source.url);
    });
    it("should only return downloads that were successful if specified", async () => {
      const nonSuccessfulDownload = {
        source: { url: "https://site.com/nonSuccessfulDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/nonSuccessfulDownload.pdf", exists: false },
        succeeded: false,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(nonSuccessfulDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe(newDownload.source.url);
    });
    it("should return all downloads that were either successful or not if not specified", async () => {
      const nonExistantDownload = {
        source: { url: "https://site.com/nonExistantDownload.pdf" },
        endTime: Date.now() - 40 * 60 * 60 * 1000,
        target: { path: "/path/to/nonExistantDownload.pdf", exists: true },
        succeeded: false,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(nonExistantDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
      });
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe(newDownload.source.url);
      expect(results[1].url).toBe(nonExistantDownload.source.url);
    });
    it("should sort the downloads by recency", async () => {
      const olderDownload1 = {
        source: { url: "https://site.com/oldDownload1.pdf" },
        endTime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        target: { path: "/path/to/oldDownload1.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      const olderDownload2 = {
        source: { url: "https://site.com/oldDownload2.pdf" },
        endTime: Date.now() - 60 * 60 * 1000, // 1 hour ago
        target: { path: "/path/to/oldDownload2.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      // Add some older downloads and check that they are in order
      downloadsManager.onDownloadAdded(olderDownload1);
      downloadsManager.onDownloadAdded(olderDownload2);
      downloadsManager.onDownloadAdded(newDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(results).toHaveLength(3);
      expect(results[0].url).toBe(newDownload.source.url);
      expect(results[1].url).toBe(olderDownload2.source.url);
      expect(results[2].url).toBe(olderDownload1.source.url);
    });
    it("should sort downloads by recency regardless of insertion order", async () => {
      const download1 = {
        source: { url: "https://site.com/download1.pdf" },
        endTime: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
        target: { path: "/path/to/download1.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      const download2 = {
        source: { url: "https://site.com/download2.pdf" },
        endTime: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        target: { path: "/path/to/download2.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      const download3 = {
        source: { url: "https://site.com/download3.pdf" },
        endTime: Date.now() - 60 * 60 * 1000, // 1 hour ago
        target: { path: "/path/to/download3.pdf", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      // Add newest first, then oldest, then middle — insertion order
      // differs from expected recency order
      downloadsManager.onDownloadAdded(newDownload);
      downloadsManager.onDownloadAdded(download1);
      downloadsManager.onDownloadAdded(download3);
      downloadsManager.onDownloadAdded(download2);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(results).toHaveLength(4);
      expect(results[0].url).toBe(newDownload.source.url);
      expect(results[1].url).toBe(download3.source.url);
      expect(results[2].url).toBe(download2.source.url);
      expect(results[3].url).toBe(download1.source.url);
    });
    it("should format the description properly if there is no file type", async () => {
      newDownload.target.path = null;
      downloadsManager.onDownloadAdded(newDownload);
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
        onlySucceeded: true,
        onlyExists: true,
      });
      expect(results).toHaveLength(1);
      // see the DownloadsViewUI stub above to see where this comes from
      expect(results[0].description).toBe("1.5 MB");
    });
  });
  describe("#onDownloadRemoved", () => {
    let newDownload;
    beforeEach(() => {
      downloadsManager._downloadItems.clear();
      newDownload = {
        source: { url: "https://site.com/removeMe.mov" },
        endTime: Date.now(),
        target: { path: "/path/to/removeMe.mov", exists: true },
        succeeded: true,
        refresh: async () => {},
      };
      downloadsManager.onDownloadAdded(newDownload);
    });
    it("should remove a download if it exists on onDownloadRemoved", async () => {
      downloadsManager.onDownloadRemoved({
        source: { url: "https://site.com/removeMe.mov" },
      });
      const results = await downloadsManager.getDownloads(Infinity, {
        numItems: 5,
      });
      expect(results).toEqual([]);
    });
    it("should dispatch DOWNLOAD_CHANGED when removing a download", () => {
      downloadsManager._store.dispatch = jest.fn();
      downloadsManager.onDownloadRemoved({
        source: { url: "https://site.com/removeMe.mov" },
      });
      expect(downloadsManager._store.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
