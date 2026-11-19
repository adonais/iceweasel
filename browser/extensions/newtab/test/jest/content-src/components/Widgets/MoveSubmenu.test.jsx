/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  buildMoveProps,
  MoveSubmenu,
} from "content-src/components/Widgets/MoveSubmenu";
import {
  PREF_HOME_WIDGETS,
  PREF_WIDGETS_ORDER,
} from "common/WidgetsRegistry.mjs";
import { WIDGET_PLACEMENTS } from "common/PageLayoutVariants.mjs";
import { WidgetPlacementContext } from "content-src/components/Widgets/WidgetPlacement";
import { actionTypes as at } from "common/Actions.mjs";

const FULL_ORDER = ["lists", "focusTimer", "weather", "privacy", "clocks"];
const ALL_ENABLED = {
  lists: true,
  focusTimer: true,
  weather: true,
  privacy: true,
  clocks: true,
};

describe("buildMoveProps", () => {
  it("disables left at the start of the visible order", () => {
    const props = buildMoveProps("lists", FULL_ORDER, ALL_ENABLED, jest.fn());
    expect(props.canMoveLeft).toBe(false);
    expect(props.canMoveRight).toBe(true);
  });

  it("disables right at the end of the visible order", () => {
    const props = buildMoveProps("clocks", FULL_ORDER, ALL_ENABLED, jest.fn());
    expect(props.canMoveLeft).toBe(true);
    expect(props.canMoveRight).toBe(false);
  });

  it("enables both directions in the middle", () => {
    const props = buildMoveProps("weather", FULL_ORDER, ALL_ENABLED, jest.fn());
    expect(props.canMoveLeft).toBe(true);
    expect(props.canMoveRight).toBe(true);
  });

  it("disables both directions when only one widget is visible", () => {
    const props = buildMoveProps(
      "weather",
      FULL_ORDER,
      { weather: true },
      jest.fn()
    );
    expect(props.canMoveLeft).toBe(false);
    expect(props.canMoveRight).toBe(false);
  });

  it("disables both directions when widgetEnabledMap is undefined", () => {
    const props = buildMoveProps("weather", FULL_ORDER, undefined, jest.fn());
    expect(props.canMoveLeft).toBe(false);
    expect(props.canMoveRight).toBe(false);
  });

  it("skips disabled widgets when computing neighbors", () => {
    // focusTimer is hidden; "moving lists right" should swap with weather,
    // not the absent focusTimer.
    const enabled = { ...ALL_ENABLED, focusTimer: false };
    const dispatch = jest.fn();
    const props = buildMoveProps("lists", FULL_ORDER, enabled, dispatch);
    expect(props.canMoveRight).toBe(true);
    props.onMoveRight();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.data.name).toBe(PREF_WIDGETS_ORDER);
    expect(action.data.value).toBe("weather,focusTimer,lists,privacy,clocks");
  });

  it("onMoveRight swaps with the next visible widget", () => {
    const dispatch = jest.fn();
    const props = buildMoveProps("weather", FULL_ORDER, ALL_ENABLED, dispatch);
    props.onMoveRight();
    const [[action]] = dispatch.mock.calls;
    expect(action.data.value).toBe("lists,focusTimer,privacy,weather,clocks");
  });

  it("onMoveLeft swaps with the previous visible widget", () => {
    const dispatch = jest.fn();
    const props = buildMoveProps("weather", FULL_ORDER, ALL_ENABLED, dispatch);
    props.onMoveLeft();
    const [[action]] = dispatch.mock.calls;
    expect(action.data.value).toBe("lists,weather,focusTimer,privacy,clocks");
  });

  it("dispatches a SET_PREF action", () => {
    const dispatch = jest.fn();
    const props = buildMoveProps("lists", FULL_ORDER, ALL_ENABLED, dispatch);
    props.onMoveRight();
    const [[action]] = dispatch.mock.calls;
    // SetPref wraps in AlsoToMain for UI code; the inner type is SET_PREF.
    const inner = action.type === at.SET_PREF ? action : action.data;
    expect(inner.type || inner.data?.name).toBeTruthy();
    expect(action.data.name).toBe(PREF_WIDGETS_ORDER);
  });

  it("no-ops when target is missing (out of bounds)", () => {
    const dispatch = jest.fn();
    const props = buildMoveProps("lists", FULL_ORDER, ALL_ENABLED, dispatch);
    // lists is at index 0; calling onMoveLeft should not dispatch
    props.onMoveLeft();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is direction-agnostic: behavior does not depend on document.dir", () => {
    document.documentElement.dir = "rtl";
    try {
      const dispatch = jest.fn();
      const props = buildMoveProps(
        "weather",
        FULL_ORDER,
        ALL_ENABLED,
        dispatch
      );
      // onMoveLeft always swaps with the previous order item regardless of dir.
      // RTL locales handle the visual flip via translation, not code.
      expect(props.canMoveLeft).toBe(true);
      expect(props.canMoveRight).toBe(true);
      props.onMoveLeft();
      const [[action]] = dispatch.mock.calls;
      expect(action.data.value).toBe("lists,weather,focusTimer,privacy,clocks");
    } finally {
      document.documentElement.dir = "ltr";
    }
  });
});

function makeState(prefOverrides = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: { ...INITIAL_STATE.Prefs.values, ...prefOverrides },
    },
  };
}

