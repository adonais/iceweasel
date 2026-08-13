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

// Builds the minimum state needed to enable the listed widgets in nova
// mode at the given sizes. Each entry is [widgetId, size].
function makeNovaWidgetState(widgets, extraPrefs = {}) {
  const prefValues = {
    ...INITIAL_STATE.Prefs.values,
    "nova.enabled": true,
    "widgets.enabled": true,
    // Permissive defaults that let the weather widget pass its
    // `weatherData.initialized && showWeather && systemShowWeather`
    // gate when it's enabled by the test. Harmless when it isn't.
    showWeather: true,
    "system.showWeather": true,
    ...extraPrefs,
  };
  // Map widget IDs to their enabled/system/size pref names. Mirrors
  // WIDGET_REGISTRY so the test doesn't depend on registry internals.
  const widgetPrefs = {
    lists: {
      enabled: "widgets.lists.enabled",
      system: "widgets.system.lists.enabled",
      size: "widgets.lists.size",
    },
    focusTimer: {
      enabled: "widgets.focusTimer.enabled",
      system: "widgets.system.focusTimer.enabled",
      size: "widgets.focusTimer.size",
    },
    weather: {
      enabled: "widgets.weather.enabled",
      system: "widgets.system.weather.enabled",
      size: "widgets.weather.size",
    },
    sportsWidget: {
      enabled: "widgets.sportsWidget.enabled",
      system: "widgets.system.sportsWidget.enabled",
      size: "widgets.sportsWidget.size",
    },
    clocks: {
      enabled: "widgets.clocks.enabled",
      system: "widgets.system.clocks.enabled",
      size: "widgets.clocks.size",
    },
  };
  for (const [id, size] of widgets) {
    const prefs = widgetPrefs[id];
    prefValues[prefs.enabled] = true;
    prefValues[prefs.system] = true;
    prefValues[prefs.size] = size;
  }
  return {
    ...INITIAL_STATE,
    Prefs: { ...INITIAL_STATE.Prefs, values: prefValues },
    // ListsWidget needs a valid selected list to render
    ListsWidget: {
      selected: "list-1",
      lists: {
        "list-1": { label: "My List", tasks: [], completed: [] },
      },
    },
    // Weather only renders when initialized; mark it so it can be
    // counted toward widget positions when enabled.
    Weather: { ...INITIAL_STATE.Weather, initialized: true },
  };
}

describe("<Widgets> overflow detection", () => {
  function getSectionContainer(container) {
    return container.querySelector(".widgets-section-container");
  }

  it("sets no overflow attributes when only one widget is enabled", () => {
    const state = makeNovaWidgetState([["lists", "medium"]]);
    const { container } = renderWidgets(state);
    const section = getSectionContainer(container);
    expect(section.hasAttribute("data-overflow-1")).toBe(false);
    expect(section.hasAttribute("data-overflow-2")).toBe(false);
    expect(section.hasAttribute("data-overflow-3")).toBe(false);
    expect(section.hasAttribute("data-overflow-4")).toBe(false);
  });

  it("flags overflow-1 (but not -2) for two mediums", () => {
    const state = makeNovaWidgetState([
      ["lists", "medium"],
      ["focusTimer", "medium"],
    ]);
    const { container } = renderWidgets(state);
    const section = getSectionContainer(container);
    // One widget per card slot regardless of size, so 2 widgets overflow
    // a 1-card viewport but fit a 2-card viewport.
    expect(section.hasAttribute("data-overflow-1")).toBe(true);
    expect(section.hasAttribute("data-overflow-2")).toBe(false);
  });

  it("flags overflow-1 and -2 (but not -3) when three mediums are enabled", () => {
    const state = makeNovaWidgetState([
      ["lists", "medium"],
      ["focusTimer", "medium"],
      ["sportsWidget", "medium"],
    ]);
    const { container } = renderWidgets(state);
    const section = getSectionContainer(container);
    // 3 widgets need 3 card slots; overflows 1- and 2-card viewports.
    expect(section.hasAttribute("data-overflow-1")).toBe(true);
    expect(section.hasAttribute("data-overflow-2")).toBe(true);
    expect(section.hasAttribute("data-overflow-3")).toBe(false);
  });

  it("overflow detection is size-agnostic", () => {
    const state = makeNovaWidgetState([
      ["sportsWidget", "medium"],
      ["clocks", "medium"],
      ["lists", "medium"],
      ["focusTimer", "medium"],
      ["weather", "large"],
    ]);
    const { container } = renderWidgets(state);
    const section = getSectionContainer(container);
    // 5 widgets, one per slot, overflow every viewport up to 4 cards.
    expect(section.hasAttribute("data-overflow-4")).toBe(true);
  });

  it("flags overflow-3 (but not -4) for four widgets of mixed sizes", () => {
    const state = makeNovaWidgetState([
      ["lists", "large"],
      ["focusTimer", "medium"],
      ["weather", "medium"],
      ["sportsWidget", "medium"],
    ]);
    const { container } = renderWidgets(state);
    const section = getSectionContainer(container);
    // 4 widgets = 4 slots; overflows a 3-card viewport, fits a 4-card one.
    // Sizes don't affect the count.
    expect(section.hasAttribute("data-overflow-3")).toBe(true);
    expect(section.hasAttribute("data-overflow-4")).toBe(false);
  });
});

