/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionTypes as at } from "resource://newtab/common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetToggleVisible,
  isWidgetsContainerVisible,
} from "resource://newtab/common/WidgetsRegistry.mjs";

const ACTIVITY_STREAM_PREF_BRANCH = "browser.newtabpage.activity-stream.";

export const PREFERENCES_LOADED_EVENT = "home-pane-loaded";
export const PREFERENCES_LOADED_EVENT_SUBPANE = "customHomepage-pane-loaded";

/**
 * Returns the about:preferences toggle label of each widget by widget id, so
 * the Widgets group can be ordered by what the user reads. A label that does
 * not resolve maps to its widget id.
 *
 * @param {{ id: string, prefsL10nId: string }[]} widgets
 * @returns {Map<string, string>}
 */
function widgetLabels(widgets) {
  let messages = [];
  try {
    const strings = new Localization(["browser/newtab/newtab.ftl"], true);
    messages = strings.formatMessagesSync(
      widgets.map(w => ({ id: w.prefsL10nId }))
    );
  } catch (e) {
    // formatMessagesSync can throw; the pane still builds, sorted by id.
  }
  return new Map(
    widgets.map((w, i) => [
      w.id,
      messages[i]?.attributes?.find(attr => attr.name === "label")?.value ||
        w.id,
    ])
  );
}

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

  observe(window) {
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
      ...WIDGET_REGISTRY.filter(w => !w.retired).flatMap(w => [
        { id: ACTIVITY_STREAM_PREF_BRANCH + w.systemEnabledPref, type: "bool" },
        { id: ACTIVITY_STREAM_PREF_BRANCH + w.enabledPref, type: "bool" },
      ]),
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
    // dep id is the same as the registry trainhopEnabledKey.
    const widgetPrefs = this.store.getState()?.Prefs?.values ?? {};
    const widgetToggleVisible = widget => deps =>
      isWidgetToggleVisible(widget, {
        ...widgetPrefs,
        [widget.systemEnabledPref]: deps[widget.trainhopEnabledKey]?.value,
      });

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

    // Widgets: one settings pair per registry entry.
    const prefsWidgets = WIDGET_REGISTRY.filter(w => !w.retired);
    for (const widget of prefsWidgets) {
      Preferences.addSetting({
        id: widget.trainhopEnabledKey,
        pref: ACTIVITY_STREAM_PREF_BRANCH + widget.systemEnabledPref,
      });

      Preferences.addSetting({
        id: widget.id,
        pref: ACTIVITY_STREAM_PREF_BRANCH + widget.enabledPref,
        deps: [widget.trainhopEnabledKey],
        visible: widgetToggleVisible(widget),
      });
    }

    // Weather's own top-level row, used when it is not nested in the Widgets group.
    // @nova-cleanup(remove-conditional): Remove novaEnabled check and else branch; keep only the Nova registration block.
    const weatherWidget = WIDGET_REGISTRY.find(w => w.id === "weather");
    if (novaEnabled) {
      Preferences.addSetting({
        id: "weatherStandalone",
        pref: ACTIVITY_STREAM_PREF_BRANCH + weatherWidget.enabledPref,
        deps: [weatherWidget.trainhopEnabledKey, ...firefoxHomeDeps],
        visible: widgetToggleVisible(weatherWidget),
        disabled: deps => !firefoxHomeActive(deps),
      });
    } else {
      Preferences.addSetting({
        id: "showWeather",
        pref: "browser.newtabpage.activity-stream.system.showWeather",
      });

      Preferences.addSetting({
        id: "weatherStandalone",
        pref: "browser.newtabpage.activity-stream.showWeather",
        deps: ["showWeather", ...firefoxHomeDeps],
        visible: ({ showWeather }) => showWeather.value,
        disabled: deps => !firefoxHomeActive(deps),
      });
    }

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

    // When not nested, Weather keeps its own row so it stays reachable.
    const weatherNested = novaEnabled && widgetsSystemEnabled;

    // Only the rendered group is sorted; the settings stay registered in
    // registry order.
    const labels = widgetLabels(prefsWidgets);
    const sortedWidgets = [...prefsWidgets].sort((a, b) =>
      (labels.get(a.id) ?? a.id).localeCompare(labels.get(b.id) ?? b.id)
    );

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
        ...(weatherNested
          ? []
          : [
              {
                id: "weatherStandalone",
                subcategory: "weather",
                l10nId: weatherWidget.prefsL10nId,
                control: "moz-toggle",
              },
            ]),
        {
          id: "widgets",
          l10nId: "home-prefs-widgets-header",
          control: "moz-toggle",
          items: sortedWidgets
            .filter(w => weatherNested || w.id !== "weather")
            .map(({ id, prefsL10nId }) => ({
              id,
              l10nId: prefsL10nId,
              // Keeps the about:preferences#home-weather deep link working.
              ...(id === "weather" && { subcategory: "weather" }),
            })),
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
}
