/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stubGlobals } from "test/jest/test-utils";
import { ScreenshotUtils } from "content-src/lib/screenshot-utils";

const DEFAULT_BLOB_URL = "blob://test";

describe("ScreenshotUtils", () => {
  let restoreGlobals;
  let url;
  beforeEach(() => {
    url = {
      createObjectURL: jest.fn().mockReturnValue(DEFAULT_BLOB_URL),
      revokeObjectURL: jest.fn(),
    };
    restoreGlobals = stubGlobals({ URL: url });
  });
  afterEach(() => restoreGlobals());
  describe("#createLocalImageObject", () => {
    it("should return null if no remoteImage is supplied", () => {
      let localImageObject = ScreenshotUtils.createLocalImageObject(null);

      expect(url.createObjectURL).not.toHaveBeenCalled();
      expect(localImageObject).toBe(null);
    });
    it("should create a local image object with the correct properties if remoteImage is a blob", () => {
      let localImageObject = ScreenshotUtils.createLocalImageObject({
        path: "/path1",
        data: new Blob([0]),
      });

      expect(url.createObjectURL).toHaveBeenCalledTimes(1);
      expect(localImageObject).toEqual({
        path: "/path1",
        url: DEFAULT_BLOB_URL,
      });
    });
    it("should create a local image object with the correct properties if remoteImage is a normal image", () => {
      const imageUrl = "https://test-url";
      let localImageObject = ScreenshotUtils.createLocalImageObject(imageUrl);

      expect(url.createObjectURL).not.toHaveBeenCalled();
      expect(localImageObject).toEqual({ url: imageUrl });
    });
  });
  describe("#maybeRevokeBlobObjectURL", () => {
    // Note that we should also ensure that all the tests for #isBlob are green.
    it("should call revokeObjectURL if image is a blob", () => {
      ScreenshotUtils.maybeRevokeBlobObjectURL({
        path: "/path1",
        url: "blob://test",
      });

      expect(url.revokeObjectURL).toHaveBeenCalledTimes(1);
    });
    it("should not call revokeObjectURL if image is not a blob", () => {
      ScreenshotUtils.maybeRevokeBlobObjectURL({ url: "https://test-url" });

      expect(url.revokeObjectURL).not.toHaveBeenCalled();
    });
  });
  describe("#isRemoteImageLocal", () => {
    it("should return true if both propsImage and stateImage are not present", () => {
      expect(ScreenshotUtils.isRemoteImageLocal(null, null)).toBe(true);
    });
    it("should return false if propsImage is present and stateImage is not present", () => {
      expect(ScreenshotUtils.isRemoteImageLocal(null, {})).toBe(false);
    });
    it("should return false if propsImage is not present and stateImage is present", () => {
      expect(ScreenshotUtils.isRemoteImageLocal({}, null)).toBe(false);
    });
    it("should return true if both propsImage and stateImage are equal blobs", () => {
      const blobPath = "/test-blob-path/test.png";
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { path: blobPath, url: "blob://test" }, // state
          { path: blobPath, data: new Blob([0]) } // props
        )
      ).toBe(true);
    });
    it("should return false if both propsImage and stateImage are different blobs", () => {
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { path: "/path1", url: "blob://test" }, // state
          { path: "/path2", data: new Blob([0]) } // props
        )
      ).toBe(false);
    });
    it("should return true if both propsImage and stateImage are equal normal images", () => {
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { url: "test url" }, // state
          "test url" // props
        )
      ).toBe(true);
    });
    it("should return false if both propsImage and stateImage are different normal images", () => {
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { url: "test url 1" }, // state
          "test url 2" // props
        )
      ).toBe(false);
    });
    it("should return false if both propsImage and stateImage are different type of images", () => {
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { path: "/path1", url: "blob://test" }, // state
          "test url 2" // props
        )
      ).toBe(false);
      expect(
        ScreenshotUtils.isRemoteImageLocal(
          { url: "https://test-url" }, // state
          { path: "/path1", data: new Blob([0]) } // props
        )
      ).toBe(false);
    });
  });
  describe("#isBlob", () => {
    let state = {
      blobImage: { path: "/test", url: "blob://test" },
      normalImage: { url: "https://test-url" },
    };
    let props = {
      blobImage: { path: "/test", data: new Blob([0]) },
      normalImage: "https://test-url",
    };
    it("should return false if image is null", () => {
      expect(ScreenshotUtils.isBlob(true, null)).toBe(false);
      expect(ScreenshotUtils.isBlob(false, null)).toBe(false);
    });
    it("should return true if image is a blob and type matches", () => {
      expect(ScreenshotUtils.isBlob(true, state.blobImage)).toBe(true);
      expect(ScreenshotUtils.isBlob(false, props.blobImage)).toBe(true);
    });
    it("should return false if image is not a blob and type matches", () => {
      expect(ScreenshotUtils.isBlob(true, state.normalImage)).toBe(false);
      expect(ScreenshotUtils.isBlob(false, props.normalImage)).toBe(false);
    });
    it("should return false if type does not match", () => {
      expect(ScreenshotUtils.isBlob(false, state.blobImage)).toBe(false);
      expect(ScreenshotUtils.isBlob(false, state.normalImage)).toBe(false);
      expect(ScreenshotUtils.isBlob(true, props.blobImage)).toBe(false);
      expect(ScreenshotUtils.isBlob(true, props.normalImage)).toBe(false);
    });
  });
});