describe("<Widgets> row toggle", () => {
  function novaStateWith(rowExpanded) {
    return makeNovaWidgetState([["lists", "medium"]], {
      "widgets.row.expanded": rowExpanded,
    });
  }

  it("renders the toggle button when nova is enabled", () => {
    const { container } = renderWidgets(novaStateWith(false));
    expect(container.querySelector(".widgets-row-toggle")).toBeInTheDocument();
  });

  it("labels the toggle 'show more' when the row is collapsed", () => {
    const { container } = renderWidgets(novaStateWith(false));
    const toggle = container.querySelector(".widgets-row-toggle");
    expect(toggle.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-section-show-more"
    );
  });

  it("labels the toggle 'show less' when the row is expanded", () => {
    const { container } = renderWidgets(novaStateWith(true));
    const toggle = container.querySelector(".widgets-row-toggle");
    expect(toggle.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-section-show-less"
    );
  });

  it("click flips the pref and dispatches WIDGETS_CONTAINER_ACTION", () => {
    const { container, store } = renderWidgets(novaStateWith(false));
    fireEvent.click(container.querySelector(".widgets-row-toggle"));
    const dispatched = store.dispatch.mock.calls.map(([action]) => action);
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: at.SET_PREF,
        data: expect.objectContaining({
          name: "widgets.row.expanded",
          value: true,
        }),
      })
    );
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: at.WIDGETS_CONTAINER_ACTION,
        data: expect.objectContaining({ action_value: "expand_row" }),
      })
    );
  });
});

