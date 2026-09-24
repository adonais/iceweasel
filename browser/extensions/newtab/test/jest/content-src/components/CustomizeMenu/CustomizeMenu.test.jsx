import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { _CustomizeMenu as CustomizeMenu } from "content-src/components/CustomizeMenu/CustomizeMenu";
import { CUSTOMIZE_SUBPANELS } from "content-src/lib/constants";
import { actionCreators as ac } from "common/Actions.mjs";

const DEFAULT_PROPS = {
  dispatch: jest.fn(),
  onOpen: jest.fn(),
  onClose: jest.fn(),
  openPreferences: jest.fn(),
  setPref: jest.fn(),
  showing: false,
  enabledSections: {
    topSitesEnabled: true,
    pocketEnabled: false,
    weatherEnabled: false,
    showInferredPersonalizationEnabled: false,
    topSitesRowsCount: 1,
  },
  enabledWidgets: {
    timerEnabled: false,
    listsEnabled: false,
    widgetsMaximized: false,
    widgetsMayBeMaximized: false,
  },
  wallpapersEnabled: false,
  wallpapersUserEnabled: false,
  activeWallpaper: null,
  pocketRegion: false,
  mayHaveTopicSections: false,
  mayHaveInferredPersonalization: false,
  mayHaveWeather: false,
  mayHaveWidgets: false,
  mayHaveWeatherForecast: false,
  weatherDisplay: "simple",
  mayHaveTimerWidget: false,
  mayHaveListsWidget: false,
  toggleSectionsMgmtPanel: jest.fn(),
  activeSubpanel: null,
  toggleWidgetsManagementPanel: jest.fn(),
  toggleThemesPanel: jest.fn(),
  closeSubpanels: jest.fn(),
  Prefs: { values: {} },
};

const NOVA_PROPS = {
  ...DEFAULT_PROPS,
  Prefs: { values: { "nova.enabled": true } },
};

const BROWSER_NOVA_PROPS = {
  ...DEFAULT_PROPS,
  Prefs: { values: { browserNovaEnabled: true } },
};

