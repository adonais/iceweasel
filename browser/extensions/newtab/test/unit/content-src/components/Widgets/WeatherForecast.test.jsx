import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
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
    date_time: "2024-01-15T14:00:00",
  },
  {
    epoch_date_time: 1000003600,
    temperature: { c: 17, f: 62 },
    icon_id: 6,
    date_time: "2024-01-15T15:00:00",
  },
  {
    epoch_date_time: 1000007200,
    temperature: { c: 16, f: 61 },
    icon_id: 7,
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

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  let store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<WeatherForecast>", () => {
  let wrapper;
  let sandbox;
  let dispatch;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dispatch = sandbox.stub();

    wrapper = mount(
      <WrapWithProvider state={mockState}>
        <WeatherForecast dispatch={dispatch} />
      </WrapWithProvider>
    );
  });

  afterEach(() => {
    sandbox.restore();
    wrapper?.unmount();
  });

  it("should render weather forecast widget", () => {
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".weather-forecast-widget").exists());
  });

  it("should not render when detailed view is disabled", () => {
    const simpleViewState = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "weather.display": "simple",
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={simpleViewState}>
        <WeatherForecast dispatch={dispatch} />
      </WrapWithProvider>
    );

    assert.ok(!wrapper.find(".weather-forecast-widget").exists());
  });

  it("should not render when weather is disabled", () => {
    const weatherDisabledState = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          showWeather: false,
        },
      },
    };

    wrapper = mount(
      <WrapWithProvider state={weatherDisabledState}>
        <WeatherForecast dispatch={dispatch} />
      </WrapWithProvider>
    );

    assert.ok(!wrapper.find(".weather-forecast-widget").exists());
  });

  it("should display city name when search is inactive", () => {
    const cityName = wrapper.find(".city-name h3");
    assert.ok(cityName.exists());
    assert.equal(cityName.text(), "Testville");
  });

  it("should display LocationSearch component when search is active", () => {
    const searchActiveState = {
      ...mockState,
      Weather: {
        ...mockState.Weather,
        searchActive: true,
      },
    };

    wrapper = mount(
      <WrapWithProvider state={searchActiveState}>
        <WeatherForecast dispatch={dispatch} />
      </WrapWithProvider>
    );

    assert.ok(wrapper.find("LocationSearch").exists());
    assert.ok(!wrapper.find(".city-name h3").exists());
  });

  describe("context menu", () => {
    it("should render context menu with correct panel items", () => {
      assert.ok(wrapper.find(".weather-forecast-context-menu-button").exists());
      assert.equal(
        wrapper
          .find(".weather-forecast-context-menu-button")
          .prop("data-l10n-id"),
        "newtab-menu-section-tooltip"
      );
      assert.ok(wrapper.find("#weather-forecast-context-menu").exists());

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
          )
          .exists()
      );

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
          )
          .exists()
      );

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-celsius']"
          )
          .exists()
      );

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
          )
          .exists()
      );

      assert.ok(
        wrapper
          .find("panel-item[data-l10n-id='newtab-widget-menu-hide']")
          .exists()
      );

      assert.ok(
        wrapper
          .find("panel-item[data-l10n-id='newtab-weather-menu-learn-more']")
          .exists()
      );
    });

    it("should not show 'Detect my location' when opt-in is disabled", () => {
      const noOptInState = {
        ...mockState,
        Prefs: {
          ...mockState.Prefs,
          values: {
            ...mockState.Prefs.values,
            "system.showWeatherOptIn": false,
          },
        },
      };

      wrapper = mount(
        <WrapWithProvider state={noOptInState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.isFalse(
        wrapper.contains(
          "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
        )
      );
    });

    it("should show 'Change to Fahrenheit' when temperature unit is Celsius", () => {
      const celsiusState = {
        ...mockState,
        Prefs: {
          ...mockState.Prefs,
          values: {
            ...mockState.Prefs.values,
            "weather.temperatureUnits": "c",
          },
        },
      };

      wrapper = mount(
        <WrapWithProvider state={celsiusState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(
        wrapper
          .find(
            "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-fahrenheit']"
          )
          .exists()
      );
    });

    it("should dispatch WEATHER_SEARCH_ACTIVE when 'Change location' is clicked", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const changeLocationItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
      );
      changeLocationItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.WEATHER_SEARCH_ACTIVE);
      assert.equal(action.data, true);

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(telemetryAction.data.user_action, "change_location");
      assert.equal(telemetryAction.data.widget_size, "small");
    });

    it("should dispatch WEATHER_USER_OPT_IN_LOCATION when 'Detect my location' is clicked", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const detectLocationItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-detect-my-location']"
      );
      detectLocationItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.WEATHER_USER_OPT_IN_LOCATION);

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(telemetryAction.data.user_action, "detect_location");
      assert.equal(telemetryAction.data.widget_size, "small");
    });

    it("should dispatch SET_PREF to change temperature units to Celsius", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const changeTempItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-change-temperature-units-celsius']"
      );
      changeTempItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.SET_PREF);
      assert.equal(action.data.name, "weather.temperatureUnits");
      assert.equal(action.data.value, "c");

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(
        telemetryAction.data.user_action,
        "change_temperature_units"
      );
      assert.equal(telemetryAction.data.widget_size, "small");
      assert.equal(telemetryAction.data.action_value, "c");
    });

    it("should dispatch SET_PREF to change display to simple", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const changeDisplayItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-change-weather-display-simple']"
      );
      changeDisplayItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.SET_PREF);
      assert.equal(action.data.name, "weather.display");
      assert.equal(action.data.value, "simple");

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(telemetryAction.data.user_action, "change_weather_display");
      assert.equal(telemetryAction.data.widget_size, "small");
    });

    it("should dispatch SET_PREF to hide weather when 'Hide weather' is clicked", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const hideWeatherItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-widget-menu-hide']"
      );
      hideWeatherItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.SET_PREF);
      assert.equal(action.data.name, "showWeather");
      assert.equal(action.data.value, false);

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_ENABLED);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(telemetryAction.data.enabled, false);
      assert.equal(telemetryAction.data.widget_size, "small");
    });

    it("should dispatch OPEN_LINK when 'Learn more' is clicked", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast
            dispatch={dispatch}
            isMaximized={false}
            widgetsMayBeMaximized={true}
          />
        </WrapWithProvider>
      );

      const learnMoreItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-learn-more']"
      );
      learnMoreItem.props().onClick();

      assert.ok(dispatch.calledTwice);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.OPEN_LINK);
      assert.equal(
        action.data.url,
        "https://support.mozilla.org/kb/firefox-new-tab-widgets"
      );

      // Verify telemetry
      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_name, "weather");
      assert.equal(telemetryAction.data.widget_source, "context_menu");
      assert.equal(telemetryAction.data.user_action, "learn_more");
      assert.equal(telemetryAction.data.widget_size, "small");
    });

    it("should report widget_size as 'medium' when widget is maximized", () => {
      wrapper = mount(
        <WrapWithProvider state={mockState}>
          <WeatherForecast dispatch={dispatch} isMaximized={true} />
        </WrapWithProvider>
      );

      const changeLocationItem = wrapper.find(
        "panel-item[data-l10n-id='newtab-weather-menu-change-location']"
      );
      changeLocationItem.props().onClick();

      const [telemetryAction] = dispatch.getCall(1).args;
      assert.equal(telemetryAction.type, at.WIDGETS_USER_EVENT);
      assert.equal(telemetryAction.data.widget_size, "medium");
    });
  });

  describe("hourly forecast", () => {
    it("should display one row item per hourly forecast", () => {
      const items = wrapper.find(".forecast-row-items li");
      assert.equal(items.length, hourlyForecasts.length);
    });

    it("should render the correct weather icon class for each forecast item", () => {
      const items = wrapper.find(".forecast-row-items li");
      items.forEach((item, index) => {
        assert.ok(
          item
            .find(`.weather-icon.iconId${hourlyForecasts[index].icon_id}`)
            .exists()
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

      const noHourlyWrapper = mount(
        <WrapWithProvider state={noHourlyState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.equal(noHourlyWrapper.find(".forecast-row-items li").length, 0);
      noHourlyWrapper.unmount();
    });
  });

  describe("error state", () => {
    it("should render error state when weather data is missing current_conditions", () => {
      const errorState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          suggestions: [
            {
              forecast: {
                high: { c: 25, f: 77 },
                low: { c: 15, f: 59 },
                url: "https://example.com",
              },
            },
          ],
        },
      };

      wrapper = mount(
        <WrapWithProvider state={errorState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(wrapper.find(".forecast-error").exists());
      assert.ok(
        wrapper
          .find(".forecast-error")
          .find("p[data-l10n-id='newtab-weather-error-not-available']")
          .exists()
      );
    });

    it("should render error state when weather data is missing forecast", () => {
      const errorState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          suggestions: [
            {
              current_conditions: {
                icon_id: 3,
                summary: "Partly Cloudy",
                temperature: { c: 20, f: 68 },
              },
            },
          ],
        },
      };

      wrapper = mount(
        <WrapWithProvider state={errorState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(wrapper.find(".forecast-error").exists());
    });

    it("should add forecast-error-state class when there is an error", () => {
      const errorState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          suggestions: [{}],
        },
      };

      wrapper = mount(
        <WrapWithProvider state={errorState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(
        wrapper.find(".weather-forecast-widget.forecast-error-state").exists()
      );
    });

    it("should hide current weather info when error state is shown", () => {
      const errorState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          suggestions: [{}],
        },
      };

      wrapper = mount(
        <WrapWithProvider state={errorState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(!wrapper.find(".current-weather-wrapper").exists());
      assert.ok(wrapper.find(".forecast-error").exists());
    });

    it("should not render .forecast-anchor when there is an error", () => {
      const errorState = {
        ...mockState,
        Weather: {
          ...mockState.Weather,
          suggestions: [{}],
        },
      };

      wrapper = mount(
        <WrapWithProvider state={errorState}>
          <WeatherForecast dispatch={dispatch} />
        </WrapWithProvider>
      );

      assert.ok(!wrapper.find(".forecast-anchor").exists());
    });

    it("should render .forecast-anchor as an anchor tag when there is no error", () => {
      const anchor = wrapper.find(".forecast-anchor");
      assert.ok(anchor.exists());
      assert.equal(anchor.type(), "a");
      assert.equal(anchor.prop("aria-label"), "Testville");
    });
  });

  describe("provider link anchor", () => {
    it("should dispatch WIDGETS_USER_EVENT with provider_link_click when the anchor is clicked", () => {
      const anchor = wrapper.find(".forecast-anchor");
      anchor.props().onClick();

      assert.ok(dispatch.calledOnce);
      const [action] = dispatch.getCall(0).args;
      assert.equal(action.type, at.WIDGETS_USER_EVENT);
      assert.equal(action.data.widget_name, "weather");
      assert.equal(action.data.widget_source, "widget");
      assert.equal(action.data.user_action, "provider_link_click");
      assert.equal(action.data.widget_size, "medium");
    });
  });
});