describe("<Widgets> maximize toggle", () => {
  // Nova is disabled, but the size toggle is still offered and only flips
  // widgets.maximized (no per-widget size prefs).
  const nonNovaState = (extra = {}) => ({
    ...ENABLED_STATE,
    Prefs: {
      ...ENABLED_STATE.Prefs,
      values: {
        ...ENABLED_STATE.Prefs.values,
        "nova.enabled": false,
        "widgets.system.maximized": true,
        "widgets.maximized": false,
        ...extra,
      },
    },
  });

  const dispatchedActions = store =>
    store.dispatch.mock.calls.map(([action]) => action);

  it("dispatches a single SET_MULTIPLE_PREFS instead of one SetPref per widget", () => {
    const state = makeNovaWidgetState(
      [
        ["lists", "medium"],
        ["focusTimer", "medium"],
      ],
      {
        "widgets.system.maximized": true,
        "widgets.maximized": false,
        "widgets.weather.size": "small",
      }
    );
    const { container, store } = renderWidgets(state);

    const sizeToggle = container.querySelector("#toggle-widgets-size-button");
    expect(sizeToggle).toBeInTheDocument();
    fireEvent.click(sizeToggle);

    const dispatched = dispatchedActions(store);

    const setPrefsCalls = dispatched.filter(
      a => a.type === at.SET_MULTIPLE_PREFS
    );
    expect(setPrefsCalls).toHaveLength(1);

    const { values } = setPrefsCalls[0].data;
    expect(values["widgets.maximized"]).toBe(true);
    expect(values["widgets.lists.size"]).toBe("large");
    expect(values["widgets.focusTimer.size"]).toBe("large");
    // A sidebar widget at "small" (weather) stays in the sidebar.
    expect(values["widgets.weather.size"]).toBeUndefined();

    // The resize no longer fans out into per-widget SetPref actions.
    const sizeSetPrefCalls = dispatched.filter(
      a => a.type === at.SET_PREF && /^widgets\..*\.size$/.test(a.data?.name)
    );
    expect(sizeSetPrefCalls).toHaveLength(0);

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: at.WIDGETS_CONTAINER_ACTION,
        data: expect.objectContaining({ action_value: "maximize_widgets" }),
      })
    );
  });

  it("sends non-small widgets to medium in one SET_MULTIPLE_PREFS when minimizing", () => {
    const state = makeNovaWidgetState(
      [
        ["lists", "large"],
        ["focusTimer", "large"],
      ],
      { "widgets.system.maximized": true, "widgets.maximized": true }
    );
    const { container, store } = renderWidgets(state);

    fireEvent.click(container.querySelector("#toggle-widgets-size-button"));

    const dispatched = dispatchedActions(store);
    const setPrefs = dispatched.find(a => a.type === at.SET_MULTIPLE_PREFS);
    expect(setPrefs.data.values["widgets.maximized"]).toBe(false);
    expect(setPrefs.data.values["widgets.lists.size"]).toBe("medium");
    expect(setPrefs.data.values["widgets.focusTimer.size"]).toBe("medium");
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: at.WIDGETS_CONTAINER_ACTION,
        data: expect.objectContaining({ action_value: "minimize_widgets" }),
      })
    );
  });

  it("does not include any size prefs when Nova is disabled", () => {
    const { container, store } = renderWidgets(nonNovaState());

    fireEvent.click(container.querySelector("#toggle-widgets-size-button"));

    const setPrefs = dispatchedActions(store).find(
      a => a.type === at.SET_MULTIPLE_PREFS
    );
    expect(setPrefs.data.values["widgets.maximized"]).toBe(true);
    const sizeKeys = Object.keys(setPrefs.data.values).filter(k =>
      k.endsWith(".size")
    );
    expect(sizeKeys).toHaveLength(0);
  });

  it("toggles via Enter and Space but ignores other keys", () => {
    const state = makeNovaWidgetState([["lists", "medium"]], {
      "widgets.system.maximized": true,
      "widgets.maximized": false,
    });
    const { container, store } = renderWidgets(state);
    const sizeToggle = container.querySelector("#toggle-widgets-size-button");

    fireEvent.keyDown(sizeToggle, { key: "a" });
    expect(
      dispatchedActions(store).some(a => a.type === at.SET_MULTIPLE_PREFS)
    ).toBe(false);

    fireEvent.keyDown(sizeToggle, { key: "Enter" });
    fireEvent.keyDown(sizeToggle, { key: " " });
    const setPrefsCalls = dispatchedActions(store).filter(
      a => a.type === at.SET_MULTIPLE_PREFS
    );
    expect(setPrefsCalls).toHaveLength(2);
    expect(setPrefsCalls[0].data.values["widgets.maximized"]).toBe(true);
  });
});

