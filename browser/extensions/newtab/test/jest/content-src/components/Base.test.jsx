/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { actionTypes as at, actionCreators as ac } from "common/Actions.mjs";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  Base as ConnectedBase,
  _Base as Base,
  BaseContent,
} from "content-src/components/Base/Base";

const weatherSuggestion = {
  current_conditions: {
    icon_id: 3,
    summary: "Partly Cloudy",
    temperature: { c: 20, f: 68 },
  },
  forecast: {
    high: { c: 25, f: 77 },
    low: { c: 15, f: 59 },
    url: "https://example.com",
  },
};

describe("<Base>", () => {
  it("should not render without App.initialized", () => {
    const props = {
      App: { initialized: false },
      Prefs: { values: {} },
      dispatch: jest.fn(),
    };
    const { container } = render(
      <WrapWithProvider>
        <Base {...props} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".base-content-fallback")
    ).not.toBeInTheDocument();
  });
});

describe("<Base> Nova startup layout stability", () => {
  it("keeps the centered-logo layout stable while the small weather widget initializes", () => {
    const store = createStore(combineReducers(reducers), {
      ...INITIAL_STATE,
      App: {
        ...INITIAL_STATE.App,
        initialized: true,
      },
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "nova.enabled": true,
          showWeather: true,
          "widgets.enabled": true,
          "widgets.system.enabled": true,
          "widgets.system.weather.enabled": true,
          "widgets.weather.enabled": true,
          "widgets.weather.size": "small",
        },
      },
      Weather: {
        ...INITIAL_STATE.Weather,
        initialized: false,
        locationData: { city: "Testville" },
      },
    });

    const { container } = render(
      <Provider store={store}>
        <ConnectedBase />
      </Provider>
    );

    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sidebar-inline-end .weather-widget")
    ).not.toBeInTheDocument();

    act(() => {
      store.dispatch({
        type: at.WEATHER_UPDATE,
        data: {
          suggestions: [weatherSuggestion],
          hourlyForecasts: [],
          lastUpdated: Date.now(),
          locationData: { city: "Testville" },
        },
      });
    });

    expect(
      container.querySelector(".container.nova-enabled.logo-in-content")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        ".sidebar-inline-start .logo-and-wordmark-wrapper"
      )
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".sidebar-inline-end .weather-widget")
    ).toBeInTheDocument();
  });
});

describe("<BaseContent> weather opt-in dialog trigger", () => {
  function makeInstance(currentPrefs, dispatch = jest.fn()) {
    const inst = Object.create(BaseContent.prototype);
    inst.props = {
      Prefs: { values: currentPrefs },
      dispatch,
      App: { isForStartupCache: {} },
      DiscoveryStream: { spocs: {} },
    };
    inst.state = { visible: false };
    inst.applyBodyClasses = jest.fn();
    inst.spocsOnDemandUpdated = jest.fn();
    inst.trackSpocPlaceholderDuration = jest.fn();
    Object.defineProperty(inst, "isSpocsOnDemandExpired", { get: () => false });
    return { inst, dispatch };
  }

  function makePrevProps(prefs) {
    return {
      Prefs: { values: prefs },
      DiscoveryStream: { spocs: {} },
      App: { isForStartupCache: {} },
    };
  }

  it("triggers weather.optInDisplayed in classic mode when showWeather transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": false,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": false, showWeather: false })
    );

    expect(dispatch).toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("does not trigger weather.optInDisplayed in classic mode when showWeather was already true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": false,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": false, showWeather: true })
    );

    expect(dispatch).not.toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("triggers weather.optInDisplayed in Nova mode when widgets.weather.enabled transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": true,
      "widgets.weather.enabled": true,
    });

    inst.componentDidUpdate(
      makePrevProps({ "nova.enabled": true, "widgets.weather.enabled": false })
    );

    expect(dispatch).toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });

  it("does not trigger weather.optInDisplayed in Nova mode when only showWeather transitions to true", () => {
    const { inst, dispatch } = makeInstance({
      "nova.enabled": true,
      "widgets.weather.enabled": true,
      showWeather: true,
    });

    inst.componentDidUpdate(
      makePrevProps({
        "nova.enabled": true,
        "widgets.weather.enabled": true,
        showWeather: false,
      })
    );

    expect(dispatch).not.toHaveBeenCalledWith(
      ac.SetPref("weather.optInDisplayed", true)
    );
  });
});
