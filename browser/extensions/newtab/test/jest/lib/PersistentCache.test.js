/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PersistentCache } from "lib/PersistentCache.sys.mjs";
import { stubGlobals } from "test/jest/test-utils";

describe("PersistentCache", () => {
  let fakeIOUtils;
  let fakePathUtils;
  let cache;
  let filename = "cache.json";
  let consoleErrorStub;
  let restoreGlobals;

  beforeEach(() => {
    fakeIOUtils = {
      writeJSON: jest.fn().mockResolvedValue(0),
      readJSON: jest.fn().mockResolvedValue({}),
    };
    fakePathUtils = {
      join: jest.fn(() => filename),
      localProfileDir: "/",
    };
    consoleErrorStub = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    restoreGlobals = stubGlobals({
      IOUtils: fakeIOUtils,
      PathUtils: fakePathUtils,
    });

    cache = new PersistentCache(filename);
  });
  afterEach(() => {
    restoreGlobals();
    consoleErrorStub.mockRestore();
  });

  describe("#get", () => {
    it("tries to read the file", async () => {
      await cache.get("foo");
      expect(fakeIOUtils.readJSON).toHaveBeenCalledTimes(1);
    });
    it("doesnt try to read the file if it was already loaded", async () => {
      await cache._load();
      fakeIOUtils.readJSON.mockClear();
      await cache.get("foo");
      expect(fakeIOUtils.readJSON).not.toHaveBeenCalled();
    });
    it("should catch and report errors", async () => {
      fakeIOUtils.readJSON.mockRejectedValue(
        new SyntaxError("Failed to parse JSON")
      );
      await cache._load();
      expect(consoleErrorStub).toHaveBeenCalledTimes(1);

      cache._cache = undefined;
      consoleErrorStub.mockClear();

      fakeIOUtils.readJSON.mockRejectedValue(
        new DOMException("IOUtils shutting down", "AbortError")
      );
      await cache._load();
      expect(consoleErrorStub).toHaveBeenCalledTimes(1);

      cache._cache = undefined;
      consoleErrorStub.mockClear();

      fakeIOUtils.readJSON.mockRejectedValue(
        new DOMException("File not found", "NotFoundError")
      );
      await cache._load();
      expect(consoleErrorStub).not.toHaveBeenCalled();
    });
    it("returns data for a given cache key", async () => {
      fakeIOUtils.readJSON.mockResolvedValue({ foo: "bar" });
      let value = await cache.get("foo");
      expect(value).toEqual("bar");
    });
    it("returns undefined for a cache key that doesn't exist", async () => {
      let value = await cache.get("baz");
      expect(value).toBeUndefined();
    });
    it("returns all the data if no cache key is specified", async () => {
      fakeIOUtils.readJSON.mockResolvedValue({ foo: "bar" });
      let value = await cache.get();
      expect(value).toEqual({ foo: "bar" });
    });
  });

  describe("#set", () => {
    it("tries to read the file on the first set", async () => {
      await cache.set("foo", { x: 42 });
      expect(fakeIOUtils.readJSON).toHaveBeenCalledTimes(1);
    });
    it("doesnt try to read the file if it was already loaded", async () => {
      cache = new PersistentCache(filename, true);
      await cache._load();
      fakeIOUtils.readJSON.mockClear();
      await cache.set("foo", { x: 42 });
      expect(fakeIOUtils.readJSON).not.toHaveBeenCalled();
    });
    it("sets a string value", async () => {
      const key = "testkey";
      const value = "testvalue";
      await cache.set(key, value);
      const cachedValue = await cache.get(key);
      expect(cachedValue).toEqual(value);
    });
    it("sets an object value", async () => {
      const key = "testkey";
      const value = { x: 1, y: 2, z: 3 };
      await cache.set(key, value);
      const cachedValue = await cache.get(key);
      expect(cachedValue).toEqual(value);
    });
    it("writes the data to file", async () => {
      const key = "testkey";
      const value = { x: 1, y: 2, z: 3 };

      await cache.set(key, value);
      expect(fakeIOUtils.writeJSON).toHaveBeenCalledTimes(1);
      expect(fakeIOUtils.writeJSON).toHaveBeenCalledWith(
        filename,
        { [key]: value },
        { tmpPath: `${filename}.tmp` }
      );
    });
    it("throws when failing to get file path", async () => {
      Object.defineProperty(fakePathUtils, "localProfileDir", {
        get() {
          throw new Error();
        },
      });

      let rejected = false;
      try {
        await cache.set("key", "val");
      } catch (error) {
        rejected = true;
      }

      expect(rejected).toBe(true);
    });
  });
});