describe("<Widgets> row-collapsed attribute", () => {
  it("is set on the widgets container when nova is enabled and the row is not expanded", () => {
    const state = makeNovaWidgetState([["lists", "medium"]], {
      "widgets.row.expanded": false,
    });
    const { container } = renderWidgets(state);
    const widgetsContainer = container.querySelector("#widgets-container");
    expect(widgetsContainer.hasAttribute("data-row-collapsed")).toBe(true);
  });

  it("is not set when the row is expanded", () => {
    const state = makeNovaWidgetState([["lists", "medium"]], {
      "widgets.row.expanded": true,
    });
    const { container } = renderWidgets(state);
    const widgetsContainer = container.querySelector("#widgets-container");
    expect(widgetsContainer.hasAttribute("data-row-collapsed")).toBe(false);
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

describe("<Widgets> maximize toggle size sync", () => {
  // The size toggle button only renders when widgets may be maximized.
  const MAXIMIZABLE = { "widgets.system.maximized": true };

  // Collect the size prefs the maximize toggle batches into its single
  // SET_MULTIPLE_PREFS, shaped like the old per-widget SetPref actions for assertions.
  function sizePrefSets(store) {
    const setPrefs = store.dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action.type === at.SET_MULTIPLE_PREFS);
    const values = setPrefs?.data?.values ?? {};
    return Object.entries(values)
      .filter(([name]) => name.endsWith(".size"))
      .map(([name, value]) => ({ data: { name, value } }));
  }

  function clickMaximize(container) {
    fireEvent.click(container.querySelector("#toggle-widgets-size-button"));
  }

  it("resizes a small widget sitting in the row to large", () => {
    const state = makeNovaWidgetState(
      [
        ["lists", "medium"],
        ["clocks", "small"],
      ],
      MAXIMIZABLE
    );
    const { container, store } = renderWidgets(state);
    expect(
      container.querySelector("#toggle-widgets-size-button")
    ).toBeInTheDocument();

    clickMaximize(container);

    expect(sizePrefSets(store)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "widgets.clocks.size",
          value: "large",
        }),
      })
    );
  });

  it("sends a small in-row widget to medium when minimizing", () => {
    const state = makeNovaWidgetState([["clocks", "small"]], {
      ...MAXIMIZABLE,
      "widgets.maximized": true,
    });
    const { container, store } = renderWidgets(state);

    clickMaximize(container);

    expect(sizePrefSets(store)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "widgets.clocks.size",
          value: "medium",
        }),
      })
    );
  });

  it("skips a widget rendered in the sidebar (small + hasSidebar)", () => {
    const state = makeNovaWidgetState(
      [
        ["clocks", "medium"],
        ["weather", "small"],
      ],
      MAXIMIZABLE
    );
    const { container, store } = renderWidgets(state);

    clickMaximize(container);

    const weatherSets = sizePrefSets(store).filter(
      action => action.data.name === "widgets.weather.size"
    );
    expect(weatherSets).toHaveLength(0);
  });

  it("resizes weather when it is in the row (not small)", () => {
    const state = makeNovaWidgetState(
      [
        ["clocks", "medium"],
        ["weather", "medium"],
      ],
      MAXIMIZABLE
    );
    const { container, store } = renderWidgets(state);

    clickMaximize(container);

    expect(sizePrefSets(store)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "widgets.weather.size",
          value: "large",
        }),
      })
    );
  });

  it("resizes a disabled small in-row widget", () => {
    const state = makeNovaWidgetState([["lists", "medium"]], {
      ...MAXIMIZABLE,
      "widgets.system.clocks.enabled": true,
      "widgets.clocks.enabled": false,
      "widgets.clocks.size": "small",
    });
    const { container, store } = renderWidgets(state);

    clickMaximize(container);

    expect(sizePrefSets(store)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "widgets.clocks.size",
          value: "large",
        }),
      })
    );
  });
});
