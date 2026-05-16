/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// @nova-cleanup(move-directory): Move to components/CustomizeMenu/WidgetsManagementPanel/ after Nova ships

import React, { useEffect, useRef } from "react";
import { batch, useDispatch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
// eslint-disable-next-line no-shadow
import { CSSTransition } from "react-transition-group";

function WidgetsManagementPanel({
  exitEventFired,
  onSubpanelToggle,
  togglePanel,
  showPanel,
  enabledSections,
  enabledWidgets,
  mayHaveWeather,
  mayHaveTimerWidget,
  mayHaveListsWidget,
  mayHaveWeatherForecast,
  weatherDisplay,
  setPref,
}) {
  const arrowButtonRef = useRef(null);
  const panelRef = useRef(null);
  const dispatch = useDispatch();

  // Close widget subpanel when parent menu is closed
  useEffect(() => {
    if (exitEventFired && showPanel) {
      togglePanel();
    }
  }, [exitEventFired, showPanel, togglePanel]);

  // Notify parent menu when subpanel opens/closes
  useEffect(() => {
    if (onSubpanelToggle) {
      onSubpanelToggle(showPanel);
    }
  }, [showPanel, onSubpanelToggle]);

  const handlePanelEntered = () => {
    arrowButtonRef.current?.focus();
  };

  const onToggleWidget = e => {
    const { preference, eventSource } = e.target.dataset;
    const value = e.target.pressed;

    batch(() => {
      dispatch(
        ac.UserEvent({
          event: "PREF_CHANGED",
          source: eventSource,
          value: { status: value, menu_source: "CUSTOMIZE_MENU" },
        })
      );

      let widgetName;
      switch (eventSource) {
        case "WEATHER":
          widgetName = "weather";
          break;
        case "WIDGET_LISTS":
          widgetName = "lists";
          break;
        case "WIDGET_TIMER":
          widgetName = "focus_timer";
          break;
      }

      if (widgetName) {
        const { widgetsMaximized, widgetsMayBeMaximized } = enabledWidgets;

        let widgetSize;
        if (widgetName === "weather") {
          if (mayHaveWeatherForecast && weatherDisplay === "detailed") {
            widgetSize =
              widgetsMayBeMaximized && !widgetsMaximized ? "small" : "medium";
          } else {
            widgetSize = "mini";
          }
        } else {
          widgetSize =
            widgetsMayBeMaximized && !widgetsMaximized ? "small" : "medium";
        }

        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_ENABLED,
            data: {
              widget_name: widgetName,
              widget_source: "customize_panel",
              enabled: value,
              widget_size: widgetSize,
            },
          })
        );
      }

      setPref(preference, value);
    });
  };

  const { weatherEnabled } = enabledSections;
  const { timerEnabled, listsEnabled } = enabledWidgets;
  const isRTL = typeof document !== "undefined" && document.dir === "rtl";
  const arrowIconSrc = `chrome://global/skin/icons/shaft-arrow-${isRTL ? "right" : "left"}.svg`;

  return (
    <div id="widgets-management-panel" className="widgets-mgmt-panel-container">
      <moz-box-button
        onClick={togglePanel}
        data-l10n-id="newtab-widget-manage-widget-button"
      ></moz-box-button>
      <CSSTransition
        nodeRef={panelRef}
        in={showPanel}
        timeout={300}
        classNames="widgets-mgmt-panel"
        unmountOnExit={true}
        onEntered={handlePanelEntered}
      >
        <div ref={panelRef} className="widgets-mgmt-panel">
          <div className="panel-content">
            <div className="arrow-wrapper">
              <moz-button
                ref={arrowButtonRef}
                type="ghost"
                className="arrow-button"
                iconSrc={arrowIconSrc}
                onClick={togglePanel}
              ></moz-button>
              <h2 data-l10n-id="newtab-widget-manage-title"></h2>
            </div>
            <div className="settings-widgets">
              {mayHaveWeather && (
                <div id="weather-section" className="section">
                  {/** @backward-compat { version 150 } React 16 (cached page) uses ontoggle; React 19 uses onToggle. Remove onToggle once Firefox 150 reaches Release. */}
                  <moz-toggle
                    id="weather-toggle"
                    pressed={weatherEnabled || null}
                    ontoggle={onToggleWidget}
                    onToggle={onToggleWidget}
                    data-preference="widgets.weather.enabled"
                    data-event-source="WEATHER"
                    data-l10n-id="newtab-custom-widget-weather-toggle"
                  />
                </div>
              )}
              {mayHaveTimerWidget && (
                <div id="timer-widget-section" className="section">
                  {/** @backward-compat { version 150 } React 16 (cached page) uses ontoggle; React 19 uses onToggle. Remove onToggle once Firefox 150 reaches Release. */}
                  <moz-toggle
                    id="timer-toggle"
                    pressed={timerEnabled || null}
                    ontoggle={onToggleWidget}
                    onToggle={onToggleWidget}
                    data-preference="widgets.focusTimer.enabled"
                    data-event-source="WIDGET_TIMER"
                    data-l10n-id="newtab-custom-widget-timer-toggle"
                  />
                </div>
              )}
              {mayHaveListsWidget && (
                <div id="lists-widget-section" className="section">
                  {/** @backward-compat { version 150 } React 16 (cached page) uses ontoggle; React 19 uses onToggle. Remove onToggle once Firefox 150 reaches Release. */}
                  <moz-toggle
                    id="lists-toggle"
                    pressed={listsEnabled || null}
                    ontoggle={onToggleWidget}
                    onToggle={onToggleWidget}
                    data-preference="widgets.lists.enabled"
                    data-event-source="WIDGET_LISTS"
                    data-l10n-id="newtab-custom-widget-lists-toggle"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </CSSTransition>
    </div>
  );
}

export { WidgetsManagementPanel };
