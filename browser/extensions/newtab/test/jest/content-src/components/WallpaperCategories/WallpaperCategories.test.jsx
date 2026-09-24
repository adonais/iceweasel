/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import { _WallpaperCategories as WallpaperCategories } from "content-src/components/WallpaperCategories/WallpaperCategories";

const UUID_ONE = "550e8400-e29b-41d4-a716-446655440000";
const UUID_TWO = "7f2a1c93-4d1e-4a8c-9f3b-2e6d5a1b0c74";
const UUID_THREE = "9b4e7d21-3f8a-4c2e-b1d6-8a5f0e7c9b23";

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
  showPanel: false,
  activeCategory: null,
  openPanel: jest.fn(),
  closePanel: jest.fn(),
};

// Base.jsx owns the subpanel state in production. This harness stands in for
// it: openPanel records the category and shows the panel, closePanel hides
// the panel but keeps the category, exactly as Base does.
const Harness = React.forwardRef(function Harness(
  { onOpenPanel, onClosePanel, ...props },
  ref
) {
  const [showPanel, setShowPanel] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState(null);
  const openPanel = categoryId => {
    onOpenPanel?.(categoryId);
    setActiveCategory(categoryId);
    setShowPanel(true);
  };
  const closePanel = () => {
    onClosePanel?.();
    setShowPanel(false);
  };
  return (
    <WallpaperCategories
      ref={ref}
      {...props}
      showPanel={showPanel}
      activeCategory={activeCategory}
      openPanel={openPanel}
      closePanel={closePanel}
    />
  );
});

