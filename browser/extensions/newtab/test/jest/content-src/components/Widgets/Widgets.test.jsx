import { render, fireEvent } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { Widgets } from "content-src/components/Widgets/Widgets";
import { BaseContext } from "content-src/lib/BaseContext";

const ENABLED_STATE = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "widgets.enabled": true,
      "widgets.lists.enabled": true,
      "widgets.system.lists.enabled": true,
    },
  },
  ListsWidget: {
    selected: "list-1",
    lists: {
      "list-1": {
        label: "My List",
        tasks: [],
        completed: [],
      },
    },
  },
};

const LEGACY_WEATHER_FORECAST_STATE = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "nova.enabled": false,
      "widgets.enabled": true,
      "widgets.system.weatherForecast.enabled": true,
      "weather.display": "detailed",
      showWeather: true,
      "system.showWeather": true,
    },
  },
  Weather: {
    ...INITIAL_STATE.Weather,
    initialized: true,
  },
};

function renderWidgets(state) {
  const store = createStore(combineReducers(reducers), state);
  jest.spyOn(store, "dispatch");
  const { container } = render(
    <Provider store={store}>
      <Widgets />
    </Provider>
  );
  return { container, store };
}

describe("<Widgets>", () => {
  it("should not render without any enabled widgets", () => {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);
    const { container } = render(
      <Provider store={store}>
        <Widgets />
      </Provider>
    );
    expect(container.querySelector(".widgets-wrapper")).not.toBeInTheDocument();
  });

  it("should render when a widget is enabled", () => {
    const { container } = render(
      <WrapWithProvider state={ENABLED_STATE}>
        <Widgets />
      </WrapWithProvider>
    );
    expect(container.querySelector(".widgets-wrapper")).toBeInTheDocument();
  });
});

describe("<Widgets> hideAllWidgets legacy weather telemetry", () => {
  it("dispatches WIDGETS_ENABLED for weather when !novaEnabled && weatherForecastEnabled", () => {
    const { container, store } = renderWidgets(LEGACY_WEATHER_FORECAST_STATE);
    const hideAllButton = container.querySelector("#hide-all-widgets-button");
    expect(hideAllButton).toBeInTheDocument();

    fireEvent.click(hideAllButton);

    const dispatched = store.dispatch.mock.calls.map(([action]) => action);
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: at.WIDGETS_ENABLED,
        data: expect.objectContaining({
          widget_name: "weather",
          widget_source: "widget",
          enabled: false,
        }),
      })
    );
  });

  it("does not dispatch WIDGETS_ENABLED for weather when weatherForecastEnabled is false", () => {
    const state = {
      ...LEGACY_WEATHER_FORECAST_STATE,
      Prefs: {
        ...LEGACY_WEATHER_FORECAST_STATE.Prefs,
        values: {
          ...LEGACY_WEATHER_FORECAST_STATE.Prefs.values,
          "widgets.system.weatherForecast.enabled": false,
          "widgets.lists.enabled": true,
          "widgets.system.lists.enabled": true,
        },
      },
      ListsWidget: {
        selected: "list-1",
        lists: { "list-1": { label: "My List", tasks: [], completed: [] } },
      },
    };
    const { container, store } = renderWidgets(state);
    const hideAllButton = container.querySelector("#hide-all-widgets-button");
    expect(hideAllButton).toBeInTheDocument();

    fireEvent.click(hideAllButton);

    const dispatched = store.dispatch.mock.calls.map(([action]) => action);
    const weatherEnabledCalls = dispatched.filter(
      action =>
        action.type === at.WIDGETS_ENABLED &&
        action.data?.widget_name === "weather" &&
        action.data?.widget_source === "widget"
    );
    expect(weatherEnabledCalls).toHaveLength(0);
  });
});

describe("<Widgets> manage widgets menu item", () => {
  it("calls openWidgetsPanel and dispatches SHOW_PERSONALIZE when clicked", () => {
    const novaState = {
      ...ENABLED_STATE,
      Prefs: {
        ...ENABLED_STATE.Prefs,
        values: {
          ...ENABLED_STATE.Prefs.values,
          "nova.enabled": true,
        },
      },
    };
    const store = createStore(combineReducers(reducers), novaState);
    jest.spyOn(store, "dispatch");
    const openWidgetsPanel = jest.fn();
    const { container } = render(
      <Provider store={store}>
        <BaseContext.Provider value={{ openWidgetsPanel }}>
          <Widgets />
        </BaseContext.Provider>
      </Provider>
    );
    const manageItem = container.querySelector(
      "[data-l10n-id='newtab-widget-section-menu-manage']"
    );
    expect(manageItem).toBeInTheDocument();
    fireEvent.click(manageItem);
    expect(openWidgetsPanel).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.TELEMETRY_USER_EVENT,
        data: expect.objectContaining({ event: "SHOW_PERSONALIZE" }),
      })
    );
  });
});
