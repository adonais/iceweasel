/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { _Weather as Weather } from "content-src/components/Weather/Weather";
import { actionTypes as at } from "common/Actions.mjs";

const PREF_SYS_SHOW_WEATHER = "system.showWeather";
const PREF_SYS_SHOW_WEATHER_OPT_IN = "system.showWeatherOptIn";
const PREF_OPT_IN_DISPLAYED = "weather.optInDisplayed";
const PREF_OPT_IN_ACCEPTED = "weather.optInAccepted";
const PREF_STATIC_WEATHER_DATA = "weather.staticData.enabled";

// keeps initialize = true and provides fake suggestion + location data
// so the component skips <WeatherPlaceholder>.
const weatherInit = {
  initialized: true,
  suggestions: [
    {
      forecast: { url: "https://example.com" },
      current_conditions: {
        temperature: { c: 22, f: 72 },
        icon_id: 3,
        summary: "Sunny",
      },
    },
  ],
  locationData: { city: "Testville" },
};

// base mockState for general Weather-rendering tests.
// Opt-in is disabled here since it's only shown in specific locations
const mockState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      [PREF_SYS_SHOW_WEATHER]: true,
      [PREF_SYS_SHOW_WEATHER_OPT_IN]: false,
      "feeds.weatherfeed": true,
    },
  },
  Weather: { ...weatherInit },
};

// mock state for opt-in prompt tests.
// Ensures the opt-in dialog appears by default.
const optInMockState = {
  ...mockState,
  Prefs: {
    ...mockState.Prefs,
    values: {
      ...mockState.Prefs.values,
      showWeather: true,
      [PREF_SYS_SHOW_WEATHER_OPT_IN]: true,
      [PREF_OPT_IN_DISPLAYED]: true,
      [PREF_OPT_IN_ACCEPTED]: false,
      [PREF_STATIC_WEATHER_DATA]: true,
      "weather.locationSearchEnabled": true,
      "weather.display": "simple",
      "weather.temperatureUnits": "c",
    },
  },
};

const novaWeatherState = {
  ...mockState,
  Prefs: {
    ...mockState.Prefs,
    values: {
      ...mockState.Prefs.values,
      "nova.enabled": true,
      "widgets.weather.size": "medium",
      "weather.locationSearchEnabled": true,
      "system.showWeatherOptIn": false,
      "weather.temperatureUnits": "f",
      "weather.display": "simple",
      "weather.staticData.enabled": false,
    },
  },
};

