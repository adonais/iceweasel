/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file is loaded into the browser window scope.
/* eslint-env mozilla/browser-window */

ChromeUtils.defineESModuleGetters(this, {
  BrowserUsageTelemetry: "resource:///modules/BrowserUsageTelemetry.sys.mjs",
  GroupsPanel: "moz-src:///browser/components/tabbrowser/GroupsList.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
  TabsPanel: "moz-src:///browser/components/tabbrowser/TabsList.sys.mjs",
});

var gTabsPanel = {
  kElements: {
    allTabsButton: "alltabs-button",
    allTabsView: "allTabsMenu-allTabsView",
    allTabsViewTabs: "allTabsMenu-allTabsView-tabs",
    dropIndicator: "allTabsMenu-dropIndicator",
    containerTabsView: "allTabsMenu-containerTabsView",
    hiddenTabsButton: "allTabsMenu-hiddenTabsButton",
    hiddenTabsView: "allTabsMenu-hiddenTabsView",
    hiddenTabsViewTabs: "allTabsMenu-hiddenTabsView-tabs",
    hiddenAudioTabs: "allTabsMenu-allTabsView-hiddenAudio-tabs",
    groupsView: "allTabsMenu-groupsView",
    groupsSubView: "allTabsMenu-groupsSubView",
  },
  _initialized: false,
  _initializedElements: false,

  initElements() {
    if (this._initializedElements) {
      return;
    }
    let template = document.getElementById("allTabsMenu-container");
    template.replaceWith(template.content);

    for (let [name, id] of Object.entries(this.kElements)) {
      this[name] = document.getElementById(id);
    }
    this._initializedElements = true;
  },

  hasHiddenTabsExcludingFxView() {
    // Exclude Firefox View, see Bug 1880138.
    return gBrowser.tabs.some(
      tab => tab.hidden && tab != FirefoxViewHandler.tab
    );
  },

  init() {
    if (this._initialized) {
      return;
    }

    this.initElements();

    this.hiddenAudioTabsPopup = new TabsPanel({
      view: this.allTabsView,
      containerNode: this.hiddenAudioTabs,
      filterFn: tab => tab.soundPlaying,
      onlyHiddenTabs: true,
    });
    this.allTabsPanel = new TabsPanel({
      view: this.allTabsView,
      containerNode: this.allTabsViewTabs,
      filterFn: tab => !tab.hidden,
      dropIndicator: this.dropIndicator,
      onlyHiddenTabs: false,
    });
    this.groupsPanel = new GroupsPanel({
      view: this.allTabsView,
      containerNode: this.groupsView,
    });
    this.showAllGroupsPanel = new GroupsPanel({
      view: this.groupsSubView,
      containerNode: document.getElementById("allTabsMenu-groupsSubView-body"),
      showAll: true,
    });

    this.allTabsView.addEventListener("ViewShowing", () => {
      PanelUI._ensureShortcutsShown(this.allTabsView);

      let containersEnabled =
        Services.prefs.getBoolPref("privacy.userContext.enabled") &&
        !PrivateBrowsingUtils.isWindowPrivate(window);
      document.getElementById("allTabsMenu-containerTabsButton").hidden =
        !containersEnabled;

      const hasHiddenTabs = this.hasHiddenTabsExcludingFxView();
      document.getElementById("allTabsMenu-hiddenTabsButton").hidden =
        !hasHiddenTabs;
      document.getElementById("allTabsMenu-hiddenTabsSeparator").hidden =
        !hasHiddenTabs;

      let closeDuplicateEnabled = Services.prefs.getBoolPref(
        "browser.tabs.context.close-duplicate.enabled"
      );
      let closeDuplicateTabsItem = document.getElementById(
        "allTabsMenu-closeDuplicateTabs"
      );
      closeDuplicateTabsItem.hidden = !closeDuplicateEnabled;
      closeDuplicateTabsItem.disabled =
        !closeDuplicateEnabled || !gBrowser.getAllDuplicateTabsToClose().length;

      let syncedTabs = document.getElementById("allTabsMenu-syncedTabs");
      syncedTabs.hidden =
        !PlacesUIUtils.shouldShowTabsFromOtherComputersMenuitem();
    });

    this.allTabsView.addEventListener("ViewShown", () =>
      this.allTabsView
        .querySelector(".all-tabs-item[selected]")
        ?.scrollIntoView({ block: "center" })
    );

    this.allTabsView.addEventListener("command", event => {
      let { target } = event;
      let { PanelUI } = target.ownerGlobal;
      switch (target.id) {
        case "allTabsMenu-searchTabs":
          this.searchTabs();
          break;
        case "allTabsMenu-closeDuplicateTabs":
          gBrowser.removeAllDuplicateTabs();
          break;
        case "allTabsMenu-containerTabsButton":
          PanelUI.showSubView(this.kElements.containerTabsView, target);
          break;
        case "allTabsMenu-hiddenTabsButton":
          PanelUI.showSubView(this.kElements.hiddenTabsView, target);
          break;
        case "allTabsMenu-syncedTabs":
          SidebarController.show("viewTabsSidebar");
          break;
        case "allTabsMenu-groupsViewShowMore":
          PanelUI.showSubView(this.kElements.groupsSubView, target);
          break;
      }
    });

    let containerTabsMenuSeparator =
      this.containerTabsView.querySelector("toolbarseparator");
    this.containerTabsView.addEventListener("ViewShowing", e => {
      let elements = [];
      let frag = document.createDocumentFragment();

      ContextualIdentityService.getPublicIdentities().forEach(identity => {
        let menuitem = document.createXULElement("toolbarbutton");
        menuitem.setAttribute("class", "subviewbutton subviewbutton-iconic");
        if (identity.name) {
          menuitem.setAttribute("label", identity.name);
        } else {
          document.l10n.setAttributes(menuitem, identity.l10nId);
        }
        // The styles depend on this.
        menuitem.setAttribute("usercontextid", identity.userContextId);
        // The command handler depends on this.
        menuitem.setAttribute("data-usercontextid", identity.userContextId);
        menuitem.classList.add("identity-icon-" + identity.icon);
        menuitem.classList.add("identity-color-" + identity.color);

        menuitem.setAttribute("command", "Browser:NewUserContextTab");

        frag.appendChild(menuitem);
        elements.push(menuitem);
      });

      e.target.addEventListener(
        "ViewHiding",
        () => {
          for (let element of elements) {
            element.remove();
          }
        },
        { once: true }
      );
      containerTabsMenuSeparator.parentNode.insertBefore(
        frag,
        containerTabsMenuSeparator
      );
    });

    this.hiddenTabsPopup = new TabsPanel({
      view: this.hiddenTabsView,
      containerNode: this.hiddenTabsViewTabs,
      filterFn: tab => tab != FirefoxViewHandler.tab,
      onlyHiddenTabs: true,
    });

    this._initialized = true;
  },

  get canOpen() {
    this.initElements();
    return isElementVisible(this.allTabsButton);
  },

  showAllTabsPanel(event, entrypoint = "unknown") {
    // Note that event may be null.

    // Only space and enter should open the popup, ignore other keypresses:
    if (event?.type == "keypress" && event.key != "Enter" && event.key != " ") {
      return;
    }
    this.init();
    if (this.canOpen) {
      Glean.browserUiInteraction.allTabsPanelEntrypoint[entrypoint].add(1);
      BrowserUsageTelemetry.recordInteractionEvent(
        entrypoint,
        "all-tabs-panel-entrypoint"
      );
      PanelUI.showSubView(
        this.kElements.allTabsView,
        this.allTabsButton,
        event
      );
    }
  },

  hideAllTabsPanel() {
    let panel = this.allTabsView?.closest("panel");
    if (panel) {
      PanelMultiView.hidePopup(panel);
    }
  },

  showHiddenTabsPanel(event, entrypoint = "unknown") {
    this.init();
    if (!this.canOpen) {
      return;
    }
    this.allTabsView.addEventListener(
      "ViewShown",
      () => {
        PanelUI.showSubView(
          this.kElements.hiddenTabsView,
          this.hiddenTabsButton
        );
      },
      { once: true }
    );
    this.showAllTabsPanel(event, entrypoint);
  },

  searchTabs() {
    gURLBar.search(UrlbarTokenizer.RESTRICT.OPENPAGE, {
      searchModeEntry: "tabmenu",
    });
  },
};
