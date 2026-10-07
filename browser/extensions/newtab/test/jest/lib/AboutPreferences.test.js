/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  AboutPreferences,
  PREFERENCES_LOADED_EVENT,
  PREFERENCES_LOADED_EVENT_SUBPANE,
} from "lib/AboutPreferences.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { WIDGET_REGISTRY } from "common/WidgetsRegistry.mjs";
import { mockServices, stubGlobals } from "test/jest/test-utils";

describe("AboutPreferences Feed", () => {
  let restoreGlobals;
  let fakeServices;
  let instance;

  // sinon's `.withArgs(pref, false).returns(value)` becomes a lookup table:
  // any pref that isn't listed reads back as undefined.
  const setBoolPrefs = prefs => {
    fakeServices.prefs.getBoolPref.mockImplementation(pref => prefs[pref]);
  };

  const PREF_BRANCH = "browser.newtabpage.activity-stream.";
  const prefsWidgets = () => WIDGET_REGISTRY.filter(w => !w.retired);

  // Only the fields the about:preferences code and isWidgetToggleVisible read.
  const FIXTURE_WIDGET = {
    id: "fixtureWidget",
    prefsL10nId: "home-prefs-fixture-header",
    enabledPref: "widgets.fixtureWidget.enabled",
    systemEnabledPref: "widgets.system.fixtureWidget.enabled",
    trainhopEnabledKey: "fixtureWidgetEnabled",
    widgetsSettingsVisibleKey: "fixtureWidgetVisible",
    trainhopNamespace: null,
  };

  // Literal en-US labels; a missing key stands for a missing message.
  const PREFS_LABELS = {
    "home-prefs-clocks-header": "Clock",
    "home-prefs-crossword-widget-header": "Crossword",
    "home-prefs-lists-header": "Lists",
    "home-prefs-picture-header": "Picture of the day",
    "home-prefs-privacy-header": "Privacy",
    "home-prefs-search-widget-header": "Search",
    "home-prefs-stocks-header": "Stocks",
    "home-prefs-timer-header": "Timer",
    "home-prefs-weather-header-srd": "Weather",
    "home-prefs-fixture-header": "Fixture widget",
  };

  // The German, Greek and Japanese labels are Firefox's own translations,
  // apart from the fixture widget's and the Japanese Search label.
  // Übersicht sorts before Uhr only under locale-aware collation; a code
  // point comparison would put it after Wetter.
  const GERMAN_PREFS_LABELS = {
    "home-prefs-stocks-header": "Aktien",
    "home-prefs-picture-header": "Bild des Tages",
    "home-prefs-privacy-header": "Datenschutz",
    "home-prefs-crossword-widget-header": "Kreuzworträtsel",
    "home-prefs-lists-header": "Listen",
    "home-prefs-search-widget-header": "Suche",
    "home-prefs-timer-header": "Timer",
    "home-prefs-fixture-header": "Übersicht",
    "home-prefs-clocks-header": "Uhr",
    "home-prefs-weather-header-srd": "Wetter",
  };

  const GREEK_PREFS_LABELS = {
    "home-prefs-search-widget-header": "Αναζήτηση",
    "home-prefs-timer-header": "Αντίστροφη μέτρηση",
    "home-prefs-privacy-header": "Απόρρητο",
    "home-prefs-picture-header": "Εικόνα της ημέρας",
    "home-prefs-weather-header-srd": "Καιρός",
    "home-prefs-lists-header": "Λίστες",
    "home-prefs-stocks-header": "Μετοχές",
    "home-prefs-clocks-header": "Ρολόι",
    "home-prefs-crossword-widget-header": "Σταυρόλεξο",
  };

  // Latin letters sort before kana and kana before kanji under the default
  // collation; the kanji follow radical and stroke order.
  const JAPANESE_PREFS_LABELS = {
    "home-prefs-lists-header": "ToDo リスト",
    "home-prefs-crossword-widget-header": "クロスワードパズル",
    "home-prefs-timer-header": "タイマー",
    "home-prefs-privacy-header": "プライバシー",
    "home-prefs-picture-header": "今日の一枚",
    "home-prefs-search-widget-header": "最近の検索",
    "home-prefs-weather-header-srd": "天気予報",
    "home-prefs-clocks-header": "時計",
    "home-prefs-stocks-header": "株価情報",
  };

  // Expected orders are written by hand so the tests do not mirror the sort.
  const EN_US_ORDER = [
    "clocks",
    "crossword",
    "lists",
    "pictureOfTheDay",
    "privacy",
    "recentSearches",
    "stocks",
    "focusTimer",
    "weather",
  ];

  const GERMAN_ORDER = [
    "stocks",
    "pictureOfTheDay",
    "privacy",
    "crossword",
    "lists",
    "recentSearches",
    "focusTimer",
    "fixtureWidget",
    "clocks",
    "weather",
  ];

  const GREEK_ORDER = [
    "recentSearches",
    "focusTimer",
    "privacy",
    "pictureOfTheDay",
    "weather",
    "lists",
    "stocks",
    "clocks",
    "crossword",
  ];

  const JAPANESE_ORDER = [
    "lists",
    "crossword",
    "focusTimer",
    "privacy",
    "pictureOfTheDay",
    "recentSearches",
    "weather",
    "clocks",
    "stocks",
  ];

  // The order when every widget sorts under its own id.
  const ID_ORDER = [
    "clocks",
    "crossword",
    "focusTimer",
    "lists",
    "pictureOfTheDay",
    "privacy",
    "recentSearches",
    "stocks",
    "weather",
  ];

  // Pushed onto the real registry so tests can prove a new entry needs no
  // source change.
  const pushedFixtures = [];
  const withFixtureWidget = (overrides = {}) => {
    const widget = { ...FIXTURE_WIDGET, ...overrides };
    WIDGET_REGISTRY.push(widget);
    pushedFixtures.push(widget);
    return widget;
  };

  beforeEach(() => {
    instance = new AboutPreferences();
    instance.store = {
      getState: () => ({}),
    };
    fakeServices = mockServices(["obs", "prefs"]);
    restoreGlobals = stubGlobals({
      Services: fakeServices,
    });
  });
  afterEach(() => {
    for (const widget of pushedFixtures.splice(0)) {
      const index = WIDGET_REGISTRY.indexOf(widget);
      if (index !== -1) {
        WIDGET_REGISTRY.splice(index, 1);
      }
    }
    restoreGlobals();
    jest.restoreAllMocks();
  });

  describe("#onAction", () => {
    it("should call .init() on an INIT action", () => {
      const stub = jest.spyOn(instance, "init").mockImplementation(() => {});

      instance.onAction({ type: at.INIT });

      expect(stub).toHaveBeenCalledTimes(1);
    });
    it("should call .uninit() on an UNINIT action", () => {
      const stub = jest.spyOn(instance, "uninit").mockImplementation(() => {});

      instance.onAction({ type: at.UNINIT });

      expect(stub).toHaveBeenCalledTimes(1);
    });
    it("should call .openPreferences on SETTINGS_OPEN", () => {
      const action = {
        type: at.SETTINGS_OPEN,
        _target: {
          window: { openPreferences: jest.fn() },
        },
      };
      instance.onAction(action);
      expect(action._target.window.openPreferences).toHaveBeenCalledTimes(1);
    });
    it("should call .BrowserAddonUI.openAddonsMgr with the extension id on OPEN_WEBEXT_SETTINGS", () => {
      const action = {
        type: at.OPEN_WEBEXT_SETTINGS,
        data: "foo",
        _target: {
          window: {
            BrowserAddonUI: { openAddonsMgr: jest.fn() },
          },
        },
      };
      instance.onAction(action);
      expect(
        action._target.window.BrowserAddonUI.openAddonsMgr
      ).toHaveBeenCalledWith("addons://detail/foo");
    });
  });

  describe("#observe", () => {
    let restoreObserveGlobals;
    let registerGroups;
    let getSettingGroup;
    let insertFTLIfNeeded;

    beforeEach(() => {
      registerGroups = jest.fn();
      let homeCalls = 0;
      getSettingGroup = jest.fn(group => {
        if (group !== "home") {
          return undefined;
        }
        homeCalls += 1;
        if (homeCalls === 1) {
          throw new Error("Not yet registered");
        }
        return true;
      });
      insertFTLIfNeeded = jest.fn();
      restoreObserveGlobals = stubGlobals({
        SettingGroupManager: {
          registerGroups,
          get: getSettingGroup,
        },
        MozXULElement: { insertFTLIfNeeded },
      });
      jest.spyOn(instance, "_registerPreferences").mockImplementation();
      jest.spyOn(instance, "_setupHomeGroup").mockReturnValue({});
    });

    afterEach(() => {
      restoreObserveGlobals();
    });

    it("should watch for about:preferences loading", () => {
      instance.init();

      expect(fakeServices.obs.addObserver).toHaveBeenCalledTimes(2);
      expect(fakeServices.obs.addObserver).toHaveBeenCalledWith(
        instance,
        PREFERENCES_LOADED_EVENT
      );
      expect(fakeServices.obs.addObserver).toHaveBeenCalledWith(
        instance,
        PREFERENCES_LOADED_EVENT_SUBPANE
      );
    });
    it("should stop watching on uninit", () => {
      instance.uninit();

      expect(fakeServices.obs.removeObserver).toHaveBeenCalledTimes(2);
      expect(fakeServices.obs.removeObserver).toHaveBeenCalledWith(
        instance,
        PREFERENCES_LOADED_EVENT
      );
      expect(fakeServices.obs.removeObserver).toHaveBeenCalledWith(
        instance,
        PREFERENCES_LOADED_EVENT_SUBPANE
      );
    });
    it("should register newtab.ftl with the preferences document", () => {
      instance.observe(window);

      expect(insertFTLIfNeeded).toHaveBeenCalledWith(
        "browser/newtab/newtab.ftl"
      );
    });

    it("should call registerGroups with home only", async () => {
      // homepage/customHomepage are owned by components/preferences.
      await instance.observe(window);

      expect(registerGroups).toHaveBeenCalledTimes(1);
      const [[groups]] = registerGroups.mock.calls;
      expect(Object.keys(groups)).toEqual(["home"]);
      expect(groups).not.toHaveProperty("homepage");
      expect(groups).not.toHaveProperty("customHomepage");
    });

    it("should not register a second time when observe fires again for the same window", async () => {
      await instance.observe(window, PREFERENCES_LOADED_EVENT);
      await instance.observe(window, PREFERENCES_LOADED_EVENT_SUBPANE);

      expect(instance._registerPreferences).toHaveBeenCalledTimes(1);
      expect(registerGroups).toHaveBeenCalledTimes(1);
    });
  });

  describe("#_registerPreferences", () => {
    it("should call Preferences.addAll once with all pref ids", () => {
      const addAll = jest.fn();

      instance._registerPreferences({ Preferences: { addAll } });

      expect(addAll).toHaveBeenCalledTimes(1);
      // Spot-check prefs from the beginning, middle, and end of the list.
      const [[prefs]] = addAll.mock.calls;
      expect(Array.isArray(prefs)).toBe(true);
      expect(
        prefs.some(
          p => p.id === "browser.newtabpage.activity-stream.showSearch"
        )
      ).toBe(true);
      expect(
        prefs.some(
          p => p.id === "browser.newtabpage.activity-stream.feeds.topsites"
        )
      ).toBe(true);
      expect(
        prefs.some(
          p =>
            p.id ===
            "browser.newtabpage.activity-stream.section.highlights.includeVisited"
        )
      ).toBe(true);
      expect(
        prefs.some(
          p =>
            p.id === "browser.newtabpage.activity-stream.hideLogo" &&
            p.type === "bool" &&
            p.inverted === true
        )
      ).toBe(true);
    });

    it("registers both prefs for every non-retired widget", () => {
      const addAll = jest.fn();

      instance._registerPreferences({ Preferences: { addAll } });

      const [[prefs]] = addAll.mock.calls;
      for (const widget of WIDGET_REGISTRY.filter(w => !w.retired)) {
        expect(prefs).toContainEqual({
          id: PREF_BRANCH + widget.systemEnabledPref,
          type: "bool",
        });
        expect(prefs).toContainEqual({
          id: PREF_BRANCH + widget.enabledPref,
          type: "bool",
        });
      }
    });

    it("registers every pref id once", () => {
      const addAll = jest.fn();

      instance._registerPreferences({ Preferences: { addAll } });

      const [[prefs]] = addAll.mock.calls;
      const ids = prefs.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("registers prefs for a new registry entry without a source change", () => {
      withFixtureWidget();
      const addAll = jest.fn();

      instance._registerPreferences({ Preferences: { addAll } });

      const [[prefs]] = addAll.mock.calls;
      expect(prefs).toContainEqual({
        id: `${PREF_BRANCH}widgets.system.fixtureWidget.enabled`,
        type: "bool",
      });
      expect(prefs).toContainEqual({
        id: `${PREF_BRANCH}widgets.fixtureWidget.enabled`,
        type: "bool",
      });
    });

    it("registers no prefs for a retired widget", () => {
      withFixtureWidget({ retired: true });
      const addAll = jest.fn();

      instance._registerPreferences({ Preferences: { addAll } });

      const [[prefs]] = addAll.mock.calls;
      expect(prefs.some(p => p.id.includes("fixtureWidget"))).toBe(false);
    });
  });

  describe("#_setupHomeGroup", () => {
    let addSetting;
    let Preferences;
    // Fluent id to label for this test; a missing key means no such message.
    let labels;
    let localizationCalls;
    let restoreL10nGlobals;

    beforeEach(() => {
      addSetting = jest.fn();
      Preferences = { addSetting };
      labels = { ...PREFS_LABELS };
      localizationCalls = [];
      restoreL10nGlobals = stubGlobals({
        Localization: class {
          constructor(resourceIds, sync) {
            localizationCalls.push([resourceIds, sync]);
          }
          formatMessagesSync(keys) {
            return keys.map(({ id }) =>
              id in labels
                ? {
                    value: null,
                    attributes: [{ name: "label", value: labels[id] }],
                  }
                : null
            );
          }
        },
      });
    });

    afterEach(() => {
      restoreL10nGlobals();
    });

    const findSetting = id => {
      const call = addSetting.mock.calls.find(([s]) => s.id === id);
      if (!call) {
        throw new Error(`no setting registered with id "${id}"`);
      }
      return call[0];
    };

    it("should register weather against showWeather prefs when Nova is disabled", () => {
      setBoolPrefs({
        "browser.newtabpage.activity-stream.nova.enabled": false,
      });

      instance._setupHomeGroup({ Preferences });

      const calls = addSetting.mock.calls.map(([{ id, pref }]) => ({
        id,
        pref,
      }));
      expect(
        calls.some(
          c =>
            c.id === "weatherStandalone" &&
            c.pref === "browser.newtabpage.activity-stream.showWeather"
        )
      ).toBe(true);
    });

    it("should register weather against widgets.weather.enabled when Nova is enabled", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });

      instance._setupHomeGroup({ Preferences });

      const calls = addSetting.mock.calls.map(([{ id, pref }]) => ({
        id,
        pref,
      }));
      expect(
        calls.some(
          c =>
            c.id === "weatherStandalone" &&
            c.pref ===
              "browser.newtabpage.activity-stream.widgets.weather.enabled"
        )
      ).toBe(true);
      expect(
        calls.some(
          c => c.pref === "browser.newtabpage.activity-stream.showWeather"
        )
      ).toBe(false);
      expect(findSetting("weatherStandalone").deps).toEqual([
        "weatherEnabled",
        "homepageNewWindows",
        "homepageNewTabs",
      ]);
    });

    it("shows a widget toggle when the widget is enabled via trainhopConfig even if its system pref is off", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({
        Prefs: {
          values: { trainhopConfig: { widgets: { listsEnabled: true } } },
        },
      });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("lists").visible({ listsEnabled: { value: false } })
      ).toBe(true);
    });

    it("shows a widget toggle when its system pref is on (read live from deps)", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({ Prefs: { values: {} } });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("lists").visible({ listsEnabled: { value: true } })
      ).toBe(true);
    });

    it("hides a widget toggle when neither the system pref nor trainhopConfig enable it", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({ Prefs: { values: {} } });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("lists").visible({ listsEnabled: { value: false } })
      ).toBe(false);
    });

    it("shows a widget toggle when revealed via widgetsSettings even if its system pref is off", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({
        Prefs: {
          values: {
            trainhopConfig: { widgetsSettings: { listsVisible: true } },
          },
        },
      });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("lists").visible({ listsEnabled: { value: false } })
      ).toBe(true);
    });

    it("shows the widgets group when the container is enabled via trainhopConfig even if the system pref is off", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({
        Prefs: { values: { trainhopConfig: { widgets: { enabled: true } } } },
      });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("widgets").visible({ widgetsEnabled: { value: false } })
      ).toBe(true);
    });

    it("shows the widgets group when the container system pref is on (read live from deps)", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({ Prefs: { values: {} } });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("widgets").visible({ widgetsEnabled: { value: true } })
      ).toBe(true);
    });

    it("hides the widgets group when neither the system pref nor trainhopConfig enable the container", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({ Prefs: { values: {} } });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("widgets").visible({ widgetsEnabled: { value: false } })
      ).toBe(false);
    });

    it("shows the widgets group when revealed via widgetsSettings even if the system pref is off", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({
        Prefs: {
          values: { trainhopConfig: { widgetsSettings: { enabled: true } } },
        },
      });

      instance._setupHomeGroup({ Preferences });

      expect(
        findSetting("widgets").visible({ widgetsEnabled: { value: false } })
      ).toBe(true);
    });

    it("nests the weather toggle inside the widgets group when Nova and the widgets system pref are enabled", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      expect(
        group.items.find(i => i.id === "weatherStandalone")
      ).toBeUndefined();
      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(EN_US_ORDER);
      expect(widgets.items.find(i => i.id === "weather").subcategory).toBe(
        "weather"
      );
    });

    it("nests the weather toggle inside the widgets group when the container is enabled via trainhopConfig", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { trainhopConfig: { widgets: { enabled: true } } } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      const nestedWeather = widgets.items.find(i => i.id === "weather");
      expect(nestedWeather).toBeDefined();
      // Nested under Widgets, Weather is a checkbox like its siblings.
      expect(nestedWeather).not.toHaveProperty("control");
    });

    it("keeps the weather toggle standalone when Nova is enabled but the widgets system pref is off", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: {
          values: {
            "widgets.system.enabled": false,
            "widgets.system.weather.enabled": true,
          },
        },
      });

      const group = instance._setupHomeGroup({ Preferences });

      expect(group.items.some(i => i.id === "weatherStandalone")).toBe(true);
      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.some(i => i.id === "weather")).toBe(false);
    });

    it("keeps the weather toggle as a standalone row when Nova is disabled", () => {
      setBoolPrefs({
        "browser.newtabpage.activity-stream.nova.enabled": false,
      });

      const group = instance._setupHomeGroup({ Preferences });

      const standaloneWeather = group.items.find(
        i => i.id === "weatherStandalone"
      );
      expect(standaloneWeather).toBeDefined();
      // Standalone, Weather is a top-level toggle like the other rows.
      expect(standaloneWeather.control).toBe("moz-toggle");
      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.some(i => i.id === "weather")).toBe(false);
    });

    it("registers a settings pair for every non-retired widget", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);

      instance._setupHomeGroup({ Preferences });

      for (const widget of prefsWidgets()) {
        const systemSetting = findSetting(widget.trainhopEnabledKey);
        expect(systemSetting.pref).toBe(PREF_BRANCH + widget.systemEnabledPref);
        const userSetting = findSetting(widget.id);
        expect(userSetting.pref).toBe(PREF_BRANCH + widget.enabledPref);
        expect(userSetting.deps).toEqual([widget.trainhopEnabledKey]);
        expect(typeof userSetting.visible).toBe("function");
        expect(userSetting).not.toHaveProperty("disabled");
      }
    });

    it("registers every setting id once with Nova on and off", () => {
      for (const novaEnabled of [false, true]) {
        setBoolPrefs({
          "browser.newtabpage.activity-stream.nova.enabled": novaEnabled,
        });
        addSetting.mockClear();

        instance._setupHomeGroup({ Preferences });

        const ids = addSetting.mock.calls.map(([s]) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it("lists one item per non-retired widget, A-Z by label", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      // With Nova off, Weather keeps its own row.
      expect(widgets.items).toEqual([
        { id: "clocks", l10nId: "home-prefs-clocks-header" },
        { id: "crossword", l10nId: "home-prefs-crossword-widget-header" },
        { id: "lists", l10nId: "home-prefs-lists-header" },
        { id: "pictureOfTheDay", l10nId: "home-prefs-picture-header" },
        { id: "privacy", l10nId: "home-prefs-privacy-header" },
        { id: "recentSearches", l10nId: "home-prefs-search-widget-header" },
        { id: "stocks", l10nId: "home-prefs-stocks-header" },
        { id: "focusTimer", l10nId: "home-prefs-timer-header" },
      ]);
    });

    it("registers nothing for a retired widget", () => {
      const retired = withFixtureWidget({ retired: true });
      fakeServices.prefs.getBoolPref.mockReturnValue(false);

      const group = instance._setupHomeGroup({ Preferences });

      expect(
        addSetting.mock.calls.some(
          ([s]) => s.id === retired.id || s.id === retired.trainhopEnabledKey
        )
      ).toBe(false);
      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.some(i => i.id === retired.id)).toBe(false);
    });

    it("adds a toggle for a new registry entry without a source change", () => {
      withFixtureWidget();
      fakeServices.prefs.getBoolPref.mockReturnValue(false);
      instance.store.getState = () => ({ Prefs: { values: {} } });

      const group = instance._setupHomeGroup({ Preferences });

      expect(findSetting("fixtureWidgetEnabled").pref).toBe(
        `${PREF_BRANCH}widgets.system.fixtureWidget.enabled`
      );
      const setting = findSetting("fixtureWidget");
      expect(setting.pref).toBe(`${PREF_BRANCH}widgets.fixtureWidget.enabled`);
      expect(setting.visible({ fixtureWidgetEnabled: { value: true } })).toBe(
        true
      );
      expect(setting.visible({ fixtureWidgetEnabled: { value: false } })).toBe(
        false
      );
      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items).toContainEqual({
        id: "fixtureWidget",
        l10nId: "home-prefs-fixture-header",
      });
    });

    it("reads the standalone weather label from the registry", () => {
      const weatherWidget = WIDGET_REGISTRY.find(w => w.id === "weather");
      jest.replaceProperty(
        weatherWidget,
        "prefsL10nId",
        "home-prefs-weather-test"
      );
      setBoolPrefs({
        "browser.newtabpage.activity-stream.nova.enabled": false,
      });

      const group = instance._setupHomeGroup({ Preferences });

      const standalone = group.items.find(i => i.id === "weatherStandalone");
      expect(standalone.l10nId).toBe("home-prefs-weather-test");
      expect(standalone.subcategory).toBe("weather");
    });

    it("shows a toggle revealed via its trainhop namespace with the system pref off", () => {
      fakeServices.prefs.getBoolPref.mockReturnValue(false);

      for (const id of ["pictureOfTheDay", "crossword"]) {
        const widget = WIDGET_REGISTRY.find(w => w.id === id);
        instance.store.getState = () => ({
          Prefs: {
            values: {
              trainhopConfig: { [widget.trainhopNamespace]: { visible: true } },
            },
          },
        });
        addSetting.mockClear();

        instance._setupHomeGroup({ Preferences });

        expect(
          findSetting(id).visible({
            [widget.trainhopEnabledKey]: { value: false },
          })
        ).toBe(true);
      }
    });

    it("disables the widgets group and standalone weather when Firefox Home is not in use", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": false } },
      });

      instance._setupHomeGroup({ Preferences });

      const homeOff = {
        homepageNewWindows: { value: "blank" },
        homepageNewTabs: { value: "blank" },
      };
      const homeOn = {
        homepageNewWindows: { value: "home" },
        homepageNewTabs: { value: "blank" },
      };
      expect(findSetting("widgets").disabled(homeOff)).toBe(true);
      expect(findSetting("widgets").disabled(homeOn)).toBe(false);
      expect(findSetting("weatherStandalone").disabled(homeOff)).toBe(true);
      expect(findSetting("weatherStandalone").disabled(homeOn)).toBe(false);
    });

    it("builds a sync newtab.ftl Localization on each call", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });

      instance._setupHomeGroup({ Preferences });
      instance._setupHomeGroup({ Preferences });

      expect(localizationCalls).toEqual([
        [["browser/newtab/newtab.ftl"], true],
        [["browser/newtab/newtab.ftl"], true],
      ]);
    });

    it("orders the group A-Z by German label, umlaut included", () => {
      labels = { ...GERMAN_PREFS_LABELS };
      withFixtureWidget();
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(GERMAN_ORDER);
    });

    it("orders the group A-Z by Greek label, Weather among its peers", () => {
      labels = { ...GREEK_PREFS_LABELS };
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(GREEK_ORDER);
      expect(widgets.items.map(i => i.id).indexOf("weather")).toBe(4);
    });

    it("orders the group by Japanese label, Latin before kana before kanji", () => {
      labels = { ...JAPANESE_PREFS_LABELS };
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(JAPANESE_ORDER);
    });

    it("keeps a reduced set sorted when only some widgets are available", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      // visible() reads the system pref from deps, so availability is set
      // there.
      const available = [
        "focusTimer",
        "pictureOfTheDay",
        "recentSearches",
        "weather",
      ];
      const deps = Object.fromEntries(
        prefsWidgets().map(w => [
          w.trainhopEnabledKey,
          { value: available.includes(w.id) },
        ])
      );
      const widgets = group.items.find(i => i.id === "widgets");
      const shown = widgets.items.filter(i => findSetting(i.id).visible(deps));

      expect(shown.map(i => i.id)).toEqual([
        "pictureOfTheDay",
        "recentSearches",
        "focusTimer",
        "weather",
      ]);
    });

    it("keeps the same order whatever the user has switched on", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: {
          values: {
            "widgets.system.enabled": true,
            "widgets.focusTimer.enabled": true,
            "widgets.weather.enabled": true,
          },
        },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(EN_US_ORDER);
    });

    it("gives two consecutive builds the same order", () => {
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const groupIds = () =>
        instance
          ._setupHomeGroup({ Preferences })
          .items.find(i => i.id === "widgets")
          .items.map(i => i.id);

      expect(groupIds()).toEqual(groupIds());
      expect(groupIds()).toEqual(EN_US_ORDER);
    });

    it("sorts a widget whose label has no message under its id", () => {
      delete labels["home-prefs-timer-header"];
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });

      const widgets = group.items.find(i => i.id === "widgets");
      // "focusTimer" as a sort key lands third, which happens to be ID_ORDER.
      expect(widgets.items.map(i => i.id)).toEqual(ID_ORDER);
    });

    it("still builds the group, sorted by id, when the label lookup throws", () => {
      const restoreThrowing = stubGlobals({
        Localization: class {
          formatMessagesSync() {
            throw new Error("no messages");
          }
        },
      });
      setBoolPrefs({ "browser.newtabpage.activity-stream.nova.enabled": true });
      instance.store.getState = () => ({
        Prefs: { values: { "widgets.system.enabled": true } },
      });

      const group = instance._setupHomeGroup({ Preferences });
      restoreThrowing();

      const widgets = group.items.find(i => i.id === "widgets");
      expect(widgets.items.map(i => i.id)).toEqual(ID_ORDER);
    });
  });
});
