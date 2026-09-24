/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetToggleVisible,
  isWidgetsContainerVisible,
} from "resource://newtab/common/WidgetsRegistry.mjs";

export const PREFERENCES_LOADED_EVENT = "home-pane-loaded";
export const PREFERENCES_LOADED_EVENT_SUBPANE = "customHomepage-pane-loaded";

// These "section" objects are formatted in a way to be similar to the ones from
// SectionsManager to construct the preferences view.
// @nova-cleanup(remove-conditional): Remove novaEnabled check; hardcode feed: "widgets.weather.enabled" and shouldHidePref using widgets.system.weather.enabled; convert function body back to arrow returning array literal
const PREFS_FOR_SETTINGS = () => {
  const novaEnabled = Services.prefs.getBoolPref(
    "browser.newtabpage.activity-stream.nova.enabled",
    false
  );
  return [
    {
      id: "web-search",
      pref: {
        feed: "showSearch",
        titleString: "home-prefs-search-header",
      },
    },
    {
      id: "weather",
      pref: {
        feed: novaEnabled ? "widgets.weather.enabled" : "showWeather",
        titleString: "home-prefs-weather-header",
        descString: "home-prefs-weather-description",
        learnMore: {
          link: {
            href: "https://support.mozilla.org/kb/customize-items-on-firefox-new-tab-page",
            id: "home-prefs-weather-learn-more-link",
          },
        },
      },
      eventSource: "WEATHER",
      shouldHidePref: !Services.prefs.getBoolPref(
        novaEnabled
          ? "browser.newtabpage.activity-stream.widgets.system.weather.enabled"
          : "browser.newtabpage.activity-stream.system.showWeather",
        false
      ),
    },
    {
      id: "topsites",
      pref: {
        feed: "feeds.topsites",
        titleString: "home-prefs-shortcuts-header",
        descString: "home-prefs-shortcuts-description",
      },
      maxRows: 4,
      rowsPref: "topSitesRows",
      eventSource: "TOP_SITES",
    },
    {
      id: "topstories",
      pref: {
        feed: "feeds.section.topstories",
        titleString: {
          id: "home-prefs-recommended-by-header-generic",
        },
        descString: {
          id: "home-prefs-recommended-by-description-generic",
        },
      },
      shouldHidePref: !Services.prefs.getBoolPref(
        "browser.newtabpage.activity-stream.feeds.system.topstories",
        true
      ),
      eventSource: "TOP_STORIES",
    },
  ];
};

export class AboutPreferences {
  init() {
    Services.obs.addObserver(this, PREFERENCES_LOADED_EVENT);
    Services.obs.addObserver(this, PREFERENCES_LOADED_EVENT_SUBPANE);
  }

  uninit() {
    Services.obs.removeObserver(this, PREFERENCES_LOADED_EVENT);
    Services.obs.removeObserver(this, PREFERENCES_LOADED_EVENT_SUBPANE);
  }

  onAction(action) {
    switch (action.type) {
      case at.INIT:
        this.init();
        break;
      case at.UNINIT:
        this.uninit();
        break;
      case at.SETTINGS_OPEN:
        action._target.window.openPreferences("paneHome");
        break;
      // This is used to open the web extension settings page for an extension
      case at.OPEN_WEBEXT_SETTINGS:
        action._target.window.BrowserAddonUI.openAddonsMgr(
          `addons://detail/${encodeURIComponent(action.data)}`
        );
        break;
      // Open the about:addons themes list (from the New Tab theme picker).
      case at.OPEN_ABOUT_ADDONS_THEMES:
        action._target.window.BrowserAddonUI.openAddonsMgr(
          "addons://list/theme"
        );
        break;
    }
  }