describe("<Weather>", () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
  });

  // Renders the unconnected _Weather with the props the redux connector would
  // normally supply, mirroring how the legacy Enzyme test drove the component.
  // `ref` reaches the instance for the tests that mocked panelElement.
  function renderWeather(state, ref) {
    return render(
      <Weather
        ref={ref}
        dispatch={dispatch}
        App={state.App}
        Prefs={state.Prefs}
        Weather={state.Weather}
        document={globalThis.document}
      />
    );
  }

  it("should render and show <Weather> if the `system.showWeather` pref is enabled", () => {
    const { container } = renderWeather(mockState);
    // Faithful equivalent of Enzyme wrapper.exists(): the component rendered.
    expect(container.firstChild).toBeInTheDocument();
    expect(container.querySelector(".weather")).toBeInTheDocument();
  });

  describe("size submenu (nova)", () => {
    it("does not render size submenu when nova is disabled", () => {
      const { container } = renderWeather(mockState);

      expect(
        container.querySelector(
          "span[data-l10n-id='newtab-widget-menu-change-size']"
        )
      ).not.toBeInTheDocument();
    });

    it("renders size submenu when nova is enabled", () => {
      const { container } = renderWeather(novaWeatherState);

      expect(
        container.querySelector(
          "span[data-l10n-id='newtab-widget-menu-change-size']"
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

    it("clicking a size option dispatches SET_PREF and WIDGETS_USER_EVENT", () => {
      const ref = React.createRef();
      const { container } = renderWeather(novaWeatherState, ref);

      const weatherInstance = ref.current;
      weatherInstance.panelElement = {
        hide: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const submenuNode = container.querySelector(
        "panel-list[id='weather-size-submenu']"
      );
      const mockItem = document.createElement("div");
      mockItem.dataset.size = "small";
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "composedPath", { value: () => [mockItem] });
      submenuNode.dispatchEvent(event);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      const setPrefAction = dispatchedActions.find(a => a.type === at.SET_PREF);
      expect(setPrefAction).toBeTruthy();
      expect(setPrefAction.data.name).toEqual("widgets.weather.size");
      expect(setPrefAction.data.value).toEqual("small");

      const telemetryAction = dispatchedActions.find(
        a => a.type === at.WIDGETS_USER_EVENT
      );
      expect(telemetryAction).toBeTruthy();
      expect(telemetryAction.data.widget_name).toEqual("weather");
      expect(telemetryAction.data.widget_source).toEqual("context_menu");
      expect(telemetryAction.data.user_action).toEqual("change_size");
      expect(telemetryAction.data.action_value).toEqual("small");
      expect(telemetryAction.data.widget_size).toEqual("mini");
    });

    it("hides CHANGE_DISPLAY items when nova is enabled", () => {
      const { container } = renderWeather(novaWeatherState);

      expect(
        container.querySelector("#weather-menu-display-detailed")
      ).not.toBeInTheDocument();
      expect(
        container.querySelector("#weather-menu-display-simple")
      ).not.toBeInTheDocument();
    });

    it("shows CHANGE_DISPLAY items when nova is disabled", () => {
      const simpleState = {
        ...mockState,
        Prefs: {
          ...mockState.Prefs,
          values: {
            ...mockState.Prefs.values,
            "weather.display": "simple",
          },
        },
      };

      const { container } = renderWeather(simpleState);

      expect(
        container.querySelector("#weather-menu-display-detailed")
      ).toBeInTheDocument();
    });

    it("checked state marks the current size", () => {
      const { container } = renderWeather(novaWeatherState);

      const mediumItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-size-medium']"
      );
      const smallItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-size-small']"
      );
      const largeItem = container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-size-large']"
      );

      expect(mediumItem).toHaveAttribute("checked");
      expect(smallItem).not.toHaveAttribute("checked");
      expect(largeItem).not.toHaveAttribute("checked");
    });
  });

  describe("size-driven visibility (nova)", () => {
    it("renders mini widget when nova=on, size=small, forecastWidget=enabled", () => {
      const state = {
        ...mockState,
        Prefs: {
          ...mockState.Prefs,
          values: {
            ...mockState.Prefs.values,
            "nova.enabled": true,
            "widgets.weather.size": "small",
            "widgets.system.weatherForecast.enabled": true,
          },
        },
      };

      const { container } = renderWeather(state);

      expect(container.querySelector(".weather")).toBeInTheDocument();
    });

    it("hides mini widget when nova=on, size=medium, forecastWidget=enabled", () => {
      const state = {
        ...mockState,
        Prefs: {
          ...mockState.Prefs,
          values: {
            ...mockState.Prefs.values,
            "nova.enabled": true,
            "widgets.weather.size": "medium",
            "widgets.system.weatherForecast.enabled": true,
          },
        },
      };

      const { container } = renderWeather(state);

      expect(container.querySelector(".weather")).not.toBeInTheDocument();
    });
  });

  describe("Opt-in prompt actions", () => {
    it("should dispatch correct actions when user accepts weather opt-in", () => {
      const { container } = renderWeather(optInMockState);

      const acceptBtn = container.querySelector("#accept-opt-in");
      fireEvent.click(acceptBtn);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      // Old events (backward compatibility)
      expect(
        dispatchedActions.some(
          action => action.type === at.WEATHER_USER_OPT_IN_LOCATION
        )
      ).toBe(true);

      expect(
        dispatchedActions.some(
          action =>
            action.type === at.WEATHER_OPT_IN_PROMPT_SELECTION &&
            action.data === "accepted opt-in"
        )
      ).toBe(true);

      // New unified event
      const unifiedEvent = dispatchedActions.find(
        action => action.type === at.WIDGETS_USER_EVENT
      );
      expect(unifiedEvent).toBeTruthy();
      expect(unifiedEvent.data.widget_name).toEqual("weather");
      expect(unifiedEvent.data.widget_source).toEqual("widget");
      expect(unifiedEvent.data.user_action).toEqual("opt_in_accepted");
      expect(unifiedEvent.data.action_value).toEqual(true);
      expect(unifiedEvent.data.widget_size).toEqual("mini");
    });

    it("should dispatch correct actions when user rejects weather opt-in", () => {
      const { container } = renderWeather(optInMockState);

      const acceptBtn = container.querySelector("#reject-opt-in");
      fireEvent.click(acceptBtn);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      // Old event (backward compatibility)
      expect(
        dispatchedActions.some(
          action =>
            action.type === at.WEATHER_OPT_IN_PROMPT_SELECTION &&
            action.data === "rejected opt-in"
        )
      ).toBe(true);

      // New unified event
      const unifiedEvent = dispatchedActions.find(
        action => action.type === at.WIDGETS_USER_EVENT
      );
      expect(unifiedEvent).toBeTruthy();
      expect(unifiedEvent.data.widget_name).toEqual("weather");
      expect(unifiedEvent.data.widget_source).toEqual("widget");
      expect(unifiedEvent.data.user_action).toEqual("opt_in_accepted");
      expect(unifiedEvent.data.action_value).toEqual(false);
      expect(unifiedEvent.data.widget_size).toEqual("mini");
    });

    it("should render a shorter context menu when system.showWeatherOptIn is enabled", () => {
      const { container } = renderWeather(optInMockState);

      // panel-list should render with only the shortened menu items
      const panelList = container.querySelector("panel-list");
      expect(panelList).toBeInTheDocument();

      // Check that the correct menu items are present
      expect(
        container.querySelector("#weather-menu-change-location")
      ).toBeInTheDocument();
      expect(
        container.querySelector("#weather-menu-detect-location")
      ).toBeInTheDocument();
      expect(container.querySelector("#weather-menu-hide")).toBeInTheDocument();
      expect(
        container.querySelector("#weather-menu-learn-more")
      ).toBeInTheDocument();

      // Check that temperature/display options are NOT present (shortened menu)
      expect(
        container.querySelector("#weather-menu-temp-celsius")
      ).not.toBeInTheDocument();
    });

    it("should dispatch correct actions when 'Detect my location' option in context menu is clicked", () => {
      const ref = React.createRef();
      const { container } = renderWeather(optInMockState, ref);

      // Mock the panel element's hide method
      const weatherInstance = ref.current;
      weatherInstance.panelElement = {
        hide: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      // Find the detect location panel-item
      const detectLocationBtn = container.querySelector(
        "#weather-menu-detect-location"
      );

      expect(detectLocationBtn).toBeInTheDocument();

      fireEvent.click(detectLocationBtn);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      // Old event (backward compatibility)
      expect(
        dispatchedActions.some(
          action => action.type === at.WEATHER_USER_OPT_IN_LOCATION
        )
      ).toBe(true);

      // New unified event
      const unifiedEvent = dispatchedActions.find(
        action => action.type === at.WIDGETS_USER_EVENT
      );
      expect(unifiedEvent).toBeTruthy();
      expect(unifiedEvent.data.widget_name).toEqual("weather");
      expect(unifiedEvent.data.widget_source).toEqual("context_menu");
      expect(unifiedEvent.data.user_action).toEqual("detect_location");
      expect(unifiedEvent.data.widget_size).toEqual("mini");
    });

    it("should dispatch correct actions when weather display mode is changed", () => {
      const fullMenuState = {
        ...optInMockState,
        Prefs: {
          ...optInMockState.Prefs,
          values: {
            ...optInMockState.Prefs.values,
            [PREF_STATIC_WEATHER_DATA]: false,
          },
        },
      };
      const ref = React.createRef();
      const { container } = renderWeather(fullMenuState, ref);

      const weatherInstance = ref.current;
      weatherInstance.panelElement = {
        hide: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const displayMenuItem = container.querySelector(
        "#weather-menu-display-detailed"
      );
      expect(displayMenuItem).toBeInTheDocument();

      fireEvent.click(displayMenuItem);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      const unifiedEvent = dispatchedActions.find(
        action => action.type === at.WIDGETS_USER_EVENT
      );
      expect(unifiedEvent).toBeTruthy();
      expect(unifiedEvent.data.widget_name).toEqual("weather");
      expect(unifiedEvent.data.widget_source).toEqual("context_menu");
      expect(unifiedEvent.data.user_action).toEqual("change_weather_display");
      expect(unifiedEvent.data.action_value).toEqual("detailed");
      expect(unifiedEvent.data.widget_size).toEqual("mini");
    });

    it("should dispatch correct actions when temperature unit is changed", () => {
      const fullMenuState = {
        ...optInMockState,
        Prefs: {
          ...optInMockState.Prefs,
          values: {
            ...optInMockState.Prefs.values,
            [PREF_STATIC_WEATHER_DATA]: false,
          },
        },
      };
      const ref = React.createRef();
      const { container } = renderWeather(fullMenuState, ref);

      const weatherInstance = ref.current;
      weatherInstance.panelElement = {
        hide: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const tempMenuItem = container.querySelector(
        "#weather-menu-temp-fahrenheit"
      );
      expect(tempMenuItem).toBeInTheDocument();

      fireEvent.click(tempMenuItem);

      const dispatchedActions = dispatch.mock.calls.map(([action]) => action);

      const unifiedEvent = dispatchedActions.find(
        action => action.type === at.WIDGETS_USER_EVENT
      );
      expect(unifiedEvent).toBeTruthy();
      expect(unifiedEvent.data.widget_name).toEqual("weather");
      expect(unifiedEvent.data.widget_source).toEqual("context_menu");
      expect(unifiedEvent.data.user_action).toEqual("change_temperature_units");
      expect(unifiedEvent.data.action_value).toEqual("f");
      expect(unifiedEvent.data.widget_size).toEqual("mini");
    });
  });
});
