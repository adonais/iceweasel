/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

const WIDGET_ID = "tab-groups-button";
const ANCHOR_WIDGET_ID = "alltabs-button";
const EXTENSIONS_WIDGET_ID = "unified-extensions-button";
const WIDGET_ENABLED_PREF = "browser.toolbars.tab-groups.enabled";
const INTRODUCED_PREF = "browser.toolbarbuttons.introduced.tab-groups-button";

/**
 * Adds the Tab Groups button to the toolbar once per profile, unless the
 * user has already placed or removed it.
 */
export const TabGroupsToolbarButton = {
  /**
   * Called at idle startup. Adds the button if there are saved tab groups.
   */
  init() {
    if (Services.prefs.getBoolPref(INTRODUCED_PREF, false)) {
      return;
    }
    lazy.CustomizableUI.addListener(this);
    if (lazy.SessionStore.getSavedTabGroups().length) {
      this.maybeAddTabGroupsButton();
    }
  },
  /**
   * Places the button after the List All Tabs button, or before the
   * extensions button if List All Tabs isn't placed somewhere visible.
   */
  maybeAddTabGroupsButton() {
    if (
      !Services.prefs.getBoolPref(WIDGET_ENABLED_PREF, false) ||
      Services.prefs.getBoolPref(INTRODUCED_PREF, false)
    ) {
      return;
    }
    if (!lazy.CustomizableUI.getPlacementOfWidget(WIDGET_ID)) {
      let anchor = lazy.CustomizableUI.getPlacementOfWidget(ANCHOR_WIDGET_ID);
      let win = lazy.BrowserWindowTracker.getTopWindow({
        allowFromInactiveWorkspace: true,
      });
      if (
        anchor &&
        win &&
        lazy.CustomizableUI.widgetIsLikelyVisible(ANCHOR_WIDGET_ID, win)
      ) {
        lazy.CustomizableUI.addWidgetToArea(
          WIDGET_ID,
          anchor.area,
          anchor.position + 1
        );
      } else {
        let extensions =
          lazy.CustomizableUI.getPlacementOfWidget(EXTENSIONS_WIDGET_ID);
        lazy.CustomizableUI.addWidgetToArea(
          WIDGET_ID,
          lazy.CustomizableUI.AREA_NAVBAR,
          extensions?.position
        );
      }
    }
    Services.prefs.setBoolPref(INTRODUCED_PREF, true);
    lazy.CustomizableUI.removeListener(this);
  },
  /**
   * CustomizableUI listener, called when any widget is removed from an area.
   */
  onWidgetRemoved(widgetId) {
    if (widgetId == WIDGET_ID) {
      Services.prefs.setBoolPref(INTRODUCED_PREF, true);
      lazy.CustomizableUI.removeListener(this);
    }
  },
};