  setupUserEvent(element, eventSource) {
    element.addEventListener("command", e => {
      const { checked } = e.target;
      if (typeof checked === "boolean") {
        this.store.dispatch(
          ac.UserEvent({
            event: "PREF_CHANGED",
            source: eventSource,
            value: { status: checked, menu_source: "ABOUT_PREFERENCES" },
          })
        );
      }
    });
  }

  observe(window) {
    if (Services.prefs.getBoolPref("browser.settings-redesign.enabled")) {
      const { SettingGroupManager } = window;

      window.MozXULElement.insertFTLIfNeeded("browser/newtab/newtab.ftl");

      // newtab listens for home-pane-loaded because it owns the `home` group
      // (Firefox Home content). The `homepage` and `customHomepage` groups are
      // registered by components/preferences, not here.

      // We observe 2 signals that about:settings is loading - the
      // PREFERENCES_LOADED_EVENT and PREFERENCES_LOADED_EVENT_SUBPANE
      // observer notifications. The first is fired anytime about:settings
      // is loaded directly. The second (and not the first) fires if loading
      // about:preferences#customHomepage. We handle those cases by observing
      // both, and checking to see if the "home" settings group was already
      // registered. If so, we take that as a sign that we don't need to
      // re-register and we return early.
      try {
        if (SettingGroupManager.get("home")) {
          // The home group has already been registered for this load of
          // about:settings, so no need to do it again. Return early.
          return;
        }
      } catch (e) {
        // We didn't find the home settings group registered. That's okay,
        // we'll register the group(s) now - that's what we're here for.
      }

      this._registerPreferences(window);

      SettingGroupManager.registerGroups({
        home: this._setupHomeGroup(window),
      });
      return;
    }

    // Legacy settings UI
    const { document, Preferences } = window;

    // Extract just the "Recent activity" pref info from SectionsManager as we have everything else already
    const highlights = this.store
      .getState()
      .Sections.find(el => el.id === "highlights");

    const allSections = [...PREFS_FOR_SETTINGS(), highlights];

    // Render the preferences
    allSections.forEach(pref => {
      this.renderPreferenceSection(pref, document, Preferences);
    });

    // Update the visibility of the Restore Defaults button based on checked prefs
    this.toggleRestoreDefaults(window.gHomePane);
  }