describe("<CustomizeMenu>", () => {
  // jsdom does not implement dialog showModal() or close(), which the component calls on open and exit.
  let originalShowModal;
  let originalClose;
  beforeEach(() => {
    originalShowModal = HTMLDialogElement.prototype.showModal;
    originalClose = HTMLDialogElement.prototype.close;
  });
  afterEach(() => {
    HTMLDialogElement.prototype.showModal = originalShowModal;
    HTMLDialogElement.prototype.close = originalClose;
    jest.useRealTimers();
  });

  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <CustomizeMenu {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".personalize-button")).toBeInTheDocument();
  });

  it("renders the legacy button when nova is not enabled", () => {
    const { container } = render(
      <WrapWithProvider>
        <CustomizeMenu {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("moz-button.open-customization-button")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("button.personalize-button")
    ).toBeInTheDocument();
  });

  it("renders moz-button with correct attributes when nova is enabled", () => {
    const { container } = render(
      <WrapWithProvider>
        <CustomizeMenu {...NOVA_PROPS} />
      </WrapWithProvider>
    );
    const btn = container.querySelector("moz-button.open-customization-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-l10n-id", "newtab-customize-panel-label");
    expect(btn).toHaveAttribute(
      "iconsrc",
      "chrome://global/skin/icons/edit-outline.svg"
    );
    expect(btn).toHaveAttribute("iconposition", "end");
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("calls onOpen when the nova moz-button is clicked", () => {
    const onOpen = jest.fn();
    const { container } = render(
      <WrapWithProvider>
        <CustomizeMenu {...NOVA_PROPS} onOpen={onOpen} />
      </WrapWithProvider>
    );
    container.querySelector("moz-button.open-customization-button").click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("threads browserNovaEnabled from Prefs.values to ContentSection (renders the theme-picker)", () => {
    const { container } = render(
      <WrapWithProvider>
        <CustomizeMenu {...BROWSER_NOVA_PROPS} showing={true} />
      </WrapWithProvider>
    );
    expect(container.querySelector("theme-picker")).toBeInTheDocument();
  });

  it("closes every subpanel once the dialog has finished exiting", () => {
    jest.useFakeTimers();
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    const closeSubpanels = jest.fn();
    const props = { ...NOVA_PROPS, closeSubpanels };

    const { container, rerender } = render(
      <WrapWithProvider>
        <CustomizeMenu {...props} showing={false} />
      </WrapWithProvider>
    );
    rerender(
      <WrapWithProvider>
        <CustomizeMenu
          {...props}
          showing={true}
          activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
        />
      </WrapWithProvider>
    );
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(container.querySelector(".customize-menu-content")).toHaveClass(
      "subpanel-open"
    );

    rerender(
      <WrapWithProvider>
        <CustomizeMenu
          {...props}
          showing={false}
          activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
        />
      </WrapWithProvider>
    );
    expect(closeSubpanels).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(closeSubpanels).toHaveBeenCalledTimes(1);
  });

  it("marks the content as subpanel-open from the activeSubpanel prop", () => {
    const { container, rerender } = render(
      <WrapWithProvider>
        <CustomizeMenu
          {...DEFAULT_PROPS}
          showing={true}
          activeSubpanel={null}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".customize-menu-content")).not.toHaveClass(
      "subpanel-open"
    );
    rerender(
      <WrapWithProvider>
        <CustomizeMenu
          {...DEFAULT_PROPS}
          showing={true}
          activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".customize-menu-content")).toHaveClass(
      "subpanel-open"
    );
  });

  it("records the panel and subpanel opening", () => {
    const dispatch = jest.fn();
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    const props = { ...DEFAULT_PROPS, dispatch, activeSubpanel: null };
    const { rerender } = render(
      <WrapWithProvider>
        <CustomizeMenu {...props} showing={false} />
      </WrapWithProvider>
    );
    rerender(
      <WrapWithProvider>
        <CustomizeMenu {...props} showing={true} />
      </WrapWithProvider>
    );
    expect(dispatch).toHaveBeenCalledWith(
      ac.UserEvent({ event: "SHOW_PERSONALIZE" })
    );
    rerender(
      <WrapWithProvider>
        <CustomizeMenu
          {...props}
          showing={true}
          activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
        />
      </WrapWithProvider>
    );
    expect(dispatch).toHaveBeenCalledWith(
      ac.UserEvent({
        event: "SHOW_PERSONALIZE_SUBPANEL",
        source: CUSTOMIZE_SUBPANELS.THEMES,
      })
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("does not record a panel open on a mount that is already showing with a subpanel active", () => {
    const dispatch = jest.fn();
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    render(
      <WrapWithProvider>
        <CustomizeMenu
          {...DEFAULT_PROPS}
          dispatch={dispatch}
          showing={true}
          activeSubpanel={CUSTOMIZE_SUBPANELS.WIDGETS}
        />
      </WrapWithProvider>
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      ac.UserEvent({ event: "SHOW_PERSONALIZE" })
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      ac.UserEvent({
        event: "SHOW_PERSONALIZE_SUBPANEL",
        source: CUSTOMIZE_SUBPANELS.WIDGETS,
      })
    );
  });

  describe("theme picker shown()", () => {
    const shownLayouts = [];
    beforeAll(() => {
      // Custom elements stay registered for the rest of this file. The stub
      // exposes `layout` as a property, as the lit element does, so React
      // sets it as a property rather than an attribute.
      customElements.define(
        "theme-picker",
        class extends HTMLElement {
          get layout() {
            return this._layout ?? this.getAttribute("layout");
          }
          set layout(value) {
            this._layout = value;
          }
          shown() {
            shownLayouts.push(this.layout);
          }
        }
      );
    });
    beforeEach(() => {
      shownLayouts.length = 0;
      HTMLDialogElement.prototype.showModal = jest.fn();
      HTMLDialogElement.prototype.close = jest.fn();
    });

    it("notifies the compact picker when the panel opens", async () => {
      const { rerender } = render(
        <WrapWithProvider>
          <CustomizeMenu {...BROWSER_NOVA_PROPS} showing={false} />
        </WrapWithProvider>
      );
      rerender(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={null}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["compact"]));
      await act(async () => {});
      expect(shownLayouts).toEqual(["compact"]);
    });

    it("notifies the compact picker when mounted already showing", async () => {
      render(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={null}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["compact"]));
      await act(async () => {});
      expect(shownLayouts).toEqual(["compact"]);
    });

    it("notifies the full picker when the themes subpanel opens", async () => {
      const { rerender } = render(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={null}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["compact"]));
      await act(async () => {});
      expect(shownLayouts).toEqual(["compact"]);
      rerender(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["compact", "full"]));
      await act(async () => {});
      expect(shownLayouts).toEqual(["compact", "full"]);
    });

    it("notifies the compact picker again when a subpanel closes back to the root", async () => {
      const { rerender } = render(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={CUSTOMIZE_SUBPANELS.THEMES}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["full"]));
      rerender(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={null}
          />
        </WrapWithProvider>
      );
      await waitFor(() => expect(shownLayouts).toEqual(["full", "compact"]));
      await act(async () => {});
      expect(shownLayouts).toEqual(["full", "compact"]);
    });

    it("notifies nothing when the panel opens straight into a subpanel", async () => {
      const { rerender } = render(
        <WrapWithProvider>
          <CustomizeMenu {...BROWSER_NOVA_PROPS} showing={false} />
        </WrapWithProvider>
      );
      rerender(
        <WrapWithProvider>
          <CustomizeMenu
            {...BROWSER_NOVA_PROPS}
            showing={true}
            activeSubpanel={CUSTOMIZE_SUBPANELS.WIDGETS}
          />
        </WrapWithProvider>
      );
      await act(async () => {});
      expect(shownLayouts).toEqual([]);
    });
  });
});
