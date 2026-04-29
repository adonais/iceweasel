/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { _WallpaperCategories as WallpaperCategories } from "content-src/components/WallpaperCategories/WallpaperCategories";

const DEFAULT_PROPS = {
  Prefs: {
    values: {
      "newtabWallpapers.wallpaper": "celestial",
      "newtabWallpapers.initialWallpaper": "celestial",
      "newtabWallpapers.customWallpaper.uploadedPreviously": false,
      "newtabWallpapers.customWallpaper.fileSize": 2,
      "newtabWallpapers.customWallpaper.fileSize.enabled": false,
    },
  },
  Wallpapers: {
    wallpaperList: [{ title: "moon", category: "celestial", theme: "light" }],
    categories: ["celestial", "solid-colors"],
    uploadedWallpaper: null,
  },
  activeWallpaper: "celestial",
  setPref: jest.fn(),
  dispatch: jest.fn(),
};

describe("<WallpaperCategories>", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should clear initialWallpaper when the wallpaper is removed", () => {
    const { container } = render(<WallpaperCategories {...DEFAULT_PROPS} />);
    fireEvent.click(container.querySelector(".wallpapers-reset"));
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.initialWallpaper",
      ""
    );
  });

  it("should clear initialWallpaper when a wallpaper is set", () => {
    const { container } = render(<WallpaperCategories {...DEFAULT_PROPS} />);
    fireEvent.click(container.querySelector("#celestial"));
    fireEvent.click(container.querySelector("#moon"));
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.wallpaper",
      "moon"
    );
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.initialWallpaper",
      ""
    );
  });

  it("should clear initialWallpaper when a custom colour is set", () => {
    const ref = React.createRef();
    render(<WallpaperCategories {...DEFAULT_PROPS} ref={ref} />);
    act(() => {
      ref.current.handleColorInput({
        target: { id: "solid-color-picker", value: "#112233", style: {} },
      });
    });
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.wallpaper",
      "solid-color-picker-#112233"
    );
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.initialWallpaper",
      ""
    );
  });
});
