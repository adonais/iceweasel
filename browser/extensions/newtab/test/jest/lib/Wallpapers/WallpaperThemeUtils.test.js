/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createThumbnail } from "lib/Wallpapers/WallpaperThemeUtils.mjs";

describe("createThumbnail", () => {
  // jsdom has neither image API, so these stand in for them and record what
  // the real ones would have been asked to do.
  const fakeWindow = (width, height) => {
    const state = { closed: false, canvas: null, drawnAs: null, options: null };
    return {
      state,
      win: {
        createImageBitmap: async () => ({
          width,
          height,
          close: () => {
            state.closed = true;
          },
        }),
        OffscreenCanvas: class {
          constructor(w, h) {
            state.canvas = { width: w, height: h };
          }
          getContext() {
            return {
              drawImage: (bitmap, x, y, w, h) => {
                state.drawnAs = { x, y, width: w, height: h };
              },
            };
          }
          async convertToBlob(options) {
            state.options = options;
            return new Blob(["scaled"], { type: options.type });
          }
        },
      },
    };
  };

  it("fits a wide image inside the box without stretching it", async () => {
    const { win, state } = fakeWindow(1600, 400);
    await createThumbnail(win, new Blob(["source"]));
    expect(state.canvas).toEqual({ width: 320, height: 80 });
  });

  it("fits a tall one the same way, so a panorama cannot come back huge", async () => {
    const { win, state } = fakeWindow(400, 1600);
    await createThumbnail(win, new Blob(["source"]));
    expect(state.canvas).toEqual({ width: 80, height: 320 });
  });

  it("leaves an image smaller than the box alone", async () => {
    const { win, state } = fakeWindow(100, 60);
    await createThumbnail(win, new Blob(["source"]));
    expect(state.canvas).toEqual({ width: 100, height: 60 });
  });

  it("never rounds a very thin image down to nothing", async () => {
    const { win, state } = fakeWindow(4000, 3);
    await createThumbnail(win, new Blob(["source"]));
    expect(state.canvas.height).toBe(1);
  });

  it("returns a JPEG", async () => {
    const { win, state } = fakeWindow(800, 600);
    const thumbnail = await createThumbnail(win, new Blob(["source"]));
    expect(state.options.type).toBe("image/jpeg");
    expect(thumbnail.type).toBe("image/jpeg");
  });

  it("frees the decoded image rather than waiting for collection", async () => {
    const { win, state } = fakeWindow(800, 600);
    await createThumbnail(win, new Blob(["source"]));
    expect(state.closed).toBe(true);
  });

  it("frees it even when the scaling throws", async () => {
    const { win, state } = fakeWindow(800, 600);
    win.OffscreenCanvas = class {
      getContext() {
        throw new Error("no canvas today");
      }
    };
    await expect(createThumbnail(win, new Blob(["source"]))).rejects.toThrow(
      "no canvas today"
    );
    expect(state.closed).toBe(true);
  });
});
