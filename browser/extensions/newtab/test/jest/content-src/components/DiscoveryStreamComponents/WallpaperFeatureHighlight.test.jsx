import { render, fireEvent } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { WallpaperFeatureHighlight } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/WallpaperFeatureHighlight";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";

describe("<WallpaperFeatureHighlight>", () => {
  it("should render when messageData has content", () => {
    const state = {
      ...INITIAL_STATE,
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: { content: { feature: "WALLPAPER" } },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight")
    ).toBeInTheDocument();
  });

  it("should render the Nova image class when nova.enabled is true", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: { content: { feature: "WALLPAPER" } },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight-image")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".follow-section-button-highlight-image")
    ).not.toBeInTheDocument();
  });

  it("renders the World Cup variant when messageType is WorldCupWallpaperHighlight", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight.world-cup-variant")
    ).toBeInTheDocument();
    expect(container.querySelector(".title").getAttribute("data-l10n-id")).toBe(
      "newtab-sports-widget-message-wallpapers-title"
    );
    expect(
      container.querySelector(".subtitle").getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-message-wallpapers-body");
    expect(
      container.querySelector('source[media="(prefers-color-scheme: light)"]')
        .srcset
    ).toContain("wallpaper-callout.png");
  });

  it("renders the semi-finals copy when messageType is WorldCupSemiFinalWallpaperHighlight", () => {
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupSemiFinalWallpaperHighlight",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight.world-cup-variant")
    ).toBeInTheDocument();
    expect(container.querySelector(".title").getAttribute("data-l10n-id")).toBe(
      "newtab-sports-widget-message-wallpapers-semifinals-title"
    );
    expect(
      container.querySelector(".subtitle").getAttribute("data-l10n-id")
    ).toBe("newtab-sports-widget-message-wallpapers-semifinals-body");
    expect(
      container.querySelector('source[media="(prefers-color-scheme: light)"]')
        .srcset
    ).toContain("wallpaper-callout.png");
  });

  it("does not apply the World Cup variant outside Nova mode", () => {
    const state = {
      ...INITIAL_STATE,
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight.world-cup-variant")
    ).not.toBeInTheDocument();
  });

  it("deep-links the CTA into the Firefox wallpaper category", () => {
    const dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupSemiFinalWallpaperHighlight",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={dispatch}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.SHOW_PERSONALIZE,
      data: { wallpaperCategory: "firefox" },
    });
  });

  it("deep-links into the wallpaper category provided by the message", () => {
    const dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
            wallpaperCategory: "celestial",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={dispatch}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.SHOW_PERSONALIZE,
      data: { wallpaperCategory: "celestial" },
    });
  });

  it("opens the top-level panel when the message sets an empty category", () => {
    const dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
            wallpaperCategory: null,
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={dispatch}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.SHOW_PERSONALIZE,
      data: { wallpaperCategory: null },
    });
  });

  it("opens the top-level panel for an unknown category", () => {
    const dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
            wallpaperCategory: "not-a-real-category",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={dispatch}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.SHOW_PERSONALIZE,
      data: { wallpaperCategory: null },
    });
  });

  it("opens the top-level panel for the custom-wallpaper category", () => {
    const dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: {
          content: {
            feature: "WALLPAPER",
            messageType: "WorldCupWallpaperHighlight",
            wallpaperCategory: "custom-wallpaper",
          },
        },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={dispatch}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith({
      type: at.SHOW_PERSONALIZE,
      data: { wallpaperCategory: null },
    });
  });
});
