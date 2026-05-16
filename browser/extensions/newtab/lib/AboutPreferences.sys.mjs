/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  actionTypes as at,
  actionCreators as ac,
} from "resource://newtab/common/Actions.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  HomePage: "resource:///modules/HomePage.sys.mjs",
});

const DEFAULT_HOMEPAGE_URL = "about:home";
const BLANK_HOMEPAGE_URL = "chrome://browser/content/blanktab.html";

/**
 * @backward-compat { version 150 }
 * `home-pane-loaded` is fired by home-startup.mjs (chrome, baked at build time).
 * This notification was introduced in Firefox 150, so the redesign path in
 * observe() cannot be train-hopped on earlier releases.
 */
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
    {
      id: "support-firefox",
      pref: {
        feed: "showSponsoredCheckboxes",
        titleString: "home-prefs-support-firefox-header",
        nestedPrefs: [
          {
            name: "showSponsoredTopSites",
            titleString: "home-prefs-shortcuts-by-option-sponsored",
            eventSource: "SPONSORED_TOP_SITES",
          },
          {
            name: "showSponsored",
            titleString: "home-prefs-recommended-by-option-sponsored-stories",
            eventSource: "POCKET_SPOCS",
            shouldHidePref: !Services.prefs.getBoolPref(
              "browser.newtabpage.activity-stream.feeds.system.topstories",
              true
            ),
            shouldDisablePref: !Services.prefs.getBoolPref(
              "browser.newtabpage.activity-stream.feeds.section.topstories",
              true
            ),
          },
        ],
      },
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
        action._target.browser.ownerGlobal.openPreferences("paneHome");
        break;
      // This is used to open the web extension settings page for an extension
      case at.OPEN_WEBEXT_SETTINGS:
        action._target.browser.ownerGlobal.BrowserAddonUI.openAddonsMgr(
          `addons://detail/${encodeURIComponent(action.data)}`
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

      /**
       * @backward-compat { version 150 }
       * On Firefox < 150, the preferences component was registering Home & New Tab groups
       * itself before firing `home-pane-loaded`. Skip re-registration on those versions.
       */
      if (!SettingGroupManager._data?.has("homepage")) {
        this._registerPreferences(window);

        SettingGroupManager.registerGroups({
          homepage: this._setupHomepageGroup(window),
          customHomepage: this._setupCustomHomepageGroup(window),
          home: this._setupHomeGroup(window),
        });
      }
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
  _setupHomepageGroup(window) {
    const { Preferences } = window;

    // Set up `browser.startup.homepage` to show homepage options for Homepage / New Windows
    Preferences.addSetting(
      /** @type {{ useCustomHomepage: boolean } & SettingConfig } */ ({
        id: "homepageNewWindows",
        pref: "browser.startup.homepage",
        useCustomHomepage: false,
        get(prefVal) {
          if (this.useCustomHomepage) {
            return "custom";
          }
          switch (prefVal) {
            case DEFAULT_HOMEPAGE_URL:
              return "home";
            case BLANK_HOMEPAGE_URL:
              return "blank";
            // Custom value can be any string so leaving it as default value to catch
            // non-default/blank entries.
            default:
              return "custom";
          }
        },
        set(inputVal, _, setting) {
          let wasCustomHomepage = this.useCustomHomepage;
          this.useCustomHomepage = inputVal === "custom";
          if (wasCustomHomepage !== this.useCustomHomepage) {
            setting.onChange();
          }
          switch (inputVal) {
            case "home":
              return DEFAULT_HOMEPAGE_URL;
            case "blank":
              return BLANK_HOMEPAGE_URL;
            case "custom":
              return setting.pref.value;
            default:
              throw new Error("No handler for this value");
          }
        },
      })
    );

    // Set up `browser.startup.homepage` again to update and display its value
    // on the Homepage and Custom Homepage settings panes.
    Preferences.addSetting({
      id: "homepageDisplayPref",
      pref: "browser.startup.homepage",
    });

    Preferences.addSetting({
      id: "disableCurrentPagesButton",
      pref: "pref.browser.homepage.disable_button.current_page",
    });

    Preferences.addSetting({
      id: "disableBookmarkButton",
      pref: "pref.browser.homepage.disable_button.bookmark_page",
    });

    // Homepage / Choose Custom Homepage URL Button
    Preferences.addSetting({
      id: "homepageGoToCustomHomepageUrlPanel",
      deps: ["homepageNewWindows", "homepageDisplayPref"],
      visible: ({ homepageNewWindows }) => {
        return homepageNewWindows.value === "custom";
      },
      onUserClick: () => {
        window.gotoPref("customHomepage");
      },

      getControlConfig(config, { homepageDisplayPref }) {
        let customURLsDescription;

        // Make sure we only show user-provided values for custom URLs rather than
        // values we set in `browser.startup.homepage` for "Firefox Home"
        // and "Blank Page".
        if (
          [DEFAULT_HOMEPAGE_URL, BLANK_HOMEPAGE_URL].includes(
            homepageDisplayPref.value.trim()
          )
        ) {
          customURLsDescription = null;
        } else {
          // Add a comma-separated list of Custom URLs the user set for their homepage
          // to the description part of the "Choose a specific site" box button.
          customURLsDescription = homepageDisplayPref.value
            .split("|")
            .map(uri => lazy.BrowserUtils.formatURIStringForDisplay(uri))
            .filter(Boolean)
            .join(", ");
        }

        return {
          ...config,
          controlAttrs: {
            ...config.controlAttrs,
            ".description": customURLsDescription,
          },
        };
      },
    });

    // Homepage / New Tabs
    Preferences.addSetting({
      id: "homepageNewTabs",
      pref: "browser.newtabpage.enabled",
      get(prefVal) {
        return prefVal.toString();
      },
      set(inputVal) {
        return inputVal === "true";
      },
    });

    // Homepage / Restore Defaults button
    Preferences.addSetting({
      id: "homepageRestoreDefaults",
      pref: "pref.browser.homepage.disable_button.restore_default",
      deps: ["homepageNewWindows", "homepageNewTabs"],
      disabled: ({ homepageNewWindows, homepageNewTabs }) => {
        return (
          homepageNewWindows.value === "home" &&
          homepageNewTabs.value === "true"
        );
      },
      onUserClick: (e, { homepageNewWindows, homepageNewTabs }) => {
        e.preventDefault();

        homepageNewWindows.value = "home";
        homepageNewTabs.value = "true";
      },
    });

    return {
      inProgress: true,
      headingLevel: 2,
      iconSrc: "chrome://browser/skin/window-firefox.svg",
      l10nId: "home-homepage-title",
      items: [
        {
          id: "homepageNewWindows",
          control: "moz-select",
          l10nId: "home-homepage-new-windows",
          options: [
            {
              value: "home",
              l10nId: "home-mode-choice-default-fx",
            },
            { value: "blank", l10nId: "home-mode-choice-blank" },
            { value: "custom", l10nId: "home-mode-choice-custom" },
          ],
        },
        {
          id: "homepageGoToCustomHomepageUrlPanel",
          control: "moz-box-button",
          l10nId: "home-homepage-custom-homepage-button",
        },
        {
          id: "homepageNewTabs",
          control: "moz-select",
          l10nId: "home-homepage-new-tabs",
          options: [
            {
              value: "true",
              l10nId: "home-mode-choice-default-fx",
            },
            { value: "false", l10nId: "home-mode-choice-blank" },
          ],
        },
        {
          id: "homepageRestoreDefaults",
          control: "moz-button",
          iconSrc: "chrome://global/skin/icons/arrow-counterclockwise-16.svg",
          l10nId: "home-restore-defaults",
          controlAttrs: { id: "restoreDefaultHomePageBtn" },
        },
      ],
    };
  }

  /** @param {Window} window */
  _setupCustomHomepageGroup(window) {
    const { Preferences } = window;

    Preferences.addSetting(
      /** @type {{ _inputValue: string } & SettingConfig } */ ({
        id: "customHomepageAddUrlInput",
        _inputValue: "",
        get() {
          return this._inputValue;
        },

        set(val, _, setting) {
          this._inputValue = val.trim();
          setting.onChange();
        },
      })
    );

    Preferences.addSetting({
      id: "customHomepageAddAddressButton",
      deps: ["homepageDisplayPref", "customHomepageAddUrlInput"],
      onUserClick(e, { homepageDisplayPref, customHomepageAddUrlInput }) {
        // Focus is being stolen by a parent component here (moz-fieldset).
        // Focus on the button to get the input value.
        e.target.focus();

        let inputVal = customHomepageAddUrlInput.value;

        // Don't do anything for empty strings
        if (!inputVal) {
          return;
        }

        if (
          [DEFAULT_HOMEPAGE_URL, BLANK_HOMEPAGE_URL].includes(
            homepageDisplayPref.value.trim()
          )
        ) {
          // Replace the default homepage value with the new Custom URL.
          homepageDisplayPref.value = inputVal;
        } else {
          // Append this URL to the list of Custom URLs saved in prefs.
          let urls = lazy.HomePage.parseCustomHomepageURLs(
            homepageDisplayPref.value
          );
          urls.push(inputVal);
          homepageDisplayPref.value = urls.join("|");
        }

        // Reset the field to empty string
        customHomepageAddUrlInput.value = "";
      },
    });

    Preferences.addSetting({
      id: "customHomepageReplaceWithCurrentPagesButton",
      deps: ["homepageDisplayPref", "disableCurrentPagesButton"],
      // Re-evaluate disabled state on tab open/close (add/remove tabs) and
      // pin/unpin (changes what getTabsForCustomHomepage() captures).
      setup(emitChange) {
        let win = /** @type {any} */ (
          Services.wm.getMostRecentWindow("navigator:browser")
        );
        if (!win) {
          return () => {};
        }
        const { tabContainer } = win.gBrowser;
        // Best-effort filter: skip events from tabs already showing about:preferences.
        // TabOpen fires before the URI is set, so it isn't caught here;
        // the real exclusion happens inside getTabsForCustomHomepage().
        const onTabChange = (/** @type {Event & { target: any }} */ event) => {
          if (
            event.target.linkedBrowser?.currentURI?.spec?.startsWith(
              "about:preferences"
            )
          ) {
            return;
          }
          emitChange();
        };
        tabContainer.addEventListener("TabOpen", onTabChange);
        tabContainer.addEventListener("TabClose", onTabChange);
        tabContainer.addEventListener("TabPinned", onTabChange);
        tabContainer.addEventListener("TabUnpinned", onTabChange);
        return () => {
          tabContainer.removeEventListener("TabOpen", onTabChange);
          tabContainer.removeEventListener("TabClose", onTabChange);
          tabContainer.removeEventListener("TabPinned", onTabChange);
          tabContainer.removeEventListener("TabUnpinned", onTabChange);
        };
      },
      onUserClick(e, { homepageDisplayPref }) {
        let tabs = lazy.HomePage.getTabsForCustomHomepage();

        if (tabs.length) {
          homepageDisplayPref.value = tabs
            .map(t => t.linkedBrowser.currentURI.spec)
            .join("|");
        }
      },
      disabled: ({ disableCurrentPagesButton }) =>
        // Disable this button if the only open tab is `about:preferences`/`about:settings`
        // or when an enterprise policy sets a special pref to true
        lazy.HomePage.getTabsForCustomHomepage().length < 1 ||
        disableCurrentPagesButton?.value === true,
    });

    Preferences.addSetting({
      id: "customHomepageReplaceWithBookmarksButton",
      deps: ["homepageDisplayPref", "disableBookmarkButton"],
      onUserClick(e, { homepageDisplayPref }) {
        const rv = { urls: null, names: null };

        // Callback to use when bookmark dialog closes
        const closingCallback = event => {
          if (event.detail.button !== "accept") {
            return;
          }
          if (rv.urls) {
            homepageDisplayPref.value = rv.urls.join("|");
          }
        };

        window.gSubDialog.open(
          "chrome://browser/content/preferences/dialogs/selectBookmark.xhtml",
          {
            features: "resizable=yes, modal=yes",
            closingCallback,
          },
          rv
        );
      },
      disabled: ({ disableBookmarkButton }) =>
        // Disable this button if an enterprise policy sets a special pref to true
        disableBookmarkButton?.value === true,
    });

    Preferences.addSetting({
      id: "customHomepageBoxGroup",
      deps: ["homepageDisplayPref"],
      getControlConfig(config, { homepageDisplayPref }) {
        const urls = lazy.HomePage.parseCustomHomepageURLs(
          homepageDisplayPref.value
        );
        let listItems = [];
        let type = "list";

        // Show a reorderable list of Custom URLs if the user has provided any.
        // Make sure to exclude "Firefox Home" and "Blank Page" values that are also
        // stored in the homepage pref.
        if (
          [DEFAULT_HOMEPAGE_URL, BLANK_HOMEPAGE_URL].includes(
            homepageDisplayPref.value.trim()
          ) === false
        ) {
          type = "reorderable-list";
          listItems = urls.map((url, index) => ({
            id: `customHomepageUrl-${index}`,
            key: `url-${index}-${url}`,
            control: "moz-box-item",
            controlAttrs: { label: url, "data-url": url },
            options: [
              {
                control: "moz-button",
                iconSrc: "chrome://global/skin/icons/delete.svg",
                l10nId: "home-custom-homepage-delete-address-button",
                slot: "actions-start",
                controlAttrs: {
                  "data-action": "delete",
                  "data-index": index,
                },
              },
            ],
          }));
        } else {
          // If no custom URLs have been set, show the "no results" string instead.
          listItems = [
            {
              control: "moz-box-item",
              l10nId: "home-custom-homepage-no-results",
              controlAttrs: {
                class: "description-deemphasized",
              },
            },
          ];
        }

        return {
          ...config,
          controlAttrs: {
            ...config.controlAttrs,
            type,
          },
          options: [
            {
              id: "customHomepageBoxForm",
              control: "moz-box-item",
              slot: "header",
              items: [
                {
                  id: "customHomepageAddUrlInput",
                  l10nId: "home-custom-homepage-address",
                  control: "moz-input-text",
                },
                {
                  id: "customHomepageAddAddressButton",
                  l10nId: "home-custom-homepage-address-button",
                  control: "moz-button",
                  slot: "actions",
                },
              ],
            },
            ...listItems,
            {
              id: "customHomepageBoxActions",
              control: "moz-box-item",
              l10nId: "home-custom-homepage-replace-with-prompt",
              slot: "footer",
              items: [
                {
                  id: "customHomepageReplaceWithCurrentPagesButton",
                  l10nId: "home-custom-homepage-current-pages-button",
                  control: "moz-button",
                  slot: "actions",
                },
                {
                  id: "customHomepageReplaceWithBookmarksButton",
                  l10nId: "home-custom-homepage-bookmarks-button",
                  control: "moz-button",
                  slot: "actions",
                },
              ],
            },
          ],
        };
      },
      onUserReorder(e, { homepageDisplayPref }) {
        let urls = lazy.HomePage.parseCustomHomepageURLs(
          homepageDisplayPref.value
        );

        let { draggedIndex, targetIndex } = e.detail;
        let [moved] = urls.splice(draggedIndex, 1);
        urls.splice(targetIndex, 0, moved);

        homepageDisplayPref.value = urls.join("|");
      },
      onUserClick(e, { homepageDisplayPref }) {
        let urls = lazy.HomePage.parseCustomHomepageURLs(
          homepageDisplayPref.value
        );

        if (
          e.target.localName === "moz-button" &&
          e.target.getAttribute("data-action") === "delete"
        ) {
          let index = Number(e.target.dataset.index);
          if (Number.isInteger(index) && index >= 0 && index < urls.length) {
            urls.splice(index, 1);
            homepageDisplayPref.value = urls.join("|");
          }
        }
      },
    });

    return {
      inProgress: true,
      headingLevel: 2,
      l10nId: "home-custom-homepage-card-header",
      iconSrc: "chrome://global/skin/icons/link.svg",
      items: [
        {
          id: "customHomepageBoxGroup",
          control: "moz-box-group",
          controlAttrs: {
            type: "list",
          },
        },
      ],
    };
  }

  /** @param {Window} window */
  _setupHomeGroup(window) {
    const { Preferences } = window;

    // Search
    Preferences.addSetting({
      id: "webSearch",
      pref: "browser.newtabpage.activity-stream.showSearch",
    });

    // Weather
    // @nova-cleanup(remove-conditional): Remove novaEnabled check and else branch; keep only the Nova registration block (weatherEnabled + weather addSetting calls)
    const novaEnabled = Services.prefs.getBoolPref(
      "browser.newtabpage.activity-stream.nova.enabled",
      false
    );

    if (novaEnabled) {
      Preferences.addSetting({
        id: "weatherEnabled",
        pref: "browser.newtabpage.activity-stream.widgets.system.weather.enabled",
      });

      Preferences.addSetting({
        id: "weather",
        pref: "browser.newtabpage.activity-stream.widgets.weather.enabled",
        deps: ["weatherEnabled"],
        visible: ({ weatherEnabled }) => weatherEnabled.value,
      });
    } else {
      Preferences.addSetting({
        id: "showWeather",
        pref: "browser.newtabpage.activity-stream.system.showWeather",
      });

      Preferences.addSetting({
        id: "weather",
        pref: "browser.newtabpage.activity-stream.showWeather",
        deps: ["showWeather"],
        visible: ({ showWeather }) => showWeather.value,
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
      deps: ["widgetsEnabled"],
      visible: ({ widgetsEnabled }) => widgetsEnabled.value,
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
      visible: ({ listsEnabled }) => listsEnabled.value,
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
      visible: ({ timerEnabled }) => timerEnabled.value,
    });

    // Shortcuts
    Preferences.addSetting({
      id: "shortcuts",
      pref: "browser.newtabpage.activity-stream.feeds.topsites",
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
      deps: ["systemTopstories"],
      visible: ({ systemTopstories }) => systemTopstories.value,
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
        "topicLabelsEnabled",
        "sectionsPersonalizationEnabled",
        "sectionsCustomizeMenuPanelEnabled",
        "stories",
      ],
      visible: ({
        sectionsEnabled,
        topicLabelsEnabled,
        sectionsPersonalizationEnabled,
        sectionsCustomizeMenuPanelEnabled,
        stories,
      }) =>
        sectionsEnabled.value &&
        topicLabelsEnabled.value &&
        sectionsPersonalizationEnabled.value &&
        sectionsCustomizeMenuPanelEnabled.value &&
        stories.value,
    });

    // Support Firefox: sponsored content
    Preferences.addSetting({
      id: "supportFirefox",
      pref: "browser.newtabpage.activity-stream.showSponsoredCheckboxes",
      deps: ["sponsoredShortcuts", "sponsoredStories"],
      onUserChange(value, { sponsoredShortcuts, sponsoredStories }) {
        // When supportFirefox changes, automatically update child preferences to match
        sponsoredShortcuts.value = !!value;
        sponsoredStories.value = !!value;
      },
    });
    Preferences.addSetting({
      id: "topsitesEnabled",
      pref: "browser.newtabpage.activity-stream.feeds.topsites",
    });
    Preferences.addSetting({
      id: "sponsoredShortcuts",
      pref: "browser.newtabpage.activity-stream.showSponsoredTopSites",
      deps: ["topsitesEnabled"],
      disabled: ({ topsitesEnabled }) => !topsitesEnabled.value,
    });
    Preferences.addSetting({
      id: "sponsoredStories",
      pref: "browser.newtabpage.activity-stream.showSponsored",
      deps: ["systemTopstories", "stories"],
      visible: ({ systemTopstories }) => !!systemTopstories.value,
      disabled: ({ stories }) => !stories.value,
    });
    Preferences.addSetting({
      id: "supportFirefoxPromo",
      deps: ["supportFirefox"],
    });

    // Recent activity
    Preferences.addSetting({
      id: "recentActivity",
      pref: "browser.newtabpage.activity-stream.feeds.section.highlights",
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

    Preferences.addSetting({
      id: "chooseWallpaper",
    });

    return {
      inProgress: true,
      headingLevel: 2,
      l10nId: "home-prefs-content-header",
      iconSrc: "chrome://browser/skin/home.svg",
      items: [
        {
          id: "webSearch",
          l10nId: "home-prefs-search-header2",
          control: "moz-toggle",
        },
        {
          id: "weather",
          l10nId: "home-prefs-weather-header",
          control: "moz-toggle",
        },
        {
          id: "widgets",
          l10nId: "home-prefs-widgets-header",
          control: "moz-toggle",
          items: [
            {
              id: "lists",
              l10nId: "home-prefs-lists-header",
            },
            {
              id: "timer",
              l10nId: "home-prefs-timer-header",
            },
          ],
        },
        {
          id: "shortcuts",
          l10nId: "home-prefs-shortcuts-header",
          control: "moz-toggle",
          items: [
            {
              id: "shortcutsRows",
              control: "moz-select",
              options: [
                {
                  value: 1,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 1 },
                },
                {
                  value: 2,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 2 },
                },
                {
                  value: 3,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 3 },
                },
                {
                  value: 4,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 4 },
                },
              ],
            },
          ],
        },
        {
          id: "stories",
          l10nId: "home-prefs-stories-header2",
          control: "moz-toggle",
          items: [
            {
              id: "manageTopics",
              l10nId: "home-prefs-manage-topics-link2",
              control: "moz-box-link",
              controlAttrs: {
                href: "about:newtab#customize-topics",
              },
            },
          ],
        },
        {
          id: "supportFirefox",
          l10nId: "home-prefs-support-firefox-header",
          control: "moz-toggle",
          items: [
            {
              id: "sponsoredShortcuts",
              l10nId: "home-prefs-shortcuts-by-option-sponsored",
            },
            {
              id: "sponsoredStories",
              l10nId: "home-prefs-recommended-by-option-sponsored-stories",
            },
            {
              id: "supportFirefoxPromo",
              l10nId: "home-prefs-mission-message2",
              control: "moz-promo",
              options: [
                {
                  control: "a",
                  l10nId: "home-prefs-mission-message-learn-more-link",
                  slot: "support-link",
                  controlAttrs: {
                    is: "moz-support-link",
                    "support-page": "sponsor-privacy",
                    "utm-content": "inproduct",
                  },
                },
              ],
            },
          ],
        },
        {
          id: "recentActivity",
          l10nId: "home-prefs-recent-activity-header",
          control: "moz-toggle",
          items: [
            {
              id: "recentActivityRows",
              control: "moz-select",
              options: [
                {
                  value: 1,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 1 },
                },
                {
                  value: 2,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 2 },
                },
                {
                  value: 3,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 3 },
                },
                {
                  value: 4,
                  l10nId: "home-prefs-sections-rows-option",
                  l10nArgs: { num: 4 },
                },
              ],
            },
            {
              id: "recentActivityVisited",
              l10nId: "home-prefs-highlights-option-visited-pages",
            },
            {
              id: "recentActivityBookmarks",
              l10nId: "home-prefs-highlights-options-bookmarks",
            },
            {
              id: "recentActivityDownloads",
              l10nId: "home-prefs-highlights-option-most-recent-download",
            },
          ],
        },
        {
          id: "chooseWallpaper",
          l10nId: "home-prefs-choose-wallpaper-link2",
          control: "moz-box-link",
          controlAttrs: {
            href: "about:newtab#customize",
          },
          iconSrc: "chrome://browser/skin/customize.svg",
        },
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
   * In fact, we can probably remove this entire method.
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

    // Special cases to like the nested prefs with another pref,
    // so we can disable it real time.
    if (id === "support-firefox") {
      function setupSupportFirefoxSubCheck(triggerPref, subPref) {
        const subCheckFullName = `browser.newtabpage.activity-stream.${triggerPref}`;
        const subCheckPref = Preferences.get(subCheckFullName);

        subCheckPref?.on("change", () => {
          const showSponsoredFullName = `browser.newtabpage.activity-stream.${subPref}`;
          const showSponsoredSubcheck = subChecks.find(
            subcheck =>
              subcheck.getAttribute("preference") === showSponsoredFullName
          );
          if (showSponsoredSubcheck) {
            showSponsoredSubcheck.disabled = !Services.prefs.getBoolPref(
              subCheckFullName,
              true
            );
          }
        });
      }

      setupSupportFirefoxSubCheck("feeds.section.topstories", "showSponsored");
      setupSupportFirefoxSubCheck("feeds.topsites", "showSponsoredTopSites");
    }

    pref.on("change", () => {
      subChecks.forEach(subcheck => {
        // Update child preferences for the "Support Firefox" checkbox group
        // so that they're turned on and off at the same time.
        if (id === "support-firefox") {
          const subPref = Preferences.get(subcheck.getAttribute("preference"));
          subPref.value = pref.value;
        }

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
