/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Lists } from "./Lists/Lists";
import { FocusTimer } from "./FocusTimer/FocusTimer";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";
import { WidgetsFeatureHighlight } from "../DiscoveryStreamComponents/FeatureHighlight/WidgetsFeatureHighlight";
import { actionCreators as ac } from "common/Actions.mjs";

const PREF_WIDGETS_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_WIDGETS_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";
const PREF_WIDGETS_TIMER_ENABLED = "widgets.focusTimer.enabled";
const PREF_WIDGETS_SYSTEM_TIMER_ENABLED = "widgets.system.focusTimer.enabled";

function Widgets() {
  const prefs = useSelector(state => state.Prefs.values);
  const { messageData } = useSelector(state => state.Messages);
  const listsState = useSelector(state => state.ListsWidget);
  const timerState = useSelector(state => state.TimerWidget);
  const timerType = timerState?.timerType;
  const dispatch = useDispatch();

  const nimbusListsEnabled = prefs.widgetsConfig?.listsEnabled;
  const nimbusTimerEnabled = prefs.widgetsConfig?.timerEnabled;

  const listsEnabled =
    (nimbusListsEnabled || prefs[PREF_WIDGETS_SYSTEM_LISTS_ENABLED]) &&
    prefs[PREF_WIDGETS_LISTS_ENABLED];

  const timerEnabled =
    (nimbusTimerEnabled || prefs[PREF_WIDGETS_SYSTEM_TIMER_ENABLED]) &&
    prefs[PREF_WIDGETS_TIMER_ENABLED];

  const tasksCount =
    listsEnabled && listsState?.lists && listsState?.selected
      ? (listsState.lists[listsState.selected]?.tasks?.length ?? 0)
      : 0;

  const manyTasks = tasksCount >= 4;
  const isTimerRunning = timerState?.[timerType].isRunning;
  const showScrollMessage = manyTasks || isTimerRunning;

  function handleUserInteraction(widgetName) {
    const prefName = `widgets.${widgetName}.interaction`;
    const hasInteracted = prefs[prefName];
    // we want to make sure that the value is a strict false (and that the property exists)
    if (hasInteracted === false) {
      dispatch(ac.SetPref(prefName, true));
    }
  }

  return (
    <div className="widgets-wrapper">
      <div className="widgets-container">
        {listsEnabled && (
          <Lists
            dispatch={dispatch}
            handleUserInteraction={handleUserInteraction}
          />
        )}
        {timerEnabled && (
          <FocusTimer
            dispatch={dispatch}
            handleUserInteraction={handleUserInteraction}
          />
        )}
      </div>
      {showScrollMessage && (
        <div className="widgets-scroll-message fade-in" aria-live="polite">
          <p data-l10n-id="newtab-widget-keep-scrolling"></p>
        </div>
      )}
      {messageData?.content?.messageType === "WidgetMessage" && (
        <MessageWrapper dispatch={dispatch}>
          <WidgetsFeatureHighlight dispatch={dispatch} />
        </MessageWrapper>
      )}
    </div>
  );
}

export { Widgets };