  /** @param {Window} window */
  _registerPreferences(window) {
    const { Preferences } = window;

    Preferences.addAll([
      { id: "browser.newtabpage.activity-stream.showSearch", type: "bool" },
      {
        id: "browser.newtabpage.activity-stream.hideLogo",
        type: "bool",
        inverted: true,
      },
      { 
        id: "iceweasel.externalWallpapers.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.system.showWeather",
        type: "bool",
      },
      { id: "browser.newtabpage.activity-stream.showWeather", type: "bool" },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.weather.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.weather.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.lists.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.lists.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.focusTimer.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.focusTimer.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.sportsWidget.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.sportsWidget.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.clocks.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.clocks.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.privacy.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.privacy.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.crossword.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.crossword.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.stocks.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.stocks.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.pictureOfTheDay.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.pictureOfTheDay.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.system.recentSearches.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.widgets.recentSearches.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.feeds.topsites",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.topSitesRows",
        type: "int",
      },
      {
        id: "browser.newtabpage.activity-stream.feeds.system.topstories",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.feeds.section.topstories",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.discoverystream.sections.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.discoverystream.topicLabels.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.discoverystream.sections.personalization.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.discoverystream.sections.customizeMenuPanel.enabled",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.showSponsoredCheckboxes",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.showSponsoredTopSites",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.showSponsored",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.feeds.section.highlights",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.section.highlights.rows",
        type: "int",
      },
      {
        id: "browser.newtabpage.activity-stream.section.highlights.includeVisited",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.section.highlights.includeBookmarks",
        type: "bool",
      },
      {
        id: "browser.newtabpage.activity-stream.section.highlights.includeDownloads",
        type: "bool",
      },
    ]);
  }

  /** @param {Window} window */
  // eslint-disable-next-line max-statements
  _setupHomeGroup(window) {
    const { Preferences } = window;

    // A widget toggle is shown when its system pref is on OR a trainhop (Nimbus)
    // config enables it. The system-pref half reads the live dep value so the
    // toggle reacts to pref changes without a page refresh; the trainhopConfig
    // half is a snapshot (Nimbus sets it at load, it doesn't change live). The
    // dep id matches the registry trainhopEnabledKey by convention.
    const widgetPrefs = this.store.getState()?.Prefs?.values ?? {};
    const widgetToggleVisible = registryId => {
      const widget = WIDGET_REGISTRY.find(w => w.id === registryId);
      // Resolve via the shared registry helper, but feed the LIVE system-pref
      // value from deps so the toggle still reacts to about:config changes
      // without a page refresh; the trainhop/widgetsSettings terms are a snapshot.
      return deps =>
        isWidgetToggleVisible(widget, {
          ...widgetPrefs,
          [widget.systemEnabledPref]: deps[widget.trainhopEnabledKey]?.value,
        });
    };

    // Build-time snapshot of whether the Widgets container is shown, used only
    // to decide Weather's placement in the items list below. The Widgets group's
    // own visibility is resolved reactively inline.
    const widgetsSystemEnabled = isWidgetsContainerVisible(widgetPrefs);

    // The Firefox Home section should be disabled when neither "New windows"
    // nor "New tabs" is set to Firefox Home.
    const firefoxHomeDeps = ["homepageNewWindows", "homepageNewTabs"];
    const firefoxHomeActive = ({ homepageNewWindows, homepageNewTabs }) =>
      homepageNewWindows.value === "home" || homepageNewTabs.value === "home";

    const HOME_CUSTOMIZE_URL = "about:home#customize";
    const HOME_CUSTOMIZE_TOPICS_URL = "about:home#customize-topics";

    // Open in a new tab if "New tabs" is Firefox Home, else a new window.
    const dispatchForHomeLink = ({ homepageNewTabs }) =>
      homepageNewTabs.value === "home" ? "tab" : "window";

    Preferences.addSetting({
      id: "firefoxHomeDisabledNotice",
      deps: firefoxHomeDeps,
      visible: deps => !firefoxHomeActive(deps),
    });

    // @nova-cleanup(remove-conditional): Remove this lookup and inline `true` at every novaEnabled check below.
    const novaEnabled = Services.prefs.getBoolPref(
      "browser.newtabpage.activity-stream.nova.enabled",
      false
    );

    // hideLogo only affects rendering when Nova is enabled (see Base.jsx),
    // so the toggle is registered only in that branch.
    if (novaEnabled) {
      Preferences.addSetting({
        id: "firefoxLogo",
        pref: "browser.newtabpage.activity-stream.hideLogo",
        deps: firefoxHomeDeps,
        disabled: deps => !firefoxHomeActive(deps),
      });
    }

    Preferences.addSetting({
      id: "iceweaselExternalWallpapers",
      pref: "iceweasel.externalWallpapers.enabled",
    });

    // Search
    Preferences.addSetting({
      id: "webSearch",
      pref: "browser.newtabpage.activity-stream.showSearch",
      deps: firefoxHomeDeps,
      disabled: deps => !firefoxHomeActive(deps),
    });

    // Weather
    // @nova-cleanup(remove-conditional): Remove novaEnabled check and else branch; keep only the Nova registration block (weatherEnabled + weather addSetting calls)
    if (novaEnabled) {
      Preferences.addSetting({
        id: "weatherEnabled",
        pref: "browser.newtabpage.activity-stream.widgets.system.weather.enabled",
      });

      Preferences.addSetting({
        id: "weather",
        pref: "browser.newtabpage.activity-stream.widgets.weather.enabled",
        deps: ["weatherEnabled", ...firefoxHomeDeps],
        visible: widgetToggleVisible("weather"),
        disabled: deps => !firefoxHomeActive(deps),
      });
    } else {
      Preferences.addSetting({
        id: "showWeather",
        pref: "browser.newtabpage.activity-stream.system.showWeather",
      });

      Preferences.addSetting({
        id: "weather",
        pref: "browser.newtabpage.activity-stream.showWeather",
        deps: ["showWeather", ...firefoxHomeDeps],
        visible: ({ showWeather }) => showWeather.value,
        disabled: deps => !firefoxHomeActive(deps),
      });
    }

    // Widgets: general
    Preferences.addSetting({
      id: "widgetsEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.enabled",
    });

    Preferences.addSetting({
      id: "widgets",
      pref: "browser.newtabpage.activity-stream.widgets.enabled",
      deps: ["widgetsEnabled", ...firefoxHomeDeps],
      visible: ({ widgetsEnabled }) =>
        isWidgetsContainerVisible({
          ...widgetPrefs,
          "widgets.system.enabled": widgetsEnabled.value,
        }),
      disabled: deps => !firefoxHomeActive(deps),
    });

    // Widgets: lists
    Preferences.addSetting({
      id: "listsEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.lists.enabled",
    });

    Preferences.addSetting({
      id: "lists",
      pref: "browser.newtabpage.activity-stream.widgets.lists.enabled",
      deps: ["listsEnabled"],
      visible: widgetToggleVisible("lists"),
    });

    // Widgets: timer
    Preferences.addSetting({
      id: "timerEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.focusTimer.enabled",
    });

    Preferences.addSetting({
      id: "timer",
      pref: "browser.newtabpage.activity-stream.widgets.focusTimer.enabled",
      deps: ["timerEnabled"],
      visible: widgetToggleVisible("focusTimer"),
    });

    // Widgets: sports
    Preferences.addSetting({
      id: "sportsWidgetEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.sportsWidget.enabled",
    });

    Preferences.addSetting({
      id: "sportsWidget",
      pref: "browser.newtabpage.activity-stream.widgets.sportsWidget.enabled",
      deps: ["sportsWidgetEnabled"],
      visible: widgetToggleVisible("sportsWidget"),
    });

    Preferences.addSetting({
      id: "clocksEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.clocks.enabled",
    });

    Preferences.addSetting({
      id: "clocks",
      pref: "browser.newtabpage.activity-stream.widgets.clocks.enabled",
      deps: ["clocksEnabled"],
      visible: widgetToggleVisible("clocks"),
    });

    Preferences.addSetting({
      id: "privacyEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.privacy.enabled",
    });

    Preferences.addSetting({
      id: "privacy",
      pref: "browser.newtabpage.activity-stream.widgets.privacy.enabled",
      deps: ["privacyEnabled"],
      visible: widgetToggleVisible("privacy"),
    });

    Preferences.addSetting({
      id: "crosswordEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.crossword.enabled",
    });

    Preferences.addSetting({
      id: "crossword",
      pref: "browser.newtabpage.activity-stream.widgets.crossword.enabled",
      deps: ["crosswordEnabled"],
      visible: widgetToggleVisible("crossword"),
    });

    Preferences.addSetting({
      id: "stocksEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.stocks.enabled",
    });

    Preferences.addSetting({
      id: "stocks",
      pref: "browser.newtabpage.activity-stream.widgets.stocks.enabled",
      deps: ["stocksEnabled"],
      visible: widgetToggleVisible("stocks"),
    });

    Preferences.addSetting({
      id: "pictureOfTheDayEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.pictureOfTheDay.enabled",
    });

    Preferences.addSetting({
      id: "pictureOfTheDay",
      pref: "browser.newtabpage.activity-stream.widgets.pictureOfTheDay.enabled",
      deps: ["pictureOfTheDayEnabled"],
      visible: widgetToggleVisible("pictureOfTheDay"),
    });

    Preferences.addSetting({
      id: "recentSearchesEnabled",
      pref: "browser.newtabpage.activity-stream.widgets.system.recentSearches.enabled",
    });

    Preferences.addSetting({
      id: "recentSearches",
      pref: "browser.newtabpage.activity-stream.widgets.recentSearches.enabled",
      deps: ["recentSearchesEnabled"],
      visible: widgetToggleVisible("recentSearches"),
    });

    // Shortcuts
    Preferences.addSetting({
      id: "shortcuts",
      pref: "browser.newtabpage.activity-stream.feeds.topsites",
      deps: firefoxHomeDeps,
      disabled: deps => !firefoxHomeActive(deps),
    });
    Preferences.addSetting({
      id: "shortcutsRows",
      pref: "browser.newtabpage.activity-stream.topSitesRows",
    });

    // Dependency prefs for stories & sponsored stories visibility
    Preferences.addSetting({
      id: "systemTopstories",
      pref: "browser.newtabpage.activity-stream.feeds.system.topstories",
    });

    // Stories
    Preferences.addSetting({
      id: "stories",
      pref: "browser.newtabpage.activity-stream.feeds.section.topstories",
      deps: ["systemTopstories", ...firefoxHomeDeps],
      visible: ({ systemTopstories }) => systemTopstories.value,
      disabled: deps => !firefoxHomeActive(deps),
    });

    // Dependencies for "manage topics" checkbox
    Preferences.addSetting({
      id: "sectionsEnabled",
      pref: "browser.newtabpage.activity-stream.discoverystream.sections.enabled",
    });
    Preferences.addSetting({
      id: "topicLabelsEnabled",
      pref: "browser.newtabpage.activity-stream.discoverystream.topicLabels.enabled",
    });
    Preferences.addSetting({
      id: "sectionsPersonalizationEnabled",
      pref: "browser.newtabpage.activity-stream.discoverystream.sections.personalization.enabled",
    });
    Preferences.addSetting({
      id: "sectionsCustomizeMenuPanelEnabled",
      pref: "browser.newtabpage.activity-stream.discoverystream.sections.customizeMenuPanel.enabled",
    });

    Preferences.addSetting({
      id: "manageTopics",
      deps: [
        "sectionsEnabled",
        "sectionsPersonalizationEnabled",
        "sectionsCustomizeMenuPanelEnabled",
        "stories",
        ...firefoxHomeDeps,
      ],
      visible: deps => {
        const {
          sectionsEnabled,
          sectionsPersonalizationEnabled,
          sectionsCustomizeMenuPanelEnabled,
          stories,
        } = deps;
        return (
          firefoxHomeActive(deps) &&
          sectionsEnabled.value &&
          sectionsPersonalizationEnabled.value &&
          sectionsCustomizeMenuPanelEnabled.value &&
          stories.value
        );
      },
      onUserClick: (e, deps) => {
        e.preventDefault();
        window.openTrustedLinkIn(
          HOME_CUSTOMIZE_TOPICS_URL,
          dispatchForHomeLink(deps)
        );
      },
    });

    // Recent activity
    Preferences.addSetting({
      id: "recentActivity",
      pref: "browser.newtabpage.activity-stream.feeds.section.highlights",
      deps: firefoxHomeDeps,
      disabled: deps => !firefoxHomeActive(deps),
    });
    Preferences.addSetting({
      id: "recentActivityRows",
      pref: "browser.newtabpage.activity-stream.section.highlights.rows",
    });
    Preferences.addSetting({
      id: "recentActivityVisited",
      pref: "browser.newtabpage.activity-stream.section.highlights.includeVisited",
    });
    Preferences.addSetting({
      id: "recentActivityBookmarks",
      pref: "browser.newtabpage.activity-stream.section.highlights.includeBookmarks",
    });
    Preferences.addSetting({
      id: "recentActivityDownloads",
      pref: "browser.newtabpage.activity-stream.section.highlights.includeDownloads",
    });

    // Hidden when Firefox Home is off — the wallpaper page only applies when
    // Firefox Home is the active destination for new windows or new tabs.
    Preferences.addSetting({
      id: "chooseWallpaper",
      deps: firefoxHomeDeps,
      visible: deps => firefoxHomeActive(deps),
      onUserClick: (e, deps) => {
        e.preventDefault();
        window.openTrustedLinkIn(HOME_CUSTOMIZE_URL, dispatchForHomeLink(deps));
      },
    });

    // Base shape used when Weather is nested inside the Widgets group, where it
    // matches its sibling widget checkboxes (no explicit control). The
    // standalone row below adds control: "moz-toggle" to render as a top-level
    // toggle like the other Firefox Home rows.
    const weatherItem = {
      id: "weather",
      subcategory: "weather",
      l10nId: "home-prefs-weather-header-srd",
    };

    return {
      inProgress: true,
      headingLevel: 2,
      l10nId: "home-prefs-content-header",
      iconSrc: "chrome://browser/skin/home.svg",
      subcategory: "contents",
      items: [
        {
          id: "firefoxHomeDisabledNotice",
          control: "moz-message-bar",
          l10nId: "home-prefs-firefox-home-disabled-notice",
          controlAttrs: {
            type: "info",
          },
        },
        {
          id: "webSearch",
          subcategory: "web-search",
          l10nId: "home-prefs-search-header2",
          control: "moz-toggle",
        },
        // Weather nests inside the Widgets group only when that group is shown
        // (Nova + the resolved widgets container gate, the same gate the group's
        // visibility uses). When the container is off but weather is
        // independently enabled (the current default), keep Weather as its own
        // row so it stays reachable.
        ...(novaEnabled && widgetsSystemEnabled
          ? []
          : [{ ...weatherItem, control: "moz-toggle" }]),
        {
          id: "widgets",
          l10nId: "home-prefs-widgets-header",
          control: "moz-toggle",
          // Bug 2046503: this hardcoded widget list should be generated
          // dynamically from WIDGET_REGISTRY (WidgetsRegistry.mjs) so new
          // widgets appear here automatically.
          items: [
            {
              id: "lists",
              l10nId: "home-prefs-lists-header",
            },
            {
              id: "timer",
              l10nId: "home-prefs-timer-header",
            },
            {
              id: "sportsWidget",
              l10nId: "home-prefs-sports-widget-header",
            },
            {
              id: "clocks",
              l10nId: "home-prefs-clocks-header",
            },
            {
              id: "privacy",
              l10nId: "home-prefs-privacy-header",
            },
            {
              id: "crossword",
              l10nId: "home-prefs-crossword-widget-header",
            },
            {
              id: "stocks",
              l10nId: "home-prefs-stocks-header",
            },
            {
              id: "pictureOfTheDay",
              l10nId: "home-prefs-picture-header",
            },
            {
              id: "recentSearches",
              l10nId: "home-prefs-recent-searches-header",
            },
            ...(novaEnabled && widgetsSystemEnabled ? [weatherItem] : []),
          ],
        },
        {
          id: "shortcuts",
          subcategory: "topsites",
          l10nId: "home-prefs-shortcuts-header-srd",
          control: "moz-toggle",
          items: [
            {
              id: "shortcutsRows",
              l10nId: "home-prefs-shortcuts-select",
              control: "moz-select",
              options: [
                {
                  value: 1,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 1 },
                },
                {
                  value: 2,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 2 },
                },
                {
                  value: 3,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 3 },
                },
                {
                  value: 4,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 4 },
                },
              ],
            },
          ],
        },
        {
          id: "stories",
          subcategory: "topstories",
          l10nId: "home-prefs-stories-header2",
          control: "moz-toggle",
          items: [
            {
              id: "manageTopics",
              l10nId: "home-prefs-manage-topics-link2",
              control: "moz-box-link",
              controlAttrs: {
                href: HOME_CUSTOMIZE_TOPICS_URL,
              },
            },
          ],
        },
        {
          id: "recentActivity",
          subcategory: "highlights",
          l10nId: "home-prefs-recent-activity-header-srd",
          control: "moz-toggle",
          items: [
            {
              id: "recentActivityRows",
              l10nId: "home-prefs-recent-activity-select",
              control: "moz-select",
              options: [
                {
                  value: 1,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 1 },
                },
                {
                  value: 2,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 2 },
                },
                {
                  value: 3,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 3 },
                },
                {
                  value: 4,
                  l10nId: "home-prefs-sections-rows-option-srd",
                  l10nArgs: { num: 4 },
                },
              ],
            },
            {
              id: "recentActivityVisited",
              l10nId: "home-prefs-highlights-option-visited-pages-srd",
            },
            {
              id: "recentActivityBookmarks",
              l10nId: "home-prefs-highlights-options-bookmarks-srd",
            },
            {
              id: "recentActivityDownloads",
              l10nId: "home-prefs-highlights-option-most-recent-download-srd",
            },
          ],
        },
       {
         id: "iceweaselExternalWallpapers",
         l10nId: "iceweasel-external-wallpapers",
         control: "moz-toggle",
       },
        {
          id: "chooseWallpaper",
          l10nId: "home-prefs-choose-wallpaper-link2",
          control: "moz-box-link",
          controlAttrs: {
            href: HOME_CUSTOMIZE_URL,
          },
          iconSrc: "chrome://browser/skin/customize.svg",
        },
        ...(novaEnabled
          ? [
              {
                id: "firefoxLogo",
                l10nId: "home-prefs-firefox-logo-header",
                control: "moz-toggle",
              },
            ]
          : []),
      ],
    };
  }

  /**
   * Render a single preference with all the details, e.g. description, links,
   * more granular preferences.
   *
   * @param sectionData
   * @param document
   * @param Preferences
   */

  /**
   * We can remove this eslint exception once the Settings redesign is complete.
   * In fact, we can probably remove this entire method. When removing, also
   * drop the `pref:` blocks on the `highlights` and `topstories` sections in
   * SectionsManager.sys.mjs — they exist only to feed this renderer.
   */
  // eslint-disable-next-line max-statements
  renderPreferenceSection(sectionData, document, Preferences) {
    /* Do not render old-style settings if new settings UI is enabled - this is needed to avoid
     * registering prefs twice and ensuing errors */
    if (Services.prefs.getBoolPref("browser.settings-redesign.enabled")) {
      return;
    }

    const {
      id,
      pref: prefData,
      maxRows,
      rowsPref,
      shouldHidePref,
      eventSource,
    } = sectionData;
    const {
      feed: name,
      titleString = {},
      descString,
      nestedPrefs = [],
    } = prefData || {};

    // Helper to link a UI element to a preference for updating
    const linkPref = (element, prefName, type) => {
      const fullPref = `browser.newtabpage.activity-stream.${prefName}`;
      element.setAttribute("preference", fullPref);
      Preferences.add({ id: fullPref, type });

      // Prevent changing the UI if the preference can't be changed
      element.disabled = Preferences.get(fullPref).locked;
    };

    // Don't show any sections that we don't want to expose in preferences UI
    if (shouldHidePref) {
      return;
    }

    // Add the main preference for turning on/off a section
    const sectionVbox = document.getElementById(id);
    if (!sectionVbox) {
      console.log("%s is null", id);
      return;
    }
    sectionVbox.setAttribute("data-subcategory", id);
    const checkbox = this.createAppend(document, "checkbox", sectionVbox);
    checkbox.classList.add("section-checkbox");
    // Set up a user event if we have an event source for this pref.
    if (eventSource) {
      this.setupUserEvent(checkbox, eventSource);
    }
    document.l10n.setAttributes(
      checkbox,
      this.getString(titleString),
      titleString.values
    );

    linkPref(checkbox, name, "bool");

    // Specially add a link for Weather
    if (id === "weather") {
      const hboxWithLink = this.createAppend(document, "hbox", sectionVbox);
      hboxWithLink.appendChild(checkbox);
      checkbox.classList.add("tail-with-learn-more");

      const link = this.createAppend(document, "label", hboxWithLink, {
        is: "text-link",
      });
      link.setAttribute("href", sectionData.pref.learnMore.link.href);
      document.l10n.setAttributes(link, sectionData.pref.learnMore.link.id);
    }

    // Add more details for the section (e.g., description, more prefs)
    const detailVbox = this.createAppend(document, "vbox", sectionVbox);
    detailVbox.classList.add("indent");
    if (descString) {
      const description = this.createAppend(
        document,
        "description",
        detailVbox
      );
      description.classList.add("text-deemphasized");
      document.l10n.setAttributes(
        description,
        this.getString(descString),
        descString.values
      );

      // Add a rows dropdown if we have a pref to control and a maximum
      if (rowsPref && maxRows) {
        const detailHbox = this.createAppend(document, "hbox", detailVbox);
        detailHbox.setAttribute("align", "center");
        description.setAttribute("flex", 1);
        detailHbox.appendChild(description);

        // Add box so the search tooltip is positioned correctly
        const tooltipBox = this.createAppend(document, "hbox", detailHbox);

        // Add appropriate number of localized entries to the dropdown
        const menulist = this.createAppend(document, "menulist", tooltipBox);
        menulist.setAttribute("crop", "none");
        const menupopup = this.createAppend(document, "menupopup", menulist);
        for (let num = 1; num <= maxRows; num++) {
          const item = this.createAppend(document, "menuitem", menupopup);
          document.l10n.setAttributes(item, "home-prefs-sections-rows-option", {
            num,
          });
          item.setAttribute("value", num);
        }
        linkPref(menulist, rowsPref, "int");
      }
    }

    const subChecks = [];
    const fullName = `browser.newtabpage.activity-stream.${sectionData.pref.feed}`;
    const pref = Preferences.get(fullName);

    // Add a checkbox pref for any nested preferences
    nestedPrefs.forEach(nested => {
      if (nested.shouldHidePref !== true) {
        const subcheck = this.createAppend(document, "checkbox", detailVbox);
        // Set up a user event if we have an event source for this pref.
        if (nested.eventSource) {
          this.setupUserEvent(subcheck, nested.eventSource);
        }
        document.l10n.setAttributes(subcheck, nested.titleString);

        linkPref(subcheck, nested.name, "bool");

        subChecks.push(subcheck);
        subcheck.disabled = !pref._value;
        if (nested.shouldDisablePref) {
          subcheck.disabled = nested.shouldDisablePref;
        }
        subcheck.hidden = nested.hidden;
      }
    });

    pref.on("change", () => {
      subChecks.forEach(subcheck => {
        // Disable any nested checkboxes if the parent pref is not enabled.
        subcheck.disabled = !pref._value;
      });
    });
  }

  /**
   * Update the visibility of the Restore Defaults button based on checked prefs.
   *
   * @param gHomePane
   */
  toggleRestoreDefaults(gHomePane) {
    gHomePane.toggleRestoreDefaultsBtn();
  }

  /**
   * A helper function to append XUL elements on the page.
   *
   * @param document
   * @param tag
   * @param parent
   * @param options
   */
  createAppend(document, tag, parent, options = {}) {
    return parent.appendChild(document.createXULElement(tag, options));
  }

  /**
   * Helper to get fluentIDs sometimes encase in an object
   *
   * @param message
   * @returns string
   */
  getString(message) {
    return typeof message !== "object" ? message : message.id;
  }
}
