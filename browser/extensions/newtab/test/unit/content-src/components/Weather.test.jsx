import React from "react";
import { mount } from "enzyme";
import { Provider } from "react-redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { combineReducers, createStore } from "redux";
import { Weather } from "content-src/components/Weather/Weather";
import { actionTypes as at } from "common/Actions.mjs";
import { LinkMenu } from "content-src/components/LinkMenu/LinkMenu";

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

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<Weather>", () => {
  let wrapper;
  let sandbox;
  let dispatch;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dispatch = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    wrapper?.unmount();
  });

  it("should render and show <Weather> if the `system.showWeather` pref is enabled", () => {
    wrapper = mount(
      <WrapWithProvider state={mockState}>
        <Weather dispatch={dispatch} />
      </WrapWithProvider>
    );
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".weather").exists());
  });

  describe("Opt-in prompt actions", () => {
    it("should dispatch correct actions when user accepts weather opt-in", () => {
      const store = createStore(combineReducers(reducers), optInMockState);
      sinon.spy(store, "dispatch");

      wrapper = mount(
        <Provider store={store}>
          <Weather />
        </Provider>
      );

      const acceptBtn = wrapper.find("#accept-opt-in");
      acceptBtn.simulate("click", { preventDefault() {} });

      const dispatchedActions = store.dispatch
        .getCalls()
        .map(call => call.args[0]);

      assert.ok(
        dispatchedActions.some(
          action => action.type === at.WEATHER_USER_OPT_IN_LOCATION
        ),
        "Expected WEATHER_USER_OPT_IN_LOCATION to be dispatched"
      );

      assert.ok(
        dispatchedActions.some(
          action =>
            action.type === at.WEATHER_OPT_IN_PROMPT_SELECTION &&
            action.data === "accepted opt-in"
        ),
        "Expected WEATHER_OPT_IN_PROMPT_SELECTION with accepted opt-in"
      );
    });

    it("should dispatch correct actions when user rejects weather opt-in", () => {
      const store = createStore(combineReducers(reducers), optInMockState);
      sinon.spy(store, "dispatch");

      wrapper = mount(
        <Provider store={store}>
          <Weather />
        </Provider>
      );

      const acceptBtn = wrapper.find("#reject-opt-in");
      acceptBtn.simulate("click", { preventDefault() {} });

      const dispatchedActions = store.dispatch
        .getCalls()
        .map(call => call.args[0]);

      assert.ok(
        dispatchedActions.some(
          action =>
            action.type === at.WEATHER_OPT_IN_PROMPT_SELECTION &&
            action.data === "rejected opt-in"
        ),
        "Expected WEATHER_OPT_IN_PROMPT_SELECTION with rejected opt-in"
      );
    });

    it("should render a shorter context menu when system.showWeatherOptIn is enabled", () => {
      wrapper = mount(
        <WrapWithProvider state={optInMockState}>
          <Weather dispatch={dispatch} />
        </WrapWithProvider>
      );

      // find the inner _Weather component (the real class)
      const inner = wrapper.find("_Weather");
      assert.ok(inner.exists(), "Inner _Weather component should exist");

      // toggle context menu state on the real instance
      inner.instance().setState({ showContextMenu: true });
      wrapper.update();

      const menu = wrapper.find(LinkMenu);
      assert.ok(
        menu.exists(),
        "Expected LinkMenu to render when context menu opened"
      );

      const contextMenuOptions = menu.prop("options");
      assert.deepEqual(contextMenuOptions, [
        "ChangeWeatherLocation",
        "DetectLocation",
        "HideWeather",
        "OpenLearnMoreURL",
      ]);
    });

    it("should dispatch correct actions when 'Detect my location' option in context menu is clicked", () => {
      const store = createStore(combineReducers(reducers), optInMockState);
      sinon.spy(store, "dispatch");

      wrapper = mount(
        <Provider store={store}>
          <Weather />
        </Provider>
      );

      // find the inner _Weather component
      const inner = wrapper.find("_Weather");
      assert.ok(inner.exists(), "Inner _Weather component should exist");

      // toggle context menu state on the real instance
      inner.instance().setState({ showContextMenu: true });
      wrapper.update();

      const menu = wrapper.find(LinkMenu);
      assert.ok(
        menu.exists(),
        "Expected LinkMenu to render when context menu opened"
      );

      const detectLocationBtn = wrapper.find(
        '[data-l10n-id="newtab-weather-menu-detect-my-location"]'
      );

      assert.ok(detectLocationBtn.exists());

      detectLocationBtn.simulate("click", { preventDefault() {} });

      const dispatchedActions = store.dispatch
        .getCalls()
        .map(call => call.args[0]);

      assert.ok(
        dispatchedActions.some(
          action => action.type === at.WEATHER_USER_OPT_IN_LOCATION
        ),
        "Expected WEATHER_USER_OPT_IN_LOCATION to be dispatched"
      );
    });
  });
});