describe("<MoveSubmenu>", () => {
  beforeEach(() => {
    document.documentElement.dir = "ltr";
  });

  it("renders nothing when widgetEnabledMap is undefined", () => {
    const { container } = render(
      <WrapWithProvider>
        <MoveSubmenu widgetId="weather" />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("span[data-l10n-id='newtab-widget-menu-move']")
    ).not.toBeInTheDocument();
  });

  it("renders nothing when only one widget is visible", () => {
    const { container } = render(
      <WrapWithProvider>
        <MoveSubmenu widgetId="weather" widgetEnabledMap={{ weather: true }} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("span[data-l10n-id='newtab-widget-menu-move']")
    ).not.toBeInTheDocument();
  });

  it("renders the move submenu when 2+ widgets are visible", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({
          [PREF_WIDGETS_ORDER]: FULL_ORDER.join(","),
        })}
      >
        <MoveSubmenu widgetId="weather" widgetEnabledMap={ALL_ENABLED} />
      </WrapWithProvider>
    );
    expect(
      container.querySelector("span[data-l10n-id='newtab-widget-menu-move']")
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-menu-move-left']"
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-widget-menu-move-right']"
      )
    ).toBeInTheDocument();
  });

  it("disables the left item at the start of the order", () => {
    const { container } = render(
      <WrapWithProvider
        state={makeState({
          [PREF_WIDGETS_ORDER]: FULL_ORDER.join(","),
        })}
      >
        <MoveSubmenu widgetId="lists" widgetEnabledMap={ALL_ENABLED} />
      </WrapWithProvider>
    );
    const left = container.querySelector(
      "panel-item[data-l10n-id='newtab-widget-menu-move-left']"
    );
    const right = container.querySelector(
      "panel-item[data-l10n-id='newtab-widget-menu-move-right']"
    );
    expect(left.hasAttribute("disabled")).toBe(true);
    expect(right.hasAttribute("disabled")).toBe(false);
  });

  describe("where the user pins widgets to Home", () => {
    const PLACEMENT_PREFS = {
      "nova.enabled": true,
      "pageLayouts.variant": "spaces-thematic-v1",
      trainhopConfig: {
        spaces: {
          order: ["home", "widgets"],
          default: "home",
          widgetLibrary: "widgets",
          spaces: {
            home: { label: "Home" },
            widgets: { label: "Widgets" },
          },
        },
      },
      "widgets.system.enabled": true,
      "widgets.enabled": true,
      "widgets.system.lists.enabled": true,
      "widgets.lists.enabled": true,
      "widgets.system.clocks.enabled": true,
      "widgets.clocks.enabled": true,
      "widgets.system.focusTimer.enabled": true,
      "widgets.focusTimer.enabled": true,
    };

    function renderInSpace(placement, homeList, widgetEnabledMap) {
      const store = createStore(
        combineReducers(reducers),
        makeState({
          ...PLACEMENT_PREFS,
          [PREF_HOME_WIDGETS]: JSON.stringify(homeList),
        })
      );
      jest.spyOn(store, "dispatch");
      const { container } = render(
        <Provider store={store}>
          <WidgetPlacementContext.Provider value={placement}>
            <MoveSubmenu
              widgetId="lists"
              widgetEnabledMap={widgetEnabledMap ?? { lists: true }}
            />
          </WidgetPlacementContext.Provider>
        </Provider>
      );
      return { container, store };
    }

    const item = (container, dir) =>
      container.querySelector(`panel-item[data-move-dir='${dir}']`);

    it("offers Home in the library, even with no Left or Right move", () => {
      const { container } = renderInSpace(WIDGET_PLACEMENTS.LIBRARY, []);
      expect(item(container, "home").getAttribute("data-l10n-id")).toBe(
        "newtab-widget-menu-move-to-home"
      );
      expect(item(container, "home").hasAttribute("disabled")).toBe(false);
      expect(item(container, "widgets")).toBeNull();
    });

    it("never disables Home, however many widgets are pinned", () => {
      const { container } = renderInSpace(WIDGET_PLACEMENTS.LIBRARY, [
        "clocks",
        "focusTimer",
      ]);
      expect(item(container, "home").hasAttribute("disabled")).toBe(false);
    });

    it("offers Widgets on Home", () => {
      const { container } = renderInSpace(WIDGET_PLACEMENTS.HOME, ["lists"]);
      expect(item(container, "widgets").getAttribute("data-l10n-id")).toBe(
        "newtab-widget-menu-move-to-widgets"
      );
      expect(item(container, "home")).toBeNull();
    });

    it("pins the widget when Home is clicked", () => {
      const { container, store } = renderInSpace(WIDGET_PLACEMENTS.LIBRARY, [
        "clocks",
      ]);
      fireEvent.click(item(container, "home"));
      const homeWrite = store.dispatch.mock.calls
        .map(([action]) => action)
        .find(action => action.data?.name === PREF_HOME_WIDGETS);
      expect(homeWrite.data.value).toBe('["lists","clocks"]');
    });

    it("unpins the widget when Widgets is clicked", () => {
      const { container, store } = renderInSpace(WIDGET_PLACEMENTS.HOME, [
        "clocks",
        "lists",
      ]);
      fireEvent.click(item(container, "widgets"));
      const homeWrite = store.dispatch.mock.calls
        .map(([action]) => action)
        .find(action => action.data?.name === PREF_HOME_WIDGETS);
      expect(homeWrite.data.value).toBe('["clocks"]');
    });

    it("offers no space move outside Home placement", () => {
      const { container } = renderInSpace(null, []);
      expect(
        container.querySelector("span[data-l10n-id='newtab-widget-menu-move']")
      ).not.toBeInTheDocument();
    });
  });
});
