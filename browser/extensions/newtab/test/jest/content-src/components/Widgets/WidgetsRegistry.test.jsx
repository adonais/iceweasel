/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  WIDGET_REGISTRY,
  getWidgetOrder,
  isWidgetEnabled,
  resolveWidgetSize,
  resolveWidgetOrder,
  resolveWidgetHasSidebar,
  PREF_WIDGETS_ORDER,
} from "common/WidgetsRegistry.mjs";

const registryIds = WIDGET_REGISTRY.map(w => w.id);

describe("getWidgetOrder", () => {
  it("returns registry default order when pref is empty", () => {
    expect(getWidgetOrder("")).toEqual(registryIds);
  });

  it("returns registry default order when pref is null/undefined", () => {
    expect(getWidgetOrder(null)).toEqual(registryIds);
    expect(getWidgetOrder(undefined)).toEqual(registryIds);
  });

  it("respects a fully-specified custom order", () => {
    expect(
      getWidgetOrder("focusTimer,lists,weather,sportsWidget,clocks")
    ).toEqual(["focusTimer", "lists", "weather", "sportsWidget", "clocks"]);
  });

  it("appends missing registry IDs after saved ones", () => {
    expect(getWidgetOrder("weather")).toEqual([
      "weather",
      "lists",
      "focusTimer",
      "sportsWidget",
      "clocks",
    ]);
  });

  it("filters out unknown IDs from the saved pref", () => {
    expect(getWidgetOrder("unknownWidget,lists,weather")).toEqual([
      "lists",
      "weather",
      "focusTimer",
      "sportsWidget",
      "clocks",
    ]);
  });

  it("handles partial order with only one ID", () => {
    const result = getWidgetOrder("focusTimer");
    expect(result[0]).toBe("focusTimer");
    expect(result.length).toBe(registryIds.length);
  });

  it("deduplicates repeated IDs in the saved pref", () => {
    const result = getWidgetOrder("focusTimer,focusTimer,lists");
    expect(result).toEqual([
      "focusTimer",
      "lists",
      "weather",
      "sportsWidget",
      "clocks",
    ]);
    expect(result.length).toBe(registryIds.length);
  });
});

describe("resolveWidgetOrder", () => {
  it("returns registry order when no user or trainhop order is set", () => {
    expect(resolveWidgetOrder({ [PREF_WIDGETS_ORDER]: "" })).toEqual(
      registryIds
    );
  });

  it("uses the user-saved order when set", () => {
    expect(
      resolveWidgetOrder({ [PREF_WIDGETS_ORDER]: "weather,lists,focusTimer" })
    ).toEqual(["weather", "lists", "focusTimer", "sportsWidget", "clocks"]);
  });

  it("uses trainhop order when no user order is saved", () => {
    expect(
      resolveWidgetOrder({
        [PREF_WIDGETS_ORDER]: "",
        trainhopConfig: { widgets: { order: "focusTimer,weather,lists" } },
      })
    ).toEqual(["focusTimer", "weather", "lists", "sportsWidget", "clocks"]);
  });

  it("user order takes precedence over trainhop order", () => {
    expect(
      resolveWidgetOrder({
        [PREF_WIDGETS_ORDER]: "lists,focusTimer,weather",
        trainhopConfig: { widgets: { order: "weather,lists,focusTimer" } },
      })
    ).toEqual(["lists", "focusTimer", "weather", "sportsWidget", "clocks"]);
  });
});

describe("isWidgetEnabled", () => {
  const listsWidget = WIDGET_REGISTRY.find(w => w.id === "lists");

  it("returns false when widgetsEnabled is false", () => {
    expect(
      isWidgetEnabled(
        listsWidget,
        {
          [listsWidget.enabledPref]: true,
          [listsWidget.systemEnabledPref]: true,
        },
        false
      )
    ).toBe(false);
  });

  it("returns true when system pref and user pref are both set", () => {
    expect(
      isWidgetEnabled(
        listsWidget,
        {
          [listsWidget.enabledPref]: true,
          [listsWidget.systemEnabledPref]: true,
        },
        true
      )
    ).toBe(true);
  });

  it("returns false when system pref is not set and no trainhop", () => {
    expect(
      isWidgetEnabled(
        listsWidget,
        {
          [listsWidget.enabledPref]: true,
          [listsWidget.systemEnabledPref]: false,
        },
        true
      )
    ).toBe(false);
  });

  it("returns false when user pref is disabled even if system is set", () => {
    expect(
      isWidgetEnabled(
        listsWidget,
        {
          [listsWidget.enabledPref]: false,
          [listsWidget.systemEnabledPref]: true,
        },
        true
      )
    ).toBe(false);
  });

  it("returns true when trainhop overrides the system gate", () => {
    expect(
      isWidgetEnabled(
        listsWidget,
        {
          [listsWidget.enabledPref]: true,
          [listsWidget.systemEnabledPref]: false,
          trainhopConfig: {
            widgets: { [listsWidget.trainhopEnabledKey]: true },
          },
        },
        true
      )
    ).toBe(true);
  });
});

describe("resolveWidgetSize", () => {
  const weatherWidget = WIDGET_REGISTRY.find(w => w.id === "weather");

  it("returns the user-set pref when non-empty", () => {
    expect(
      resolveWidgetSize(weatherWidget, { [weatherWidget.sizePref]: "large" })
    ).toBe("large");
  });

  it("falls back to defaultSize when pref is empty and no trainhop", () => {
    expect(
      resolveWidgetSize(weatherWidget, { [weatherWidget.sizePref]: "" })
    ).toBe(weatherWidget.defaultSize);
  });

  it("uses trainhop size suggestion when pref is empty", () => {
    expect(
      resolveWidgetSize(weatherWidget, {
        [weatherWidget.sizePref]: "",
        trainhopConfig: {
          widgets: { [weatherWidget.trainhopSizeKey]: "small" },
        },
      })
    ).toBe("small");
  });

  it("user pref wins over trainhop suggestion", () => {
    expect(
      resolveWidgetSize(weatherWidget, {
        [weatherWidget.sizePref]: "medium",
        trainhopConfig: {
          widgets: { [weatherWidget.trainhopSizeKey]: "large" },
        },
      })
    ).toBe("medium");
  });
});

describe("resolveWidgetHasSidebar", () => {
  const weatherWidget = WIDGET_REGISTRY.find(w => w.id === "weather");
  const listsWidget = WIDGET_REGISTRY.find(w => w.id === "lists");

  it("returns the static hasSidebar value when no trainhop key is defined", () => {
    expect(resolveWidgetHasSidebar(listsWidget, {})).toBe(false);
  });

  it("returns the static hasSidebar value when trainhop key is not present in prefs", () => {
    expect(resolveWidgetHasSidebar(weatherWidget, {})).toBe(true);
  });

  it("returns the trainhop override when present", () => {
    expect(
      resolveWidgetHasSidebar(weatherWidget, {
        trainhopConfig: {
          widgets: { [weatherWidget.trainhopSidebarKey]: false },
        },
      })
    ).toBe(false);
  });

  it("trainhop can force sidebar on for a widget with hasSidebar: true", () => {
    expect(
      resolveWidgetHasSidebar(weatherWidget, {
        trainhopConfig: {
          widgets: { [weatherWidget.trainhopSidebarKey]: true },
        },
      })
    ).toBe(true);
  });
});
