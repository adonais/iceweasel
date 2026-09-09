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
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.user.enabled",
      true
    );
  });

  it("should not render the reset button when Nova is enabled", () => {
    const novaProps = {
      ...DEFAULT_PROPS,
      Prefs: {
        values: {
          ...DEFAULT_PROPS.Prefs.values,
          "nova.enabled": true,
        },
      },
    };
    const { container } = render(<WallpaperCategories {...novaProps} />);
    expect(
      container.querySelector(".wallpapers-reset")
    ).not.toBeInTheDocument();
  });

  it("should render the reset button when Nova is disabled", () => {
    const { container } = render(<WallpaperCategories {...DEFAULT_PROPS} />);
    expect(container.querySelector(".wallpapers-reset")).toBeInTheDocument();
  });

  it("does not offer wallpapers with visible set to false", () => {
    const props = {
      ...DEFAULT_PROPS,
      Wallpapers: {
        ...DEFAULT_PROPS.Wallpapers,
        wallpaperList: [
          { title: "moon", category: "celestial", theme: "light" },
          {
            title: "stars",
            category: "celestial",
            theme: "dark",
            visible: true,
          },
          {
            title: "retired",
            category: "celestial",
            theme: "light",
            visible: false,
          },
        ],
      },
    };
    const { container } = render(<WallpaperCategories {...props} />);
    fireEvent.click(container.querySelector("#celestial"));

    expect(container.querySelector("#moon")).toBeInTheDocument();
    expect(container.querySelector("#stars")).toBeInTheDocument();
    expect(container.querySelector("#retired")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('input[type="radio"].wallpaper-input')
    ).toHaveLength(2);
  });

  describe("visibility_group", () => {
    const GATED_LIST = [
      { title: "moon", category: "celestial", theme: "light" },
      {
        title: "soccer-ball",
        category: "celestial",
        theme: "dark",
        visibility_group: "soccer",
      },
    ];

    const gatedProps = (groupValues = {}) => ({
      ...DEFAULT_PROPS,
      Prefs: { values: { ...DEFAULT_PROPS.Prefs.values, ...groupValues } },
      Wallpapers: { ...DEFAULT_PROPS.Wallpapers, wallpaperList: GATED_LIST },
    });

    const openCelestial = props => {
      const { container } = render(<WallpaperCategories {...props} />);
      fireEvent.click(container.querySelector("#celestial"));
      return container;
    };

    it("hides a gated wallpaper when no group is active", () => {
      const container = openCelestial(gatedProps());
      expect(container.querySelector("#moon")).toBeInTheDocument();
      expect(container.querySelector("#soccer-ball")).not.toBeInTheDocument();
    });

    it("offers a gated wallpaper when the pref names its group", () => {
      const container = openCelestial(
        gatedProps({ "newtabWallpapers.visibilityGroups": "soccer" })
      );
      expect(container.querySelector("#soccer-ball")).toBeInTheDocument();
    });

    it("parses a multi-group pref and trims whitespace", () => {
      const container = openCelestial(
        gatedProps({ "newtabWallpapers.visibilityGroups": "worldcup, soccer" })
      );
      expect(container.querySelector("#soccer-ball")).toBeInTheDocument();
    });

    it("lets trainhopConfig activate a group with the pref unset", () => {
      const container = openCelestial(
        gatedProps({
          "newtabWallpapers.visibilityGroups": "",
          trainhopConfig: { wallpapers: { visibilityGroups: "soccer" } },
        })
      );
      expect(container.querySelector("#soccer-ball")).toBeInTheDocument();
    });

    it("ignores a malformed trainhop value and falls back to the pref", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const container = openCelestial(
        gatedProps({
          "newtabWallpapers.visibilityGroups": "soccer",
          trainhopConfig: { wallpapers: { visibilityGroups: ["soccer"] } },
        })
      );

      // Renders rather than throwing, and the pref still activates the group.
      expect(container.querySelector("#soccer-ball")).toBeInTheDocument();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("does not throw when the trainhop value is a non-string and no pref is set", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const container = openCelestial(
        gatedProps({
          trainhopConfig: { wallpapers: { visibilityGroups: 5 } },
        })
      );

      expect(container.querySelector("#moon")).toBeInTheDocument();
      expect(container.querySelector("#soccer-ball")).not.toBeInTheDocument();
      warn.mockRestore();
    });

    it("keeps hiding a gated wallpaper that is also visible: false", () => {
      const props = {
        ...DEFAULT_PROPS,
        Prefs: {
          values: {
            ...DEFAULT_PROPS.Prefs.values,
            "newtabWallpapers.visibilityGroups": "soccer",
          },
        },
        Wallpapers: {
          ...DEFAULT_PROPS.Wallpapers,
          wallpaperList: [
            { title: "moon", category: "celestial", theme: "light" },
            {
              title: "soccer-ball",
              category: "celestial",
              theme: "dark",
              visibility_group: "soccer",
              visible: false,
            },
          ],
        },
      };
      const container = openCelestial(props);
      expect(container.querySelector("#soccer-ball")).not.toBeInTheDocument();
    });

    it("leaves ungated wallpapers alone whatever the groups say", () => {
      const container = openCelestial(
        gatedProps({ "newtabWallpapers.visibilityGroups": "unrelated" })
      );
      expect(container.querySelector("#moon")).toBeInTheDocument();
    });

    it("hides a gated wallpaper even while it is the selected one", () => {
      const props = {
        ...gatedProps(),
        activeWallpaper: "soccer-ball",
      };
      props.Prefs.values["newtabWallpapers.wallpaper"] = "soccer-ball";
      const container = openCelestial(props);
      expect(container.querySelector("#soccer-ball")).not.toBeInTheDocument();
    });
  });

  it("opens the requested category when deep-linked via App state", () => {
    const onSubpanelToggle = jest.fn();
    const ref = React.createRef();
    const props = {
      ...DEFAULT_PROPS,
      onSubpanelToggle,
      Wallpapers: {
        ...DEFAULT_PROPS.Wallpapers,
        categories: ["celestial", "solid-colors", "firefox"],
      },
      customizePanelWallpaperCategory: null,
    };
    const { rerender } = render(<WallpaperCategories {...props} ref={ref} />);
    expect(ref.current.state.activeCategory).toBeNull();

    act(() => {
      rerender(
        <WallpaperCategories
          {...props}
          customizePanelWallpaperCategory="firefox"
          ref={ref}
        />
      );
    });

    expect(ref.current.state.activeCategory).toBe("firefox");
    expect(ref.current.state.activeCategoryFluentID).toBe(
      "newtab-wallpaper-category-title-firefox"
    );
    expect(onSubpanelToggle).toHaveBeenCalledWith(true);
  });

  it("ignores a deep-linked category that is unavailable", () => {
    const ref = React.createRef();
    const props = {
      ...DEFAULT_PROPS,
      customizePanelWallpaperCategory: null,
    };
    const { rerender } = render(<WallpaperCategories {...props} ref={ref} />);

    act(() => {
      rerender(
        <WallpaperCategories
          {...props}
          customizePanelWallpaperCategory="firefox"
          ref={ref}
        />
      );
    });

    // "firefox" is not in DEFAULT_PROPS categories, so nothing should open.
    expect(ref.current.state.activeCategory).toBeNull();
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
    expect(DEFAULT_PROPS.setPref).toHaveBeenCalledWith(
      "newtabWallpapers.user.enabled",
      true
    );
  });
});
