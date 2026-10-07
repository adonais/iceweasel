/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { WeatherForecast } from "content-src/components/Widgets/WeatherForecast/WeatherForecast";

const weatherSuggestion = {
  current_conditions: {
    icon_id: 3,
    summary: "Partly Cloudy",
    temperature: {
      c: 20,
      f: 68,
    },
  },
  forecast: {
    high: {
      c: 25,
      f: 77,
    },
    low: {
      c: 15,
      f: 59,
    },
    url: "https://example.com",
  },
};

const hourlyForecasts = [
  {
    epoch_date_time: 1000000000,
    temperature: { c: 18, f: 64 },
    icon_id: 5,
    summary: "Partly Cloudy",
    date_time: "2024-01-15T14:00:00",
    url: "https://example.com/forecast",
  },
  {
    epoch_date_time: 1000003600,
    temperature: { c: 17, f: 62 },
    icon_id: 6,
    summary: "Mostly Cloudy",
    date_time: "2024-01-15T15:00:00",
  },
  {
    epoch_date_time: 1000007200,
    temperature: { c: 16, f: 61 },
    icon_id: 7,
    summary: "Cloudy",
    date_time: "2024-01-15T16:00:00",
  },
];

const mockState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      showWeather: true,
      "system.showWeather": true,
      "weather.display": "detailed",
      "weather.temperatureUnits": "f",
      "weather.locationSearchEnabled": true,
      "system.showWeatherOptIn": true,
      "widgets.system.weatherForecast.enabled": true,
    },
  },
  Weather: {
    initialized: true,
    searchActive: false,
    locationData: {
      city: "Testville",
    },
    suggestions: [weatherSuggestion],
    hourlyForecasts,
  },
};

// nova.enabled with a medium size unlocks the size submenu and the size-based
// layout gate that replaces the simple/detailed display toggle.
const novaState = {
  ...mockState,
  Prefs: {
    ...mockState.Prefs,
    values: {
      ...mockState.Prefs.values,
      "nova.enabled": true,
      "widgets.weather.size": "medium",
    },
  },
};

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

function renderForecast({
  state = mockState,
  props = {},
  dispatch = jest.fn(),
} = {}) {
  const { container, unmount } = render(
    <WrapWithProvider state={state}>
      <WeatherForecast dispatch={dispatch} {...props} />
    </WrapWithProvider>
  );
  return { container, unmount, dispatch };
}

// Builds a state with the temperature units pref overridden.
function stateWithPref(name, value, base = mockState) {
  return {
    ...base,
    Prefs: {
      ...base.Prefs,
      values: {
        ...base.Prefs.values,
        [name]: value,
      },
    },
  };
}

// Builds a state whose single weather suggestion is replaced, to exercise the
// error branch (missing current_conditions/forecast).
function stateWithSuggestion(suggestion) {
  return {
    ...mockState,
    Weather: {
      ...mockState.Weather,
      suggestions: [suggestion],
    },
  };
}

