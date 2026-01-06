/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector, batch } from "react-redux";
import { Lists } from "./Lists/Lists";
import { FocusTimer } from "./FocusTimer/FocusTimer";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";
import { WidgetsFeatureHighlight } from "../DiscoveryStreamComponents/FeatureHighlight/WidgetsFeatureHighlight";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

const PREF_WIDGETS_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_WIDGETS_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";
const PREF_WIDGETS_TIMER_ENABLED = "widgets.focusTimer.enabled";
const PREF_WIDGETS_SYSTEM_TIMER_ENABLED = "widgets.system.focusTimer.enabled";
const PREF_WIDGETS_MAXIMIZED = "widgets.maximized";
const PREF_WIDGETS_SYSTEM_MAXIMIZED = "widgets.system.maximized";

// resets timer to default values (exported for testing)
// In practice, this logic runs inside a useEffect when
// the timer widget is disabled (after the pref flips from true to false).
// Because Enzyme tests cannot reliably simulate that pref update or trigger
// the related useEffect, we expose this helper to at least just test the reset behavior instead

export function resetTimerToDefaults(dispatch, timerType) {
  const originalTime = timerType === "focus" ? 1500 : 300;

  // Reset both focus and break timers to their initial durations
  dispatch(
    ac.AlsoToMain({
      type: at.WIDGETS_TIMER_RESET,
      data: {
        timerType,
        duration: originalTime,
        initialDuration: originalTime,
      },
    })
  );

  // Set the timer type back to "focus"
  dispatch(
    ac.AlsoToMain({
      type: at.WIDGETS_TIMER_SET_TYPE,
      data: {
        timerType: "focus",
      },
    })
  );
}

function Widgets() {
  const prefs = useSelector(state => state.Prefs.values);
  const { messageData } = useSelector(state => state.Messages);
  const timerType = useSelector(state => state.TimerWidget.timerType);
  const timerData = useSelector(state => state.TimerWidget);
  const isMaximized = prefs[PREF_WIDGETS_MAXIMIZED];
  const dispatch = useDispatch();

  const nimbusListsEnabled = prefs.widgetsConfig?.listsEnabled;
  const nimbusTimerEnabled = prefs.widgetsConfig?.timerEnabled;
  const nimbusListsTrainhopEnabled =
    prefs.trainhopConfig?.widgets?.listsEnabled;
  const nimbusTimerTrainhopEnabled =
    prefs.trainhopConfig?.widgets?.timerEnabled;

  const listsEnabled =
    (nimbusListsTrainhopEnabled ||
      nimbusListsEnabled ||
      prefs[PREF_WIDGETS_SYSTEM_LISTS_ENABLED]) &&
    prefs[PREF_WIDGETS_LISTS_ENABLED];

  const timerEnabled =
    (nimbusTimerTrainhopEnabled ||
      nimbusTimerEnabled ||
      prefs[PREF_WIDGETS_SYSTEM_TIMER_ENABLED]) &&
    prefs[PREF_WIDGETS_TIMER_ENABLED];

  // track previous timerEnabled state to detect when it becomes disabled
  const prevTimerEnabledRef = useRef(timerEnabled);

  // Reset timer when it becomes disabled
  useEffect(() => {
    const wasTimerEnabled = prevTimerEnabledRef.current;
    const isTimerEnabled = timerEnabled;

    // Only reset if timer was enabled and is now disabled
    if (wasTimerEnabled && !isTimerEnabled && timerData) {
      resetTimerToDefaults(dispatch, timerType);
    }

    // Update the ref to track current state
    prevTimerEnabledRef.current = isTimerEnabled;
  }, [timerEnabled, timerData, dispatch, timerType]);

  // Sends a dispatch to disable all widgets
  function handleHideAllWidgetsClick(e) {
    e.preventDefault();
    batch(() => {
      dispatch(ac.SetPref(PREF_WIDGETS_LISTS_ENABLED, false));
      dispatch(ac.SetPref(PREF_WIDGETS_TIMER_ENABLED, false));
    });
  }

  function handleHideAllWidgetsKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      batch(() => {
        dispatch(ac.SetPref(PREF_WIDGETS_LISTS_ENABLED, false));
        dispatch(ac.SetPref(PREF_WIDGETS_TIMER_ENABLED, false));
      });
    }
  }

  // Toggles the maximized state of widgets
  function handleToggleMaximizeClick(e) {
    e.preventDefault();
    dispatch(ac.SetPref(PREF_WIDGETS_MAXIMIZED, !isMaximized));
  }

  function handleToggleMaximizeKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      dispatch(ac.SetPref(PREF_WIDGETS_MAXIMIZED, !isMaximized));
    }
  }

  function handleUserInteraction(widgetName) {
    const prefName = `widgets.${widgetName}.interaction`;
    const hasInteracted = prefs[prefName];
    // we want to make sure that the value is a strict false (and that the property exists)
    if (hasInteracted === false) {
      dispatch(ac.SetPref(prefName, true));
    }
  }

  if (!(listsEnabled || timerEnabled)) {
    return null;
  }

  return (
    <div className="widgets-wrapper">
      <div className="widgets-section-container">
        <div className="widgets-title-container">
          <h1 data-l10n-id="newtab-widget-section-title"></h1>
          {prefs[PREF_WIDGETS_SYSTEM_MAXIMIZED] && (
            <moz-button
              id="toggle-widgets-size-button"
              type="icon ghost"
              size="small"
              // Toggle the icon and hover text
              data-l10n-id={
                isMaximized
                  ? "newtab-widget-section-maximize"
                  : "newtab-widget-section-minimize"
              }
              iconsrc={`chrome://browser/skin/${isMaximized ? "fullscreen" : "fullscreen-exit"}.svg`}
              onClick={handleToggleMaximizeClick}
              onKeyDown={handleToggleMaximizeKeyDown}
            />
          )}
          <moz-button
            id="hide-all-widgets-button"
            type="icon ghost"
            size="small"
            data-l10n-id="newtab-widget-section-hide-all-button"
            iconsrc="chrome://global/skin/icons/close.svg"
            onClick={handleHideAllWidgetsClick}
            onKeyDown={handleHideAllWidgetsKeyDown}
          />
        </div>
        <div
          className={`widgets-container ${isMaximized ? "is-maximized" : ""}`}
        >
          {listsEnabled && (
            <Lists
              dispatch={dispatch}
              handleUserInteraction={handleUserInteraction}
              isMaximized={isMaximized}
            />
          )}
          {timerEnabled && (
            <FocusTimer
              dispatch={dispatch}
              handleUserInteraction={handleUserInteraction}
              isMaximized={isMaximized}
            />
          )}
        </div>
      </div>
      {messageData?.content?.messageType === "WidgetMessage" && (
        <MessageWrapper dispatch={dispatch}>
          <WidgetsFeatureHighlight dispatch={dispatch} />
        </MessageWrapper>
      )}
    </div>
  );
}

export { Widgets };
