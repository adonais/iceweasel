/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { MoveSubmenu } from "./MoveSubmenu";

const LEARN_MORE_URL = "https://support.mozilla.org/kb/firefox-new-tab-widgets";

// Shared trailing block for the widget menus that use it, in a fixed order:
// divider, Change size, Move, Hide widget, Learn more. Size submenu is passed in.
export const WidgetMenuFooter = ({
  dispatch,
  // widgetId is the registry id used by Move (e.g. "focusTimer"); widgetName is
  // the telemetry name (e.g. "focus_timer").
  widgetId,
  widgetEnabledMap,
  widgetName,
  enabledPref,
  widgetSize,
  learnMoreL10nId,
  sizeSubmenu,
  onAfterHide,
  onLearnMore,
  // Suppress the divider when the widget has no items above the footer, so it
  // doesn't render as a stray leading separator.
  showDivider = true,
}) => {
  const handleHide = () => {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.SET_PREF,
          data: { name: enabledPref, value: false },
        })
      );
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_ENABLED,
          data: {
            widget_name: widgetName,
            widget_source: "context_menu",
            enabled: false,
            widget_size: widgetSize,
          },
        })
      );
      onAfterHide?.();
    });
  };

  const handleLearnMore = () => {
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: { url: LEARN_MORE_URL, where: "tab" },
        })
      );
      onLearnMore?.();
    });
  };

  return (
    <>
      {showDivider && <hr />}
      {sizeSubmenu}
      <MoveSubmenu widgetId={widgetId} widgetEnabledMap={widgetEnabledMap} />
      <panel-item data-l10n-id="newtab-widget-menu-hide" onClick={handleHide} />
      <panel-item data-l10n-id={learnMoreL10nId} onClick={handleLearnMore} />
    </>
  );
};
