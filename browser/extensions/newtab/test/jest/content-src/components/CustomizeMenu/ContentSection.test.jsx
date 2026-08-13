import { render } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import { ContentSection } from "content-src/components/CustomizeMenu/ContentSection/ContentSection";

const DEFAULT_PROPS = {
  dispatch: jest.fn(),
  openPreferences: jest.fn(),
  setPref: jest.fn(),
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
  exitEventFired: false,
  onSubpanelToggle: jest.fn(),
  toggleSectionsMgmtPanel: jest.fn(),
  showSectionsMgmtPanel: false,
  novaEnabled: false,
  toggleWidgetsManagementPanel: jest.fn(),
  showWidgetsManagementPanel: false,
};

describe("<ContentSection>", () => {
  it("should render", () => {
    const { container } = render(<ContentSection {...DEFAULT_PROPS} />);
    expect(container.querySelector(".home-section")).toBeInTheDocument();
  });

  describe("inputUserEvent telemetry", () => {
    function getInstance(extraProps = {}) {
      const ref = { current: null };
      render(
        <ContentSection
          {...DEFAULT_PROPS}
          ref={instance => {
            ref.current = instance;
          }}
          {...extraProps}
        />
      );
      return ref.current;
    }

    it("dispatches WIDGETS_ENABLED with widget_name='crossword' when the crossword toggle fires", () => {
      const dispatch = jest.fn();
      const instance = getInstance({ dispatch });
      instance.inputUserEvent("WIDGET_CROSSWORD", true);

      const enabledCall = dispatch.mock.calls.find(
        ([action]) => action?.type === at.WIDGETS_ENABLED
      );
      expect(enabledCall?.[0].data).toMatchObject({
        widget_name: "crossword",
        widget_source: "customize_panel",
        enabled: true,
        widget_size: "large",
      });
    });

    it("dispatches WIDGETS_ENABLED with widget_name='stocks' when the stocks toggle fires", () => {
      const dispatch = jest.fn();
      const instance = getInstance({ dispatch });
      instance.inputUserEvent("WIDGET_STOCKS", true);

      const enabledCall = dispatch.mock.calls.find(
        ([action]) => action?.type === at.WIDGETS_ENABLED
      );
      expect(enabledCall?.[0].data).toMatchObject({
        widget_name: "stocks",
        widget_source: "customize_panel",
        enabled: true,
        widget_size: "large",
      });
    });

    it("dispatches WIDGETS_ENABLED with widget_name='picture_of_the_day' when the picture toggle fires", () => {
      const dispatch = jest.fn();
      const instance = getInstance({ dispatch });
      instance.inputUserEvent("WIDGET_PICTURE_OF_THE_DAY", true);

      const enabledCall = dispatch.mock.calls.find(
        ([action]) => action?.type === at.WIDGETS_ENABLED
      );
      expect(enabledCall?.[0].data).toMatchObject({
        widget_name: "picture_of_the_day",
        widget_source: "customize_panel",
        enabled: true,
        widget_size: "large",
      });
    });
  });
});
