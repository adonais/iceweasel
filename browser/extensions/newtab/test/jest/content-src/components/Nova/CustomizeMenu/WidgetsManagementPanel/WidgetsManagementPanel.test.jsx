import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { WidgetsManagementPanel } from "content-src/components/Nova/CustomizeMenu/WidgetsManagementPanel/WidgetsManagementPanel";

const DEFAULT_PROPS = {
  togglePanel: jest.fn(),
  showPanel: false,
  enabledSections: {
    weatherEnabled: false,
  },
  enabledWidgets: {
    timerEnabled: false,
    listsEnabled: false,
    widgetsMaximized: false,
    widgetsMayBeMaximized: false,
  },
  mayHaveWeather: false,
  mayHaveTimerWidget: false,
  mayHaveListsWidget: false,
  mayHaveWeatherForecast: false,
  weatherDisplay: "simple",
  setPref: jest.fn(),
};

describe("<WidgetsManagementPanel>", () => {
  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <WidgetsManagementPanel {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".widgets-mgmt-panel-container")
    ).toBeInTheDocument();
  });

  it("gives the back button an accessible name and tooltip", () => {
    const { container } = render(
      <WrapWithProvider>
        <WidgetsManagementPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );
    expect(container.querySelector("moz-button.arrow-button")).toHaveAttribute(
      "data-l10n-id",
      "newtab-customize-panel-back-button"
    );
  });
});