describe("<WallpaperCategories>", () => {
  beforeAll(() => {
    globalThis.URL.createObjectURL = file => `blob:${file.name}`;
    globalThis.URL.revokeObjectURL = () => {};
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("removes the saved image on reset when the library is off", () => {
    // Pre-library behavior: with no folder to see or delete an image in,
    // resetting has to take it, or it is stranded on disk for good.
    const props = {
      ...DEFAULT_PROPS,
      Prefs: {
        values: {
          ...DEFAULT_PROPS.Prefs.values,
          "newtabWallpapers.wallpaper": "custom",
          "newtabWallpapers.customWallpaper.library.enabled": false,
        },
      },
    };
    const { container } = render(<WallpaperCategories {...props} />);
    fireEvent.click(container.querySelector(".wallpapers-reset"));

    expect(
      props.dispatch.mock.calls.some(
        ([action]) => action.type === at.WALLPAPER_REMOVE_UPLOAD
      )
    ).toBe(true);
  });

  it("keeps the saved image on reset when the library is on", () => {
    const props = {
      ...DEFAULT_PROPS,
      Prefs: {
        values: {
          ...DEFAULT_PROPS.Prefs.values,
          "newtabWallpapers.wallpaper": "custom",
          "newtabWallpapers.customWallpaper.library.enabled": true,
        },
      },
    };
    const { container } = render(<WallpaperCategories {...props} />);
    fireEvent.click(container.querySelector(".wallpapers-reset"));

    expect(
      props.dispatch.mock.calls.some(
        ([action]) => action.type === at.WALLPAPER_REMOVE_UPLOAD
      )
    ).toBe(false);
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
    const { container } = render(<Harness {...DEFAULT_PROPS} />);
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
    const { container } = render(<Harness {...props} />);
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
      const { container } = render(<Harness {...props} />);
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
    const onOpenPanel = jest.fn();
    const props = {
      ...DEFAULT_PROPS,
      Wallpapers: {
        ...DEFAULT_PROPS.Wallpapers,
        categories: ["celestial", "solid-colors", "firefox"],
      },
      customizePanelWallpaperCategory: null,
    };
    const { container, rerender } = render(
      <Harness {...props} onOpenPanel={onOpenPanel} />
    );
    expect(onOpenPanel).not.toHaveBeenCalled();

    act(() => {
      rerender(
        <Harness
          {...props}
          onOpenPanel={onOpenPanel}
          customizePanelWallpaperCategory="firefox"
        />
      );
    });

    expect(onOpenPanel).toHaveBeenCalledWith("firefox");
    expect(
      container.querySelector(".wallpaper-list .arrow-button")
    ).toHaveAttribute(
      "data-l10n-id",
      "newtab-wallpaper-category-title-firefox"
    );
    expect(DEFAULT_PROPS.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: at.WALLPAPER_CATEGORY_CLICK })
    );
  });

  it("ignores a deep-linked category that is unavailable", () => {
    const onOpenPanel = jest.fn();
    const props = {
      ...DEFAULT_PROPS,
      customizePanelWallpaperCategory: null,
    };
    const { rerender } = render(
      <Harness {...props} onOpenPanel={onOpenPanel} />
    );

    act(() => {
      rerender(
        <Harness
          {...props}
          onOpenPanel={onOpenPanel}
          customizePanelWallpaperCategory="firefox"
        />
      );
    });

    // "firefox" is not in DEFAULT_PROPS categories, so nothing should open.
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it("opens the panel and records a category click when a tile is clicked", () => {
    const onOpenPanel = jest.fn();
    const { container } = render(
      <Harness {...DEFAULT_PROPS} onOpenPanel={onOpenPanel} />
    );
    fireEvent.click(container.querySelector("#celestial"));
    expect(onOpenPanel).toHaveBeenCalledWith("celestial");
    expect(DEFAULT_PROPS.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WALLPAPER_CATEGORY_CLICK,
        data: "celestial",
      })
    );
  });

  it("closes the panel and refocuses the tile on back", () => {
    const onClosePanel = jest.fn();
    const originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = cb => {
      cb();
      return 0;
    };
    try {
      const { container } = render(
        <Harness {...DEFAULT_PROPS} onClosePanel={onClosePanel} />
      );
      fireEvent.click(container.querySelector("#celestial"));

      fireEvent.click(container.querySelector(".wallpaper-list .arrow-button"));
      expect(onClosePanel).toHaveBeenCalledTimes(1);
      // The synchronous requestAnimationFrame stub makes the refocus observable straight away.
      expect(document.activeElement).toBe(
        container.querySelector("#celestial")
      );
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });

  it("opens the new category when switching while open", () => {
    const onOpenPanel = jest.fn();
    const { container } = render(
      <Harness {...DEFAULT_PROPS} onOpenPanel={onOpenPanel} />
    );
    fireEvent.click(container.querySelector("#celestial"));
    fireEvent.click(container.querySelector("#solid-colors"));
    expect(onOpenPanel).toHaveBeenLastCalledWith("solid-colors");
  });

  it("keeps the category title on the heading after back, for the exit animation", () => {
    const originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = cb => {
      cb();
      return 0;
    };
    try {
      const { container } = render(<Harness {...DEFAULT_PROPS} />);
      fireEvent.click(container.querySelector("#celestial"));
      fireEvent.click(container.querySelector(".wallpaper-list .arrow-button"));
      // The harness keeps activeCategory as Base does, so the heading keeps
      // its title while the CSSTransition plays the exit.
      expect(
        container.querySelector(".wallpaper-list .arrow-button")
      ).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-category-title-celestial"
      );
    } finally {
      globalThis.requestAnimationFrame = originalRAF;
    }
  });

  it("names the back button and keeps the category title as a heading", () => {
    const novaProps = {
      ...DEFAULT_PROPS,
      Prefs: {
        values: {
          ...DEFAULT_PROPS.Prefs.values,
          "nova.enabled": true,
        },
      },
    };
    const { container } = render(<Harness {...novaProps} />);
    fireEvent.click(container.querySelector("#celestial"));

    const wrapper = container.querySelector(
      ".wallpaper-list.category .arrow-wrapper"
    );
    expect(wrapper).toBeInTheDocument();

    const backButton = wrapper.querySelector("moz-button.arrow-button");
    expect(backButton).toHaveAttribute(
      "data-l10n-id",
      "newtab-customize-panel-back-button"
    );
    expect(wrapper.querySelector("h2")).toHaveAttribute(
      "data-l10n-id",
      "newtab-wallpaper-category-title-celestial"
    );
  });

  it("should not delete the saved image when the wallpaper is reset", () => {
    const { container } = render(<WallpaperCategories {...DEFAULT_PROPS} />);
    fireEvent.click(container.querySelector(".wallpapers-reset"));
    expect(DEFAULT_PROPS.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.WALLPAPER_REMOVE_UPLOAD,
      })
    );
  });

  describe("Your images", () => {
    const SAVED = [
      {
        filename: `v1-custom-light-center-1-${UUID_ONE}`,
        theme: "light",
        position: "center",
        type: "custom",
        number: 1,
      },
      {
        filename: `v1-builtin-dark-topright-1-${UUID_TWO}`,
        theme: "dark",
        position: "top right",
        type: "builtin",
        number: 2,
        fallbackName: "dark-mountain",
      },
    ];

    // The library is not reachable by URL, so the picker gets thumbnail bytes
    // and makes its own object URLs. Stands in for a Blob.
    const THUMBNAILS = SAVED.map(({ filename }) => {
      const file = new Blob([filename], { type: "image/jpeg" });
      file.name = filename;
      return { filename, file };
    });

    const thumbnailUrl = filename => `blob:${filename}`;

    const withSavedWallpapers = (customWallpapers = SAVED, values = {}) => ({
      ...DEFAULT_PROPS,
      // The picker only does library work while the panel is open, and it
      // fails closed, so every test here has to say the panel is showing.
      panelShowing: true,
      Prefs: {
        values: {
          ...DEFAULT_PROPS.Prefs.values,
          "newtabWallpapers.user.enabled": true,
          "newtabWallpapers.customWallpaper.library.enabled": true,
          ...values,
        },
      },
      Wallpapers: {
        ...DEFAULT_PROPS.Wallpapers,
        categories: ["custom-wallpaper", "celestial"],
        customWallpapers,
        customWallpaperThumbnails: THUMBNAILS.filter(thumbnail =>
          customWallpapers.some(
            wallpaper => wallpaper.filename === thumbnail.filename
          )
        ),
      },
    });

    it("keeps the add an image tile until something is saved", () => {
      const { container } = render(<Harness {...withSavedWallpapers([])} />);
      const tile = container.querySelector("#custom-wallpaper");
      expect(tile).toHaveClass("theme-custom-wallpaper");
      expect(
        container.querySelector('label[for="custom-wallpaper"]')
      ).toHaveAttribute("data-l10n-id", "newtab-wallpaper-upload-image");
    });

    it("keeps the single tile when the library is off", () => {
      const props = withSavedWallpapers(SAVED, {
        "newtabWallpapers.customWallpaper.library.enabled": false,
      });

      const { container } = render(<Harness {...props} />);
      const tile = container.querySelector("#custom-wallpaper");
      expect(tile).toHaveClass("theme-custom-wallpaper");
      expect(tile).not.toHaveClass("your-images-folder");
      expect(
        container.querySelector('label[for="custom-wallpaper"]')
      ).not.toHaveAttribute("data-l10n-id", "newtab-wallpaper-your-images");
    });

    it("shows the applied image even before the library catches up", () => {
      // The pref and the wallpaper URL reach the page ahead of the library. If
      // the tile waited for a library thumbnail it would show the previous
      // image, which is worse than showing nothing.
      const props = withSavedWallpapers();
      const { container } = render(
        <Harness
          {...props}
          Prefs={{
            values: {
              ...props.Prefs.values,
              "newtabWallpapers.wallpaper": "custom",
              // Not in the library the page holds yet.
              "newtabWallpapers.customWallpaper.uuid": `v1-custom-light-center-1-${UUID_THREE}`,
              "newtabWallpapers.customWallpaper.position": "top right",
            },
          }}
          Wallpapers={{
            ...props.Wallpapers,
            uploadedWallpaper: "moz-newtab-wallpaper://the-new-one",
          }}
        />
      );

      const tile = container.querySelector("#custom-wallpaper");
      expect(tile.style.backgroundImage).toBe(
        "url(moz-newtab-wallpaper://the-new-one)"
      );
      expect(tile.style.backgroundPosition).toBe("top right");
      expect(tile).not.toHaveClass("theme-custom-wallpaper");
    });

    it("keeps the add an image look until the thumbnail arrives", () => {
      // Thumbnails come from the parent after the panel opens. Without this the
      // folder tile draws nothing at all in that window.
      const props = withSavedWallpapers();
      const { container, rerender } = render(
        <Harness
          {...props}
          Wallpapers={{ ...props.Wallpapers, customWallpaperThumbnails: [] }}
        />
      );

      const tile = () => container.querySelector("#custom-wallpaper");
      expect(tile()).toHaveClass("your-images-folder");
      expect(tile()).toHaveClass("theme-custom-wallpaper");
      expect(tile().style.backgroundImage).toBe("");

      act(() => {
        rerender(<Harness {...props} />);
      });

      expect(tile()).toHaveClass("your-images-folder");
      expect(tile()).not.toHaveClass("theme-custom-wallpaper");
      expect(tile().style.backgroundImage).not.toBe("");
    });

    it("turns the tile into a folder once an image is saved", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      const tile = container.querySelector("#custom-wallpaper");
      expect(tile).not.toHaveClass("theme-custom-wallpaper");
      expect(tile).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-your-images-folder"
      );
      expect(tile.style.backgroundImage).toBe(
        `url(${thumbnailUrl(SAVED[0].filename)})`
      );
      expect(
        container.querySelector('label[for="custom-wallpaper"]')
      ).toHaveAttribute("data-l10n-id", "newtab-wallpaper-your-images");
    });

    it("shows the applied image on the folder", () => {
      const props = withSavedWallpapers(SAVED, {
        "newtabWallpapers.wallpaper": "custom",
        "newtabWallpapers.customWallpaper.uuid": SAVED[1].filename,
      });
      const { container } = render(<Harness {...props} />);
      const tile = container.querySelector("#custom-wallpaper");
      expect(tile.style.backgroundImage).toBe(
        `url(${thumbnailUrl(SAVED[1].filename)})`
      );
      expect(tile).toHaveClass("selected");
    });

    it("lists every saved image and a tile to add another", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const images = container.querySelectorAll(
        '.your-images input[type="radio"]'
      );
      expect(images).toHaveLength(SAVED.length);
      expect(images[0].style.backgroundImage).toBe(
        `url(${thumbnailUrl(SAVED[0].filename)})`
      );
      expect(images[1].style.backgroundPosition).toBe("top right");
      expect(container.querySelector("#your-images-add")).toHaveClass(
        "theme-custom-wallpaper"
      );
    });

    it("asks before removing a saved image", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const removeButtons = container.querySelectorAll(".your-images-remove");
      expect(removeButtons).toHaveLength(SAVED.length);
      // An image someone added has no name of its own, so its button is named
      // by the number the image is known by.
      expect(removeButtons[0]).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-remove-image-numbered"
      );

      expect(removeButtons[0]).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ number: SAVED[0].number })
      );
      // A rescued Firefox wallpaper has no file name, so its button is named
      // by the title stored when it was rescued.
      expect(removeButtons[1]).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-remove-image"
      );
      expect(removeButtons[1]).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ name: SAVED[1].fallbackName })
      );

      fireEvent.click(removeButtons[1]);

      const [dialog] = DEFAULT_PROPS.dispatch.mock.calls.find(
        ([action]) => action.type === at.DIALOG_OPEN
      );
      expect(dialog.data.onConfirm[0]).toEqual(
        expect.objectContaining({
          type: at.WALLPAPER_REMOVE_UPLOAD,
          // Just the filename. The parent records the telemetry once the
          // removal has actually happened, with the counts it really has.
          data: { filename: SAVED[1].filename },
        })
      );
      expect(dialog.data.body_string_id).toEqual([
        "newtab-wallpaper-remove-image-title",
        "newtab-wallpaper-remove-image-body",
      ]);
    });

    it("restores focus when another image is added during removal", () => {
      const props = withSavedWallpapers();
      const ref = React.createRef();
      const { container, rerender } = render(<Harness {...props} ref={ref} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const remove = container.querySelector(".your-images-remove");
      act(() => {
        remove.focus();
        fireEvent.click(remove);
      });

      const replacement = {
        filename: `v1-custom-light-center-4-${UUID_THREE}`,
        theme: "light",
        position: "center",
        type: "custom",
        number: 4,
      };
      act(() => {
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              customWallpapers: [replacement, SAVED[1]],
            }}
            ref={ref}
          />
        );
      });

      expect(document.activeElement).toBe(
        container.querySelector('.your-images input[type="radio"]')
      );
      expect(ref.current.state.pendingRemoveFilename).toBeNull();
    });

    it("names each remove button after the tile it belongs to", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const items = [...container.querySelectorAll(".your-images-item")];
      // The last item adds an image and has no remove button. Named by the
      // number it was given, so removing another cannot rename the ones left.
      const [numbered, unnamed] = items;

      expect(numbered.querySelector("label.sr-only")).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-your-images-item-numbered"
      );
      expect(numbered.querySelector("label.sr-only")).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ number: SAVED[0].number })
      );
      expect(numbered.querySelector(".your-images-remove")).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ number: SAVED[0].number })
      );

      // A rescued Firefox wallpaper keeps the title it was rescued with.
      expect(unnamed.querySelector("label.sr-only")).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-your-images-item"
      );
      expect(unnamed.querySelector("label.sr-only")).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ name: SAVED[1].fallbackName })
      );
    });

    it("moves real focus to a new upload when focus was in the folder", () => {
      const props = withSavedWallpapers();
      const ref = React.createRef();
      const { container, rerender } = render(<Harness {...props} ref={ref} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      // Uploading starts from the add tile, so that is what holds focus when
      // the parent replies with the saved filename.
      const add = container.querySelector("#your-images-add");
      act(() => {
        add.click();
        add.focus();
        // A validated file normally creates this request before dispatch.
        ref.current.pendingUploadId = "request-1";
      });
      expect(document.activeElement).toBe(add);

      const uploaded = {
        filename: `v1-custom-light-center-1-${UUID_THREE}`,
        theme: "light",
        position: "center",
        type: "custom",
        number: 3,
      };

      act(() => {
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              customWallpapers: [uploaded, ...SAVED],
              uploadResult: {
                requestId: "request-1",
                filename: uploaded.filename,
              },
            }}
            ref={ref}
          />
        );
      });

      const images = container.querySelectorAll(
        '.your-images input[type="radio"]'
      );
      expect(document.activeElement).toBe(images[0]);

      const stops = [
        ...container.querySelectorAll(".your-images .wallpaper-input"),
      ].filter(element => element.tabIndex === 0);
      expect(stops).toEqual([images[0]]);
    });

    it("does not arm upload focus while the file picker is open", () => {
      const ref = React.createRef();
      const { container } = render(
        <Harness {...withSavedWallpapers()} ref={ref} />
      );
      fireEvent.click(container.querySelector("#custom-wallpaper"));
      fireEvent.click(container.querySelector("#your-images-add"));

      expect(ref.current.pendingUploadId).toBeNull();
    });

    it("clears upload focus when the parent reports a failure", () => {
      const props = withSavedWallpapers();
      const ref = React.createRef();
      const { rerender } = render(<Harness {...props} ref={ref} />);
      act(() => {
        ref.current.pendingUploadId = "request-1";
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              uploadResult: { requestId: "request-1", filename: null },
            }}
            ref={ref}
          />
        );
      });

      expect(ref.current.pendingUploadId).toBeNull();
    });

    it("drops the upload result once it has been acted on", () => {
      const props = withSavedWallpapers();
      const ref = React.createRef();
      const { rerender } = render(<Harness {...props} ref={ref} />);
      act(() => {
        ref.current.pendingUploadId = "request-1";
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              uploadResult: { requestId: "request-1", filename: null },
            }}
            ref={ref}
          />
        );
      });

      // Stale afterwards, so it leaves this tab's state rather than sitting
      // there naming a file forever.
      expect(DEFAULT_PROPS.dispatch).toHaveBeenCalledWith({
        type: at.WALLPAPER_UPLOAD_RESULT,
        data: null,
      });
    });

    it("leaves focus alone when the library grows without this tab asking", () => {
      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const images = () =>
        container.querySelectorAll('.your-images input[type="radio"]');
      act(() => {
        images()[0].focus();
      });
      const [focused] = images();

      // Another tab uploading, or a retired wallpaper being rescued, both
      // arrive as a bigger library with no click here.
      act(() => {
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              customWallpapers: [
                {
                  filename: `v1-builtin-light-center-1-${UUID_THREE}`,
                  theme: "light",
                  position: "center",
                  type: "builtin",
                },
                ...SAVED,
              ],
            }}
          />
        );
      });

      expect(document.activeElement).toBe(focused);
    });

    it("leaves focus alone when an upload lands from outside the folder", () => {
      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const outside = document.createElement("button");
      document.body.appendChild(outside);
      outside.focus();

      act(() => {
        rerender(
          <Harness
            {...props}
            Wallpapers={{
              ...props.Wallpapers,
              customWallpapers: [
                {
                  filename: `v1-custom-light-center-1-${UUID_THREE}`,
                  theme: "light",
                  position: "center",
                  type: "custom",
                  number: 3,
                },
                ...SAVED,
              ],
            }}
          />
        );
      });

      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it("names the remove button after a rescued wallpaper's own title", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const [, remove] = container.querySelectorAll(".your-images-remove");
      expect(remove).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-remove-image"
      );
      expect(remove).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ name: SAVED[1].fallbackName })
      );
    });

    it("names an image someone added by its number", async () => {
      const { container } = render(
        <Harness {...withSavedWallpapers([SAVED[0]])} />
      );
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const [label] = container.querySelectorAll(
        ".your-images-item label.sr-only"
      );
      expect(label).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-your-images-item-numbered"
      );
      expect(label).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ number: 1 })
      );
    });

    it("keeps its own title rather than a number when it has one", async () => {
      const withTitle = [{ ...SAVED[0], number: 4, fallbackName: "A heron" }];
      const { container } = render(
        <Harness {...withSavedWallpapers(withTitle)} />
      );
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const [label] = container.querySelectorAll(
        ".your-images-item label.sr-only"
      );
      expect(label).toHaveAttribute(
        "data-l10n-id",
        "newtab-wallpaper-your-images-item"
      );
      expect(label).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ name: "A heron" })
      );
    });

    it("asks again when the applied wallpaper changes", () => {
      // A page from the startup cache never sees the library broadcast, so a
      // change to the library alone would never reach it. The applied pref does.
      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const requests = () =>
        props.dispatch.mock.calls.filter(
          ([action]) => action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_REQUEST
        ).length;

      // Control: re-rendering with nothing changed must not ask again.
      props.dispatch.mockClear();
      act(() => {
        rerender(<Harness {...props} />);
      });
      expect(requests()).toBe(0);

      // The applied wallpaper moving is the signal that does reach the page.
      act(() => {
        rerender(
          <Harness
            {...props}
            Prefs={{
              values: {
                ...props.Prefs.values,
                "newtabWallpapers.customWallpaper.uuid": `v1-custom-light-center-1-${UUID_THREE}`,
              },
            }}
          />
        );
      });
      expect(requests()).toBe(1);
    });

    it("keeps the arrow-key tab stop across a re-render", () => {
      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const images = () =>
        container.querySelectorAll('.your-images input[type="radio"]');
      expect(images()[0].tabIndex).toBe(0);

      fireEvent.keyDown(images()[0], { key: "ArrowRight" });
      expect(images()[1].tabIndex).toBe(0);
      expect(images()[0].tabIndex).toBe(-1);

      // A library update re-renders the grid; the tab stop must not snap back.
      act(() => {
        rerender(
          <Harness
            {...props}
            Wallpapers={{ ...props.Wallpapers, customWallpapers: [...SAVED] }}
          />
        );
      });

      expect(images()[1].tabIndex).toBe(0);
      expect(images()[0].tabIndex).toBe(-1);
    });

    it("walks the grid a row at a time with the arrow keys", () => {
      // Four saved images plus the add tile fills one row of three and leaves
      // two on the second, which is what makes the short-row case reachable.
      const four = [0, 1, 2, 3].map(index => ({
        filename: `v1-custom-light-center-1-${UUID_ONE.slice(0, -1)}${index}`,
        theme: "light",
        position: "center",
        type: "custom",
        number: index + 1,
      }));
      const { container } = render(<Harness {...withSavedWallpapers(four)} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const tiles = () =>
        container.querySelectorAll(
          '.your-images input[type="radio"], .your-images button'
        );
      expect(tiles()).toHaveLength(5);

      fireEvent.keyDown(tiles()[0], { key: "ArrowDown" });
      expect(tiles()[3].tabIndex).toBe(0);

      fireEvent.keyDown(tiles()[3], { key: "ArrowUp" });
      expect(tiles()[0].tabIndex).toBe(0);

      fireEvent.keyDown(tiles()[0], { key: "ArrowRight" });
      fireEvent.keyDown(tiles()[1], { key: "ArrowLeft" });
      expect(tiles()[0].tabIndex).toBe(0);
    });

    it("stays put rather than moving sideways off a short bottom row", () => {
      const four = [0, 1, 2, 3].map(index => ({
        filename: `v1-custom-light-center-1-${UUID_ONE.slice(0, -1)}${index}`,
        theme: "light",
        position: "center",
        type: "custom",
        number: index + 1,
      }));
      const { container } = render(<Harness {...withSavedWallpapers(four)} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const tiles = () =>
        container.querySelectorAll(
          '.your-images input[type="radio"], .your-images button'
        );

      // Index 2 ends the top row and sits above nothing, since the second row
      // holds only two tiles. Clamping to the last tile would drag focus left
      // across the row instead of leaving it where it is.
      fireEvent.focus(tiles()[2]);
      expect(tiles()[2].tabIndex).toBe(0);

      fireEvent.keyDown(tiles()[2], { key: "ArrowDown" });
      expect(tiles()[2].tabIndex).toBe(0);
      expect(tiles()[4].tabIndex).toBe(-1);
    });

    it("moves the tab stop when a tile is activated without being focused", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const images = () =>
        container.querySelectorAll('.your-images input[type="radio"]');
      expect(images()[0].tabIndex).toBe(0);

      // Assistive technology can check a radio without focusing it first, so a
      // bare click has to move the tab stop the same way focus does.
      fireEvent.click(images()[1]);

      expect(images()[1].tabIndex).toBe(0);
      expect(images()[0].tabIndex).toBe(-1);
    });

    it("opens no folder at all when the library pref is off", () => {
      const props = withSavedWallpapers(SAVED, {
        "newtabWallpapers.customWallpaper.library.enabled": false,
        "newtabWallpapers.customWallpaper.uuid": SAVED[1].filename,
        "newtabWallpapers.wallpaper": "custom",
      });
      const { container } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      // The tile goes straight to the file picker, the way it did before the
      // library existed, so there is nothing to browse.
      expect(container.querySelector(".your-images")).toBeNull();
      expect(container.querySelector("#custom-wallpaper")).toHaveClass(
        "theme-custom-wallpaper"
      );
    });

    it("shows the whole library when a trainhop rollout enables it", () => {
      const props = withSavedWallpapers(SAVED, {
        "newtabWallpapers.customWallpaper.library.enabled": false,
        trainhopConfig: { customWallpaperLibrary: { enabled: true } },
      });

      const { container } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      expect(
        container.querySelectorAll('.your-images input[type="radio"]')
      ).toHaveLength(SAVED.length);
    });

    it("drops thumbnail object URLs when the panel closes", () => {
      const revoked = [];
      globalThis.URL.revokeObjectURL = url => revoked.push(url);

      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));
      expect(revoked).toHaveLength(0);

      rerender(<Harness {...{ ...props, panelShowing: false }} />);

      expect(revoked.sort()).toEqual(
        SAVED.map(({ filename }) => `blob:${filename}`).sort()
      );
      globalThis.URL.revokeObjectURL = () => {};
    });

    it("asks for thumbnails again when the feature is turned back on", () => {
      const off = withSavedWallpapers(SAVED, {
        "newtabWallpapers.customWallpaper.library.enabled": false,
      });
      const { rerender } = render(<Harness {...off} />);
      off.dispatch.mockClear();

      rerender(<Harness {...withSavedWallpapers()} />);

      const asked = off.dispatch.mock.calls.some(
        ([action]) => action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_REQUEST
      );
      expect(asked).toBe(true);
    });

    it("clears the thumbnail bytes out of this tab when the panel closes", () => {
      const props = withSavedWallpapers();
      const { container, rerender } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));
      props.dispatch.mockClear();

      rerender(<Harness {...{ ...props, panelShowing: false }} />);

      const cleared = props.dispatch.mock.calls.filter(
        ([action]) =>
          action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_SET &&
          !action.data.length
      );
      expect(cleared).toHaveLength(1);
    });

    it("ignores thumbnails a startup cache restore turned into plain objects", () => {
      const props = withSavedWallpapers();
      props.Wallpapers.customWallpaperThumbnails = SAVED.map(
        ({ filename }) => ({ filename, file: {} })
      );

      const { container } = render(<Harness {...props} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));

      const images = container.querySelectorAll(
        '.your-images input[type="radio"]'
      );
      expect(images).toHaveLength(SAVED.length);
      expect(images[0].style.backgroundImage).toBe("");
    });

    // Nova is not shipped yet, so the folder has to work in the classic layout
    // too. Everything above runs with Nova on, which is the default fixture.
    it("puts focus back on the tile after the very first save", () => {
      // The tile the person clicked says "Add an image", and the folder that
      // replaces it uses a different key, so React throws the focused node
      // away and focus falls to the body.
      const ref = React.createRef();
      const before = withSavedWallpapers([]);
      const { container, rerender } = render(<Harness {...before} ref={ref} />);

      const addTile = container.querySelector("#custom-wallpaper");
      addTile.focus();
      expect(document.activeElement).toBe(addTile);

      // What handleUpload records on its way out, without opening a picker.
      ref.current.pendingUploadId = "request-1";
      ref.current.uploadStartedFromTile = true;

      const after = withSavedWallpapers(SAVED);
      after.Wallpapers.uploadResult = {
        requestId: "request-1",
        filename: SAVED[0].filename,
      };
      rerender(<Harness {...after} ref={ref} />);

      const folderTile = container.querySelector("#custom-wallpaper");
      expect(folderTile).not.toBe(addTile);
      expect(document.activeElement).toBe(folderTile);
    });

    describe("scaling images the parent could not", () => {
      // jsdom has neither of the image APIs the real scaling uses, so these
      // stand in for them. What is under test is the wiring, not the scaling.
      let realCreateImageBitmap;
      let realOffscreenCanvas;
      let closed;

      beforeEach(() => {
        closed = [];
        realCreateImageBitmap = globalThis.createImageBitmap;
        realOffscreenCanvas = globalThis.OffscreenCanvas;
        globalThis.createImageBitmap = async () => ({
          width: 1000,
          height: 500,
          close: () => closed.push(true),
        });
        globalThis.OffscreenCanvas = class {
          constructor(width, height) {
            this.width = width;
            this.height = height;
          }
          getContext() {
            return { drawImage: () => {} };
          }
          async convertToBlob() {
            return new Blob(["scaled"], { type: "image/jpeg" });
          }
        };
      });

      afterEach(() => {
        globalThis.createImageBitmap = realCreateImageBitmap;
        globalThis.OffscreenCanvas = realOffscreenCanvas;
      });

      const unscaled = filename => ({
        filename,
        file: new Blob(["a full size image"], { type: "image/png" }),
        needsThumbnail: true,
      });

      const propsWith = (entries, values = {}) => {
        const props = withSavedWallpapers(SAVED, values);
        props.Wallpapers.customWallpaperThumbnails = entries;
        return props;
      };

      it("scales one the parent sent whole and sends it back", async () => {
        const props = propsWith([unscaled(SAVED[0].filename)]);
        render(<Harness {...props} />);

        await waitFor(() => {
          const sent = props.dispatch.mock.calls
            .map(([action]) => action)
            .find(
              action => action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_MADE
            );
          expect(sent).toBeTruthy();
          expect(sent.data.filename).toBe(SAVED[0].filename);
          expect(sent.data.thumbnail).toBeInstanceOf(Blob);
        });
      });

      it("leaves alone anything that already has one", async () => {
        const props = propsWith([
          { filename: SAVED[0].filename, file: new Blob(["thumb"]) },
        ]);
        render(<Harness {...props} />);

        await Promise.resolve();
        expect(
          props.dispatch.mock.calls
            .map(([action]) => action)
            .some(
              action => action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_MADE
            )
        ).toBe(false);
      });

      const madeCalls = props =>
        props.dispatch.mock.calls
          .map(([action]) => action)
          .filter(
            action => action.type === at.WALLPAPERS_CUSTOM_THUMBNAILS_MADE
          );

      it("never starts while the panel is shut", async () => {
        const props = propsWith([unscaled(SAVED[0].filename)]);
        props.panelShowing = false;
        render(<Harness {...props} />);

        await Promise.resolve();
        await Promise.resolve();
        expect(madeCalls(props)).toHaveLength(0);
      });

      it("stops when the panel is closed part way through", async () => {
        // Hold the scaling open so the panel can close while it is in flight.
        let finishScaling;
        globalThis.OffscreenCanvas = class {
          getContext() {
            return { drawImage: () => {} };
          }
          convertToBlob() {
            return new Promise(resolve => {
              finishScaling = () => resolve(new Blob(["scaled"]));
            });
          }
        };

        const props = propsWith([unscaled(SAVED[0].filename)]);
        const { rerender } = render(<Harness {...props} />);
        await waitFor(() => expect(finishScaling).toBeDefined());
        // Sanity: with the panel left open this same setup does dispatch.
        expect(madeCalls(props)).toHaveLength(0);

        const closed = { ...props, panelShowing: false };
        rerender(<Harness {...closed} />);
        finishScaling();
        // Long enough that the positive case below would have dispatched by
        // now, so a pass here means it stopped rather than it being early.
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(madeCalls(props)).toHaveLength(0);
      });

      it("tries again after the panel closed part way through", async () => {
        // The set that stops repeat work must not remember one that never
        // finished, or that tab would never scale it again.
        let finishScaling;
        const holding = () =>
          class {
            getContext() {
              return { drawImage: () => {} };
            }
            convertToBlob() {
              return new Promise(resolve => {
                finishScaling = () => resolve(new Blob(["scaled"]));
              });
            }
          };
        globalThis.OffscreenCanvas = holding();

        const props = propsWith([unscaled(SAVED[0].filename)]);
        const { rerender } = render(<Harness {...props} />);
        await waitFor(() => expect(finishScaling).toBeDefined());

        rerender(<Harness {...props} panelShowing={false} />);
        finishScaling();
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(madeCalls(props)).toHaveLength(0);

        // Reopening asks the parent again, which replies with a fresh payload.
        // A new array, since the picker only reacts to a changed reference.
        finishScaling = undefined;
        globalThis.OffscreenCanvas = holding();
        const reopened = {
          ...props,
          panelShowing: true,
          Wallpapers: {
            ...props.Wallpapers,
            customWallpaperThumbnails: [unscaled(SAVED[0].filename)],
          },
        };
        rerender(<Harness {...reopened} />);
        await waitFor(() => expect(finishScaling).toBeDefined());
        finishScaling();

        await waitFor(() => expect(madeCalls(props)).toHaveLength(1));
      });

      it("works the same in the classic layout", async () => {
        const props = propsWith([unscaled(SAVED[0].filename)], {
          "nova.enabled": false,
        });
        render(<Harness {...props} />);

        await waitFor(() => expect(madeCalls(props)).toHaveLength(1));
      });

      it("does send it when the panel stays open, so the test above means something", async () => {
        let finishScaling;
        globalThis.OffscreenCanvas = class {
          getContext() {
            return { drawImage: () => {} };
          }
          convertToBlob() {
            return new Promise(resolve => {
              finishScaling = () => resolve(new Blob(["scaled"]));
            });
          }
        };

        const props = propsWith([unscaled(SAVED[0].filename)]);
        render(<Harness {...props} />);
        await waitFor(() => expect(finishScaling).toBeDefined());
        finishScaling();

        await waitFor(() => expect(madeCalls(props)).toHaveLength(1));
      });
    });

    describe("classic layout", () => {
      const classic = (customWallpapers = SAVED) =>
        withSavedWallpapers(customWallpapers, { "nova.enabled": false });

      it("still opens the folder and lists every saved image", () => {
        const { container } = render(<Harness {...classic()} />);
        expect(container.querySelector(".nova-enabled")).toBeNull();

        fireEvent.click(container.querySelector("#custom-wallpaper"));

        expect(
          container.querySelectorAll('.your-images input[type="radio"]')
        ).toHaveLength(SAVED.length);
        expect(container.querySelector("#your-images-add")).toBeTruthy();
      });

      it("uses the classic label on the tile before anything is saved", () => {
        const { container } = render(<Harness {...classic([])} />);
        // Nova renamed this copy; classic keeps the older string.
        expect(
          container.querySelector(
            'label[data-l10n-id="newtab-wallpaper-upload-image"]'
          )
        ).toBeTruthy();
      });

      it("keeps the folder name on the tile once something is saved", () => {
        const { container } = render(<Harness {...classic()} />);
        expect(
          container.querySelector(
            'label[data-l10n-id="newtab-wallpaper-your-images"]'
          )
        ).toBeTruthy();
      });

      it("removes a saved image the same way", () => {
        const props = classic();
        const { container } = render(<Harness {...props} />);
        fireEvent.click(container.querySelector("#custom-wallpaper"));

        fireEvent.click(container.querySelectorAll(".your-images-remove")[1]);

        const dialog = DEFAULT_PROPS.dispatch.mock.calls.find(
          ([action]) => action.type === at.DIALOG_OPEN
        );
        expect(dialog[0].data.onConfirm[0].data.filename).toBe(
          SAVED[1].filename
        );
      });

      it("walks the grid with the arrow keys", () => {
        const { container } = render(<Harness {...classic()} />);
        fireEvent.click(container.querySelector("#custom-wallpaper"));

        const images = () =>
          container.querySelectorAll('.your-images input[type="radio"]');
        expect(images()[0].tabIndex).toBe(0);
        fireEvent.keyDown(images()[0], { key: "ArrowRight" });
        expect(images()[1].tabIndex).toBe(0);
        expect(images()[0].tabIndex).toBe(-1);
      });
    });

    it("applies a saved image when it is picked", () => {
      const { container } = render(<Harness {...withSavedWallpapers()} />);
      fireEvent.click(container.querySelector("#custom-wallpaper"));
      fireEvent.click(
        container.querySelector(`#your-images-${SAVED[1].filename}`)
      );

      // Content only asks. The parent can refuse, for an image another tab
      // deleted, so it owns every pref that names the applied wallpaper.
      expect(DEFAULT_PROPS.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: at.WALLPAPERS_CUSTOM_APPLY,
          data: { filename: SAVED[1].filename },
        })
      );
      const named = DEFAULT_PROPS.setPref.mock.calls.map(([name]) => name);
      expect(named).not.toContain("newtabWallpapers.wallpaper");
      expect(named).not.toContain("newtabWallpapers.initialWallpaper");
      expect(named).not.toContain("newtabWallpapers.user.enabled");
      expect(named).not.toContain("widgets.pictureOfTheDay.wallpaperActive");
    });
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