describe("<WeatherForecast>", () => {
  it("should render weather forecast widget", () => {
    const { container } = renderForecast();
    expect(container).toBeInTheDocument();
    expect(
      container.querySelector(".weather-forecast-widget")
    ).toBeInTheDocument();
  });

  it("should not render when detailed view is disabled", () => {
    const { container } = renderForecast({
      state: stateWithPref("weather.display", "simple"),
    });
    expect(
      container.querySelector(".weather-forecast-widget")
    ).not.toBeInTheDocument();
  });

  it("should not render when weather is disabled", () => {
    const { container } = renderForecast({
      state: stateWithPref("showWeather", false),
    });
    expect(
      container.querySelector(".weather-forecast-widget")
    ).not.toBeInTheDocument();
  });

  it("should display city name when search is inactive", () => {
    const { container } = renderForecast();
    const cityName = container.querySelector(".city-name h2");
    expect(cityName).toBeInTheDocument();
    expect(cityName).toHaveTextContent("Testville");
  });

  it("should display LocationSearch component when search is active", () => {
    const searchActiveState = {
      ...mockState,
      Weather: {
        ...mockState.Weather,
        searchActive: true,
      },
    };
    const { container } = renderForecast({ state: searchActiveState });
    expect(container.querySelector(".location-search")).toBeInTheDocument();
    expect(container.querySelector(".city-name h3")).not.toBeInTheDocument();
  });

  describe("high/low temperature aria-labels", () => {
    it("should have an aria-label on the high temperature arrow", () => {
      const { container } = renderForecast();
      const highArrow = container.querySelector(
        ".high-temperature .arrow-icon.arrow-up"
      );
      expect(highArrow).toBeInTheDocument();
      expect(highArrow).toHaveAttribute("data-l10n-id", "newtab-weather-high");
    });

    it("should have an aria-label on the low temperature arrow", () => {
      const { container } = renderForecast();
      const lowArrow = container.querySelector(
        ".low-temperature .arrow-icon.arrow-down"
      );
      expect(lowArrow).toBeInTheDocument();
      expect(lowArrow).toHaveAttribute("data-l10n-id", "newtab-weather-low");
    });
  });

  describe("context menu", () => {
    it("should render context menu with correct panel items", () => {
      const { container } = renderForecast();

      const menuButton = container.querySelector(
        ".weather-forecast-context-menu-button"
      );
      expect(menuButton).toBeInTheDocument();
      expect(menuButton).toHaveAttribute(
        "data-l10n-id",
        "newtab-menu-section-tooltip"
      );
      expect(
        container.querySelector("#weather-forecast-context-menu")
      ).toBeInTheDocument();

      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-celsius']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-menu-hide']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-learn-more']"
        )
      ).toBeInTheDocument();
    });

    it("should not show 'Detect my location' when opt-in is disabled", () => {
      const { container } = renderForecast({
        state: stateWithPref("system.showWeatherOptIn", false),
      });
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
        )
      ).not.toBeInTheDocument();
    });

    it("should show 'Change to Fahrenheit' when temperature unit is Celsius", () => {
      const { container } = renderForecast({
        state: stateWithPref("weather.temperatureUnits", "c"),
      });
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-fahrenheit']"
        )
      ).toBeInTheDocument();
    });

    it("should dispatch WEATHER_SEARCH_ACTIVE when 'Change location' is clicked", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.WEATHER_SEARCH_ACTIVE,
        data: true,
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "change_location",
          widget_size: "small",
        }),
      });
    });

    it("should dispatch WEATHER_USER_OPT_IN_LOCATION when 'Detect my location' is clicked", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.WEATHER_USER_OPT_IN_LOCATION,
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "detect_location",
          widget_size: "small",
        }),
      });
    });

    it("should dispatch SET_PREF to change temperature units to Celsius", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-celsius']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.SET_PREF,
        data: { name: "weather.temperatureUnits", value: "c" },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "change_temperature_units",
          widget_size: "small",
          action_value: "c",
        }),
      });
    });

    it("should dispatch SET_PREF to change display to simple", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.SET_PREF,
        data: { name: "weather.display", value: "simple" },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "change_weather_display",
          widget_size: "small",
        }),
      });
    });

    it("should dispatch SET_PREF to hide weather when 'Hide weather' is clicked", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-menu-hide']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.SET_PREF,
        data: { name: "showWeather", value: false },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_ENABLED,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          enabled: false,
          widget_size: "small",
        }),
      });
    });

    it("should dispatch OPEN_LINK when 'Learn more' is clicked", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-learn-more']"
        )
      );

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.OPEN_LINK,
        data: {
          url: "https://support.mozilla.org/kb/firefox-new-tab-widgets",
        },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "learn_more",
          widget_size: "small",
        }),
      });
    });

    it("should report widget_size as 'medium' when widget is maximized", () => {
      const { container, dispatch } = renderForecast({
        props: { isMaximized: true },
      });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
        )
      );

      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ widget_size: "medium" }),
      });
    });
  });

  describe("hourly forecast", () => {
    it("should display one row item per hourly forecast", () => {
      const { container } = renderForecast();
      expect(container.querySelectorAll(".forecast-row-items li")).toHaveLength(
        hourlyForecasts.length
      );
    });

    it("should render the correct weather icon class for each forecast item", () => {
      const { container } = renderForecast();
      const items = container.querySelectorAll(".forecast-row-items li");
      items.forEach((item, index) => {
        expect(
          item.querySelector(
            `.weather-icon.iconId${hourlyForecasts[index].icon_id}`
          )
        ).toBeInTheDocument();
      });
    });

    it("should render aria-label with summary for each weather icon", () => {
      const { container } = renderForecast();
      const items = container.querySelectorAll(".forecast-row-items li");
      items.forEach((item, index) => {
        expect(item.querySelector(".weather-icon")).toHaveAttribute(
          "aria-label",
          hourlyForecasts[index].summary
        );
      });
    });

    it("should render an empty list when hourlyForecasts is empty", () => {
      const noHourlyState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          hourlyForecasts: [],
        },
      };
      const { container } = renderForecast({ state: noHourlyState });
      expect(container.querySelectorAll(".forecast-row-items li")).toHaveLength(
        0
      );
    });
  });

  describe("error state", () => {
    it("should render error state when weather data is missing current_conditions", () => {
      const { container } = renderForecast({
        state: stateWithSuggestion({
          forecast: {
            high: { c: 25, f: 77 },
            low: { c: 15, f: 59 },
            url: "https://example.com",
          },
        }),
      });

      const error = container.querySelector(".forecast-error");
      expect(error).toBeInTheDocument();
      expect(
        error.querySelector(
          "p[data-l10n-id='newtab-weather-error-not-available']"
        )
      ).toBeInTheDocument();
    });

    it("should render error state when weather data is missing forecast", () => {
      const { container } = renderForecast({
        state: stateWithSuggestion({
          current_conditions: {
            icon_id: 3,
            summary: "Partly Cloudy",
            temperature: { c: 20, f: 68 },
          },
        }),
      });
      expect(container.querySelector(".forecast-error")).toBeInTheDocument();
    });

    it("should add forecast-error-state class when there is an error", () => {
      const { container } = renderForecast({
        state: stateWithSuggestion({}),
      });
      expect(
        container.querySelector(".weather-forecast-widget.forecast-error-state")
      ).toBeInTheDocument();
    });

    it("should hide current weather info when error state is shown", () => {
      const { container } = renderForecast({
        state: stateWithSuggestion({}),
      });
      expect(
        container.querySelector(".current-weather-wrapper")
      ).not.toBeInTheDocument();
      expect(container.querySelector(".forecast-error")).toBeInTheDocument();
    });

    it("should not render .forecast-anchor when there is an error", () => {
      const { container } = renderForecast({
        state: stateWithSuggestion({}),
      });
      expect(
        container.querySelector(".forecast-anchor")
      ).not.toBeInTheDocument();
    });

    it("should render .forecast-anchor as an anchor tag when there is no error", () => {
      const { container } = renderForecast();
      const anchor = container.querySelector(".forecast-anchor");
      expect(anchor).toBeInTheDocument();
      expect(anchor.tagName).toBe("A");
      expect(anchor).toHaveAttribute("aria-label", "Testville");
    });
  });

  describe("size submenu (nova)", () => {
    it("does not render submenu when nova is disabled", () => {
      const { container } = renderForecast();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).not.toBeInTheDocument();
    });

    it("renders size submenu when nova is enabled", () => {
      const { container } = renderForecast({ state: novaState });
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-size-small']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-size-medium']"
        )
      ).toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-widget-size-large']"
        )
      ).toBeInTheDocument();
    });

    it("clicking 'Small' dispatches SET_PREF and WIDGETS_USER_EVENT", () => {
      const { container, dispatch } = renderForecast({ state: novaState });

      const submenuNode = container.querySelector(
        "panel-list[id='weather-forecast-size-submenu']"
      );
      const mockItem = document.createElement("div");
      mockItem.dataset.size = "small";
      const clickEvent = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(clickEvent, "composedPath", {
        value: () => [mockItem],
      });
      submenuNode.dispatchEvent(clickEvent);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.SET_PREF,
        data: { name: "widgets.weather.size", value: "small" },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "change_size",
          action_value: "small",
          widget_size: "small",
        }),
      });
    });

    it("clicking 'Large' dispatches SET_PREF and WIDGETS_USER_EVENT", () => {
      const { container, dispatch } = renderForecast({ state: novaState });

      const submenuNode = container.querySelector(
        "panel-list[id='weather-forecast-size-submenu']"
      );
      const mockItem = document.createElement("div");
      mockItem.dataset.size = "large";
      const clickEvent = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(clickEvent, "composedPath", {
        value: () => [mockItem],
      });
      submenuNode.dispatchEvent(clickEvent);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.SET_PREF,
        data: { name: "widgets.weather.size", value: "large" },
      });
      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "context_menu",
          user_action: "change_size",
          action_value: "large",
          widget_size: "large",
        }),
      });
    });

    it("widget_size in telemetry uses pref value when nova is enabled", () => {
      const largeNovaState = stateWithPref(
        "widgets.weather.size",
        "large",
        novaState
      );
      const { container, dispatch } = renderForecast({ state: largeNovaState });

      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
        )
      );

      expect(dispatch.mock.calls[1][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({ widget_size: "large" }),
      });
    });

    it("isSmallSize is true when not maximized and widgetsMayBeMaximized is set", () => {
      const { container } = renderForecast({
        props: { isMaximized: false, widgetsMayBeMaximized: true },
      });
      expect(container.querySelector(".is-small")).toBeInTheDocument();
    });

    it("nova=on, size=medium renders compact layout (.is-small present)", () => {
      const mediumNovaState = stateWithPref(
        "widgets.weather.size",
        "medium",
        novaState
      );
      const { container } = renderForecast({ state: mediumNovaState });
      expect(container.querySelector(".is-small")).toBeInTheDocument();
    });

    it("nova=on, size=large renders full layout (.is-small absent)", () => {
      const largeNovaState = stateWithPref(
        "widgets.weather.size",
        "large",
        novaState
      );
      const { container } = renderForecast({ state: largeNovaState });
      expect(container.querySelector(".is-small")).not.toBeInTheDocument();
    });
  });

  describe("nova display gate and menu", () => {
    it("does not render when nova is enabled and size is small", () => {
      const novaSmallState = stateWithPref(
        "widgets.weather.size",
        "small",
        novaState
      );
      const { container } = renderForecast({ state: novaSmallState });
      expect(
        container.querySelector(".weather-forecast-widget")
      ).not.toBeInTheDocument();
    });

    it("renders without weather.display=detailed when nova is enabled", () => {
      const novaSimpleState = stateWithPref(
        "weather.display",
        "simple",
        novaState
      );
      const { container } = renderForecast({ state: novaSimpleState });
      expect(
        container.querySelector(".weather-forecast-widget")
      ).toBeInTheDocument();
    });

    it("hides CHANGE_DISPLAY items when nova is enabled", () => {
      const { container } = renderForecast({ state: novaState });
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-detailed']"
        )
      ).not.toBeInTheDocument();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
        )
      ).not.toBeInTheDocument();
    });

    it("shows CHANGE_DISPLAY items when nova is disabled", () => {
      const { container } = renderForecast();
      expect(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
        )
      ).toBeInTheDocument();
    });

    it("checked state marks the current size", () => {
      const { container } = renderForecast({ state: novaState });
      expect(
        container
          .querySelector("panel-item[data-l10n-id='newtab-widget-size-medium']")
          .hasAttribute("checked")
      ).toBe(true);
      expect(
        container
          .querySelector("panel-item[data-l10n-id='newtab-widget-size-small']")
          .hasAttribute("checked")
      ).toBe(false);
      expect(
        container
          .querySelector("panel-item[data-l10n-id='newtab-widget-size-large']")
          .hasAttribute("checked")
      ).toBe(false);
    });
  });

  describe("provider link anchor", () => {
    it("should dispatch WIDGETS_USER_EVENT with provider_link_click when the anchor is clicked", () => {
      const { container, dispatch } = renderForecast();
      fireEvent.click(container.querySelector(".forecast-anchor"));

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "widget",
          user_action: "provider_link_click",
          widget_size: "medium",
        }),
      });
    });

    it("should render .full-forecast as an anchor with the forecast URL", () => {
      const { container } = renderForecast();
      const link = container.querySelector("a.full-forecast");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", hourlyForecasts[0].url);
    });

    it("should dispatch WIDGETS_USER_EVENT with provider_link_click when .full-forecast is clicked", () => {
      const { container, dispatch } = renderForecast();
      fireEvent.click(container.querySelector("a.full-forecast"));

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.mock.calls[0][0]).toMatchObject({
        type: at.WIDGETS_USER_EVENT,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "widget",
          user_action: "provider_link_click",
        }),
      });
    });
  });
});
