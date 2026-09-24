/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector, batch } from "react-redux";
import { BaseContext } from "content-src/lib/BaseContext";
// Bug 2034542: these per-widget imports can be removed once the non-Nova render
// path (@nova-cleanup) is gone and all widgets render via WIDGET_ROW_COMPONENTS.
import { Lists } from "./Lists/Lists";
import { FocusTimer } from "./FocusTimer/FocusTimer";
import { WeatherForecast } from "./WeatherForecast/WeatherForecast";
import { Weather as WeatherWidget } from "./Weather/Weather";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";
import { WidgetsFeatureHighlight } from "../DiscoveryStreamComponents/FeatureHighlight/WidgetsFeatureHighlight";
import { WidgetsRowFeatureHighlight } from "../DiscoveryStreamComponents/FeatureHighlight/WidgetsRowFeatureHighlight";
import { OMCHighlightSlot } from "../DiscoveryStreamComponents/FeatureHighlight/OMCHighlightSlot";
import { SLOTS } from "../DiscoveryStreamComponents/FeatureHighlight/OMCHighlightSlots.mjs";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import {
  WIDGET_REGISTRY,
  isWidgetAddable,
  isWidgetEnabled,
  resolveWidgetSize,
  resolveWidgetOrder,
  resolveWidgetHasSidebar,
  getHideAllTargets,
} from "common/WidgetsRegistry.mjs";
import {
  isAutoMinimizeWidgetsAssigned,
  isSideBySideActive,
  isSpaceOverridden,
  isSpacesActive,
  resolveAutoMinimizeDelayMs,
  SPACE_IDS,
} from "common/PageLayoutVariants.mjs";
import { WIDGET_ROW_COMPONENTS } from "./WidgetsComponentRegistry.jsx";
import { WidgetWrapper } from "./WidgetWrapper";
import { ErrorBoundary } from "content-src/components/ErrorBoundary/ErrorBoundary";
import { useWidgetDnD } from "./useWidgetDnD.jsx";
import { usePageVisible } from "./usePageVisible.jsx";

const CONTAINER_ACTION_TYPES = {
  HIDE_ALL: "hide_all",
  CHANGE_SIZE_ALL: "change_size_all",
  CHANGE_ROW_VISIBILITY: "change_row_visibility",
  FEEDBACK: "feedback",
  // @experiment(remove) { bug 2066527 }
  AUTO_MINIMIZE: "auto_minimize",
};

const PREF_NOVA_ENABLED = "nova.enabled";
const PREF_WIDGETS_SYSTEM_WEATHER_FORECAST_ENABLED =
  "widgets.system.weatherForecast.enabled";
const PREF_WIDGETS_MAXIMIZED = "widgets.maximized";
const PREF_WIDGETS_SYSTEM_MAXIMIZED = "widgets.system.maximized";
const PREF_WIDGETS_ROW_EXPANDED = "widgets.row.expanded";
// @experiment(remove) { bug 2066527 }
const PREF_WIDGETS_AUTO_MINIMIZE_OVERRIDE = "widgets.autoMinimize.userOverride";
const PREF_WIDGETS_FEEDBACK_ENABLED = "widgets.feedback.enabled";
const PREF_WIDGETS_HIDE_ALL_TOAST_ENABLED = "widgets.hideAllToast.enabled";
const WIDGETS_FEEDBACK_URL =
  "https://support.mozilla.org/kb/firefox-new-tab-widgets";
// Safety net in case transitionend never fires. Keep this above the CSS
// height transition duration (--widget-size-transition-duration, 180ms).
const ROW_TOGGLE_HEIGHT_ANIMATION_FALLBACK_MS = 300;

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

function renderWeather({
  novaEnabled,
  weatherEnabled,
  weatherForecastEnabled,
  weatherSize,
  dispatch,
  handleUserInteraction,
  isMaximized,
  widgetsMayBeMaximized,
}) {
  if (novaEnabled) {
    return (
      weatherEnabled &&
      weatherSize !== "small" && (
        <WeatherWidget dispatch={dispatch} size={weatherSize || "medium"} />
      )
    );
  }
  return (
    weatherForecastEnabled && (
      <WeatherForecast
        dispatch={dispatch}
        handleUserInteraction={handleUserInteraction}
        isMaximized={isMaximized}
        widgetsMayBeMaximized={widgetsMayBeMaximized}
      />
    )
  );
}

// eslint-disable-next-line complexity, max-statements
function Widgets() {
  const prefs = useSelector(state => state.Prefs.values);
  const weatherData = useSelector(state => state.Weather);
  const { messageData } = useSelector(state => state.Messages);
  const timerType = useSelector(state => state.TimerWidget.timerType);
  const timerData = useSelector(state => state.TimerWidget);
  const sportsWidgetState = useSelector(
    state => state.SportsWidget?.widgetState
  );
  const dispatch = useDispatch();
  const { openWidgetsPanel } = useContext(BaseContext);

  const novaEnabled = prefs[PREF_NOVA_ENABLED];
  const isMaximized = prefs[PREF_WIDGETS_MAXIMIZED];
  const spacesActive = isSpacesActive(prefs);
  // A space is a full page of its own, so there is nothing to be conservative
  // about: widgets always show expanded and the row toggle is hidden.
  const rowExpanded = spacesActive || !!prefs[PREF_WIDGETS_ROW_EXPANDED];
  // @experiment(remove) { bug 2066527 }
  const autoMinimizeAssigned =
    novaEnabled && !spacesActive && isAutoMinimizeWidgetsAssigned(prefs);
  // Active until the user expands or collapses the section by hand; that
  // choice persists and returns the header button to its size toggle.
  const autoMinimizeActive =
    autoMinimizeAssigned && !prefs[PREF_WIDGETS_AUTO_MINIMIZE_OVERRIDE];
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  // Derived, so turning the variant off (DS Admin, a trainhop change) can't
  // leave the row stuck title-only with no control that reopens it.
  const sectionCollapsed = autoMinimizeActive && autoCollapsed;
  const autoMinimizeDelayMs = resolveAutoMinimizeDelayMs(prefs);
  const isPageVisible = usePageVisible();
  const nimbusMaximizedTrainhopEnabled =
    prefs.trainhopConfig?.widgets?.maximized;
  const feedbackEnabled =
    prefs.trainhopConfig?.widgets?.feedbackEnabled ||
    prefs[PREF_WIDGETS_FEEDBACK_ENABLED];
  const hideAllToastEnabled =
    prefs.trainhopConfig?.widgets?.hideAllToastEnabled ||
    prefs[PREF_WIDGETS_HIDE_ALL_TOAST_ENABLED];
  const feedbackUrl =
    prefs.trainhopConfig?.widgets?.feedbackUrl ?? WIDGETS_FEEDBACK_URL;
  const sideBySideActive = isSideBySideActive(prefs);
  // Side-by-side and spaces both put an add button in the section header where
  // the row size toggle would otherwise sit.
  const addButtonInHeader = sideBySideActive || spacesActive;
  const widgetsMayBeMaximized =
    nimbusMaximizedTrainhopEnabled || prefs[PREF_WIDGETS_SYSTEM_MAXIMIZED];
  // The row toggle resizes every widget at once, which a one-card-wide column has
  // no room for; that slot gets an add button instead. Per-widget "Change size"
  // still applies -- size is a row span, so medium and large are both one card wide.
  // @experiment(remove-conditional) { bug 2066527 }
  // Drop the autoMinimizeAssigned clause.
  const showWidgetsSizeToggle =
    !addButtonInHeader && (widgetsMayBeMaximized || autoMinimizeAssigned);

  // The experiment can show the Widgets space to someone who had the master
  // toggle off, and the panel must not then be empty.
  const widgetsEnabled =
    prefs["widgets.enabled"] || isSpaceOverridden(SPACE_IDS.WIDGETS, prefs);

  // Bug 2034542: these per-widget lookups and all the derived consts below
  // (listsEnabled, timerEnabled, weatherBase, weatherEnabled, weatherSize,
  // weatherGoesToSidebar, widgetEnabledMap) can be replaced with a single
  // registry-driven loop once weather's extra enabled conditions
  // (weatherData.initialized, isWeatherEnabled) are either folded into the
  // registry or handled inside the Weather component itself.
  const listsWidget = WIDGET_REGISTRY.find(w => w.id === "lists");
  const timerWidget = WIDGET_REGISTRY.find(w => w.id === "focusTimer");
  const weatherWidget = WIDGET_REGISTRY.find(w => w.id === "weather");

  const listsEnabled = isWidgetEnabled(listsWidget, prefs, widgetsEnabled);
  const timerEnabled = isWidgetEnabled(timerWidget, prefs, widgetsEnabled);

  // This weather forecast widget will only show when the following are true:
  // - The weather view is set to "detailed" (can be checked with the weather.display pref)
  // - Weather is displayed on New Tab (system.showWeather)
  // - The weather forecast widget is enabled (system.weatherForecast.enabled)
  // Note that if the view is set to "detailed" but the weather forecast widget is not enabled,
  // then the mini weather widget will display with the "detailed" view
  const weatherForecastSystemEnabled =
    prefs.trainhopConfig?.widgets?.weatherForecastEnabled ||
    prefs[PREF_WIDGETS_SYSTEM_WEATHER_FORECAST_ENABLED];

  const showDetailedView = prefs["weather.display"] === "detailed";

  // Check if weather is enabled (browser.newtabpage.activity-stream.showWeather)
  const { showWeather } = prefs;
  const systemShowWeather = prefs["system.showWeather"];
  const weatherExperimentEnabled = prefs.trainhopConfig?.weather?.enabled;
  const isWeatherEnabled =
    showWeather && (systemShowWeather || weatherExperimentEnabled);

  const weatherForecastEnabled =
    widgetsEnabled &&
    weatherForecastSystemEnabled &&
    showDetailedView &&
    weatherData?.initialized &&
    isWeatherEnabled;

  const weatherBase = isWidgetEnabled(weatherWidget, prefs, widgetsEnabled);
  const weatherEnabled =
    weatherBase && weatherData?.initialized && isWeatherEnabled;

  const weatherSize = resolveWidgetSize(weatherWidget, prefs);
  // Weather renders in the sidebar when its effective size is "small" AND the
  // sidebar placement is active. If a trainhopSidebar override sets hasSidebar
  // to false, weatherGoesToSidebar is false and the widget falls through to the
  // row here instead of disappearing.
  const weatherGoesToSidebar =
    resolveWidgetHasSidebar(weatherWidget, prefs) && weatherSize === "small";
  const widgetEnabledMap = {
    lists: listsEnabled,
    focusTimer: timerEnabled,
    weather: weatherEnabled && !weatherGoesToSidebar,
    sportsWidget: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "sportsWidget"),
      prefs,
      widgetsEnabled
    ),
    clocks: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "clocks"),
      prefs,
      widgetsEnabled
    ),
    privacy: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "privacy"),
      prefs,
      widgetsEnabled
    ),
    crossword: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "crossword"),
      prefs,
      widgetsEnabled
    ),
    stocks: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "stocks"),
      prefs,
      widgetsEnabled
    ),
    pictureOfTheDay: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "pictureOfTheDay"),
      prefs,
      widgetsEnabled
    ),
    recentSearches: isWidgetEnabled(
      WIDGET_REGISTRY.find(w => w.id === "recentSearches"),
      prefs,
      widgetsEnabled
    ),
  };

  const widgetOrder = resolveWidgetOrder(prefs);

  const {
    effectiveOrder,
    containerRef: widgetsContainerRef,
    getItemProps,
  } = useWidgetDnD({
    widgetOrder,
    prefs,
    dispatch,
    enabled: novaEnabled,
  });

  const anyWidgetInRow =
    WIDGET_REGISTRY.some(w => widgetEnabledMap[w.id]) ||
    (!novaEnabled && weatherForecastEnabled);

  const allWidgetsAdded = WIDGET_REGISTRY.filter(w =>
    isWidgetAddable(w, prefs)
  ).every(w => prefs[w.enabledPref]);

  const renderedWidgetSizes = WIDGET_REGISTRY.filter(
    w => widgetEnabledMap[w.id]
  ).map(w => resolveWidgetSize(w, prefs));
  const addButtonSize = renderedWidgetSizes.includes("large")
    ? "large"
    : "medium";

  // Widget size is "medium" only when maximize feature is enabled and widgets
  // are currently minimized. Otherwise defaults to "large".
  //
  // This is a row-level approximation, not a per-widget truth. Users can resize
  // widgets individually, so this single value will not reflect the real size of
  // every widget in the row. For accurate per-widget sizing, rely on each
  // widget's own change-size event (WIDGETS_USER_EVENT with user_action
  // "change_size", which carries the widget's real widget_size) as the source of
  // truth rather than this value.
  const widgetSize = widgetsMayBeMaximized && !isMaximized ? "medium" : "large";

  // track previous timerEnabled state to detect when it becomes disabled
  const prevTimerEnabledRef = useRef(timerEnabled);

  const rowToggleFromHeightRef = useRef(null);
  // @experiment(remove) { bug 2066527 }
  // The collapse target is CSS-driven (height: 0). Measuring it after the
  // attribute lands flushes layout at zero and the transition then never
  // starts, so the collapse passes its target here instead.
  const rowToggleToHeightRef = useRef(null);

  useLayoutEffect(() => {
    const fromHeight = rowToggleFromHeightRef.current;
    const knownToHeight = rowToggleToHeightRef.current;
    rowToggleFromHeightRef.current = null;
    rowToggleToHeightRef.current = null;
    const container = widgetsContainerRef.current;
    if (fromHeight === null || !container) {
      return undefined;
    }
    const toHeight = knownToHeight ?? container.getBoundingClientRect().height;
    if (fromHeight === toHeight) {
      return undefined;
    }
    container.style.height = `${fromHeight}px`;
    container.classList.add("is-animating-height");
    // Commit the start height before transitioning to the target.
    void container.offsetHeight;
    container.style.height = `${toHeight}px`;

    let fallbackTimer;
    // Invoked from transitionend/transitioncancel (with an event), from the
    // fallback timer, or as the effect cleanup (no event). Ignore events
    // bubbling up from child widgets; the container only transitions height,
    // so its own events need no propertyName check.
    const finishRowHeightAnimation = e => {
      if (e && e.target !== container) {
        return;
      }
      globalThis.clearTimeout(fallbackTimer);
      container.style.height = "";
      container.classList.remove("is-animating-height");
      container.removeEventListener("transitionend", finishRowHeightAnimation);
      container.removeEventListener(
        "transitioncancel",
        finishRowHeightAnimation
      );
    };
    container.addEventListener("transitionend", finishRowHeightAnimation);
    container.addEventListener("transitioncancel", finishRowHeightAnimation);
    fallbackTimer = globalThis.setTimeout(
      finishRowHeightAnimation,
      ROW_TOGGLE_HEIGHT_ANIMATION_FALLBACK_MS
    );
    return finishRowHeightAnimation;
    // widgetsContainerRef is a stable ref from useWidgetDnD; listed to satisfy
    // exhaustive-deps, its identity never changes so only rowExpanded reruns this.
  }, [rowExpanded, sectionCollapsed, widgetsContainerRef]);

  // @experiment(remove) { bug 2066527 }
  // Gated on isPageVisible because new tabs are preloaded and render while
  // hidden, so a mount-time timer would spend itself before the user looked.
  useEffect(() => {
    if (
      !autoMinimizeActive ||
      autoCollapsed ||
      !isPageVisible ||
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    ) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      const container = widgetsContainerRef.current;
      // Collapsing sends the container inert, which would drop the caret out
      // of whatever the user is using. Focus in the row is engagement anyway.
      if (container?.contains(globalThis.document?.activeElement)) {
        return;
      }
      rowToggleFromHeightRef.current =
        container?.getBoundingClientRect().height ?? null;
      rowToggleToHeightRef.current = 0;
      setAutoCollapsed(true);
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_CONTAINER_ACTION,
          data: {
            action_type: CONTAINER_ACTION_TYPES.AUTO_MINIMIZE,
            action_value: "collapse_section",
            widget_size: widgetSize,
          },
        })
      );
    }, autoMinimizeDelayMs);
    return () => globalThis.clearTimeout(timer);
  }, [
    autoMinimizeActive,
    autoCollapsed,
    autoMinimizeDelayMs,
    isPageVisible,
    dispatch,
    widgetSize,
    widgetsContainerRef,
  ]);

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

  function hideAllWidgets() {
    batch(() => {
      const targets = getHideAllTargets(prefs, widgetEnabledMap);
      for (const target of targets) {
        dispatch(ac.SetPref(target.enabledPref, false));
      }
      // @nova-cleanup(remove-conditional): Remove the !novaEnabled guard and this branch
      if (!novaEnabled && weatherForecastEnabled) {
        dispatch(ac.SetPref("showWeather", false));
      }

      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_HIDE_ALL,
          data: { targets, widget_size: widgetSize },
        })
      );
      // @nova-cleanup(remove-conditional): Remove once weatherForecastEnabled path is removed
      if (!novaEnabled && weatherForecastEnabled) {
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_ENABLED,
            data: {
              widget_name: "weather",
              widget_source: "widget",
              enabled: false,
              widget_size: widgetSize,
            },
          })
        );
      }

      if (hideAllToastEnabled) {
        dispatch(
          ac.OnlyToOneContent(
            {
              type: at.SHOW_TOAST_MESSAGE,
              data: { toastId: "hideWidgetsToast", showNotifications: true },
            },
            "ActivityStream:Content"
          )
        );
      }
    });
  }

  function handleHideAllWidgetsClick(e) {
    e.preventDefault();
    hideAllWidgets();
  }

  function handleHideAllWidgetsKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hideAllWidgets();
    }
  }

  function toggleMaximize() {
    const newMaximizedState = !isMaximized;
    const newWidgetSize =
      widgetsMayBeMaximized && !newMaximizedState ? "medium" : "large";

    // Batch into one SET_MULTIPLE_PREFS so the sizes return in a single broadcast,
    // not one staggered round-trip per widget.
    const prefUpdates = { [PREF_WIDGETS_MAXIMIZED]: newMaximizedState };

    // When Nova is enabled, treat the shared header control as a toggle
    // between the default/full widget presentation and the compact one.
    // Only widgets actually rendered in the sidebar are skipped — that is the
    // same hasSidebar + size === "small" test used in WidgetsSidebar and by
    // weatherGoesToSidebar above, not "any small widget". A "small" widget
    // sitting in the row is resized along with the others so it isn't left
    // behind by the row toggle. On minimize such a widget lands at "medium"
    // rather than returning to "small", since the size pref holds the display
    // state directly and the pre-maximize size isn't retained.
    if (novaEnabled) {
      const targetSize = newMaximizedState ? "large" : "medium";
      for (const widget of WIDGET_REGISTRY) {
        const inSidebar =
          resolveWidgetHasSidebar(widget, prefs) &&
          resolveWidgetSize(widget, prefs) === "small";
        if (!inSidebar) {
          prefUpdates[widget.sizePref] = targetSize;
        }
      }
    }

    const telemetryData = {
      action_type: CONTAINER_ACTION_TYPES.CHANGE_SIZE_ALL,
      action_value: newMaximizedState ? "maximize_widgets" : "minimize_widgets",
      widget_size: newWidgetSize,
    };

    batch(() => {
      dispatch(ac.SetMultiplePrefs(prefUpdates));
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_CONTAINER_ACTION,
          data: telemetryData,
        })
      );
    });
  }

  function handleToggleMaximizeClick(e) {
    e.preventDefault();
    toggleMaximize();
  }

  function handleToggleMaximizeKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleMaximize();
    }
  }

  function handleManageWidgetsClick(e) {
    e.preventDefault();
    openWidgetsPanel();
  }

  function toggleRowExpanded() {
    const next = !rowExpanded;
    const container = widgetsContainerRef.current;
    const prefersReducedMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    if (container && !prefersReducedMotion) {
      rowToggleFromHeightRef.current = container.getBoundingClientRect().height;
    }
    batch(() => {
      dispatch(ac.SetPref(PREF_WIDGETS_ROW_EXPANDED, next));
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_CONTAINER_ACTION,
          data: {
            action_type: CONTAINER_ACTION_TYPES.CHANGE_ROW_VISIBILITY,
            action_value: next ? "expand_row" : "collapse_row",
            widget_size: widgetSize,
          },
        })
      );
    });
  }

  function handleToggleRowExpandedClick(e) {
    e.preventDefault();
    toggleRowExpanded();
  }

  // @experiment(remove) { bug 2066527 }
  // Expanding by hand ends the experiment for this profile: the timer stops
  // running and the header button goes back to toggling widget size.
  function expandAutoMinimizedSection() {
    rowToggleFromHeightRef.current =
      widgetsContainerRef.current?.getBoundingClientRect().height ?? null;
    setAutoCollapsed(false);
    batch(() => {
      dispatch(ac.SetPref(PREF_WIDGETS_AUTO_MINIMIZE_OVERRIDE, true));
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_CONTAINER_ACTION,
          data: {
            action_type: CONTAINER_ACTION_TYPES.AUTO_MINIMIZE,
            action_value: "expand_section",
            widget_size: widgetSize,
          },
        })
      );
    });
  }

  function handleExpandAutoMinimizedClick(e) {
    e.preventDefault();
    expandAutoMinimizedSection();
  }

  function handleExpandAutoMinimizedKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      expandAutoMinimizedSection();
    }
  }

  function handleFeedbackClick(e) {
    e.preventDefault();
    batch(() => {
      dispatch(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: {
            url: feedbackUrl,
            ...(novaEnabled ? { where: "tab" } : {}),
          },
        })
      );
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_CONTAINER_ACTION,
          data: {
            action_type: CONTAINER_ACTION_TYPES.FEEDBACK,
            widget_size: widgetSize,
          },
        })
      );
    });
  }

  function handleUserInteraction(widgetName) {
    const prefName = `widgets.${widgetName}.interaction`;
    const hasInteracted = prefs[prefName];
    // we want to make sure that the value is a strict false (and that the property exists)
    if (hasInteracted === false) {
      dispatch(ac.SetPref(prefName, true));
    }
  }

  function renderWidgetsTitle() {
    if (!novaEnabled) {
      return <h1 data-l10n-id="newtab-widget-section-title"></h1>;
    }

    const sizeToggleL10nId = isMaximized
      ? "newtab-widget-section-minimize"
      : "newtab-widget-section-maximize";
    // @experiment(remove-conditional) { bug 2066527 }
    // Drop the autoMinimizeActive branches here and on the handlers below.
    const headerToggleL10nId = autoMinimizeActive
      ? "newtab-widget-section-show-widgets"
      : sizeToggleL10nId;

    return (
      <div className="widgets-title-heading">
        <h1 data-l10n-id="newtab-widget-section-title"></h1>
        {showWidgetsSizeToggle ? (
          <moz-button
            id="toggle-widgets-size-button"
            className={`widgets-expand-button${isMaximized ? " is-maximized" : ""}`}
            size="small"
            data-l10n-id={headerToggleL10nId}
            iconsrc="chrome://global/skin/icons/arrow-down.svg"
            onClick={
              autoMinimizeActive
                ? handleExpandAutoMinimizedClick
                : handleToggleMaximizeClick
            }
            onKeyDown={
              autoMinimizeActive
                ? handleExpandAutoMinimizedKeyDown
                : handleToggleMaximizeKeyDown
            }
          />
        ) : null}
        {addButtonInHeader ? (
          <moz-button
            id="add-widgets-button"
            size="small"
            data-l10n-id="newtab-widget-add-widgets-button"
            iconsrc="chrome://global/skin/icons/plus.svg"
            onClick={handleManageWidgetsClick}
          />
        ) : null}
      </div>
    );
  }

  function renderWidgetsActions() {
    if (novaEnabled) {
      return (
        <div className="widgets-header-context-menu">
          <moz-button
            className="widgets-header-context-menu-button"
            data-l10n-id="newtab-widget-section-menu-button"
            iconSrc="chrome://global/skin/icons/more.svg"
            menuId="widgets-header-context-panel"
            type="ghost"
            size="default"
          />
          <panel-list
            className="panel-list-no-icons"
            id="widgets-header-context-panel"
          >
            <panel-item
              data-l10n-id="newtab-widget-section-menu-hide-all"
              onClick={handleHideAllWidgetsClick}
            />
            <panel-item
              data-l10n-id="newtab-widget-section-menu-manage"
              onClick={handleManageWidgetsClick}
            />
            <panel-item
              data-l10n-id="newtab-widget-section-menu-learn-more"
              onClick={handleFeedbackClick}
            />
          </panel-list>
        </div>
      );
    }

    return (
      <>
        {showWidgetsSizeToggle ? (
          <moz-button
            id="toggle-widgets-size-button"
            type="icon ghost"
            size="small"
            data-l10n-id={
              isMaximized
                ? "newtab-widget-section-minimize"
                : "newtab-widget-section-maximize"
            }
            iconsrc={`chrome://browser/skin/${isMaximized ? "fullscreen-exit" : "fullscreen"}.svg`}
            onClick={handleToggleMaximizeClick}
            onKeyDown={handleToggleMaximizeKeyDown}
          />
        ) : null}
        <moz-button
          id="hide-all-widgets-button"
          type="icon ghost"
          size="small"
          data-l10n-id="newtab-widget-section-hide-all-button"
          iconsrc="chrome://global/skin/icons/close.svg"
          onClick={handleHideAllWidgetsClick}
          onKeyDown={handleHideAllWidgetsKeyDown}
        />
      </>
    );
  }

  if (!anyWidgetInRow) {
    return null;
  }

  // CSS container queries on the widgets section decide whether the toggle
  // button is shown — see _Widgets.scss. The collapsed row holds one widget
  // per card-column slot regardless of size, so for each card-column count
  // (1–5) anything past the first N positions overflows. This keeps mediums
  // to a single (shorter) row rather than stacking them two-deep to fill a
  // large-height band. The matching `data-overflow-N` attribute is read by
  // the @container rules in CSS.
  const enabledWidgetIds = [];
  // Use effectiveOrder (matches the render loop) so optimistic reorders aren't briefly mis-hidden.
  for (const id of effectiveOrder) {
    if (!WIDGET_ROW_COMPONENTS[id] || !widgetEnabledMap[id]) {
      continue;
    }
    enabledWidgetIds.push(id);
  }
  const widgetCount = enabledWidgetIds.length;
  const overflowsAt = cols => widgetCount > cols;
  // For each viewport (cols 1–4), returns the set of widget render indices
  // that would be clipped when the row is collapsed: everything past the
  // first `cols` slots. CSS keys off the matching `data-hidden-N` to make
  // them tab-out and a11y-hide at that viewport.
  const hiddenIndicesAt = cols => {
    const set = new Set();
    for (let i = cols; i < widgetCount; i++) {
      set.add(i);
    }
    return set;
  };
  const hiddenAtCols = {
    1: hiddenIndicesAt(1),
    2: hiddenIndicesAt(2),
    3: hiddenIndicesAt(3),
    4: hiddenIndicesAt(4),
    5: hiddenIndicesAt(5),
  };
  const overflowAttrs = {
    "data-overflow-1": overflowsAt(1) ? "" : undefined,
    "data-overflow-2": overflowsAt(2) ? "" : undefined,
    "data-overflow-3": overflowsAt(3) ? "" : undefined,
    "data-overflow-4": overflowsAt(4) ? "" : undefined,
    "data-overflow-5": overflowsAt(5) ? "" : undefined,
  };
  const isCollapsed = novaEnabled && !rowExpanded;

  return (
    <div className="widgets-wrapper">
      <div className="widgets-section-container" {...overflowAttrs}>
        <div className="widgets-title-container">
          <div className="widgets-title-container-text">
            {renderWidgetsTitle()}
            {messageData?.content?.messageType === "WidgetMessage" && (
              <MessageWrapper dispatch={dispatch}>
                <WidgetsFeatureHighlight dispatch={dispatch} />
              </MessageWrapper>
            )}
          </div>

          <div className="widgets-title-actions">{renderWidgetsActions()}</div>
        </div>
        {novaEnabled && (
          <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={dispatch} />
        )}
        <div
          id="widgets-container"
          ref={widgetsContainerRef}
          className={`widgets-container${isMaximized ? " is-maximized" : ""}`}
          data-row-collapsed={isCollapsed ? "" : undefined}
          data-section-collapsed={sectionCollapsed ? "" : undefined}
          inert={sectionCollapsed}
        >
          {effectiveOrder.map(id => {
            if (novaEnabled) {
              const Component = WIDGET_ROW_COMPONENTS[id];
              if (!Component || !widgetEnabledMap[id]) {
                return null;
              }
              const entry = WIDGET_REGISTRY.find(w => w.id === id);
              let size = entry ? resolveWidgetSize(entry, prefs) : null;
              // The follow-teams panel needs the larger grid cell to fit its content,
              // so we override the user's size pref while that state is active.
              if (
                id === "sportsWidget" &&
                sportsWidgetState === "sports-follow-state"
              ) {
                size = "large";
              }
              const renderIdx = enabledWidgetIds.indexOf(id);
              const hiddenAttrs = {
                "data-hidden-1": hiddenAtCols[1].has(renderIdx)
                  ? ""
                  : undefined,
                "data-hidden-2": hiddenAtCols[2].has(renderIdx)
                  ? ""
                  : undefined,
                "data-hidden-3": hiddenAtCols[3].has(renderIdx)
                  ? ""
                  : undefined,
                "data-hidden-4": hiddenAtCols[4].has(renderIdx)
                  ? ""
                  : undefined,
                "data-hidden-5": hiddenAtCols[5].has(renderIdx)
                  ? ""
                  : undefined,
              };
              const wrapperClassName = [
                size && `${size}-widget`,
                "widget-draggable",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <WidgetWrapper
                  key={id}
                  className={wrapperClassName}
                  data-widget-id={id}
                  {...hiddenAttrs}
                  {...getItemProps(id)}
                >
                  {/* Contain a crash to this widget's cell so one failing
                      widget can't tear down the whole widgets section. */}
                  <ErrorBoundary className="widget-error-fallback">
                    <Component
                      dispatch={dispatch}
                      handleUserInteraction={handleUserInteraction}
                      isMaximized={isMaximized}
                      widgetsMayBeMaximized={widgetsMayBeMaximized}
                      widgetEnabledMap={widgetEnabledMap}
                    />
                  </ErrorBoundary>
                </WidgetWrapper>
              );
            }
            // @nova-cleanup: remove below
            return (
              <React.Fragment key={id}>
                {id === "lists" && listsEnabled && (
                  <ErrorBoundary className="widget-error-fallback">
                    <Lists
                      dispatch={dispatch}
                      handleUserInteraction={handleUserInteraction}
                      isMaximized={isMaximized}
                      widgetsMayBeMaximized={widgetsMayBeMaximized}
                    />
                  </ErrorBoundary>
                )}
                {id === "focusTimer" && timerEnabled && (
                  <ErrorBoundary className="widget-error-fallback">
                    <FocusTimer
                      dispatch={dispatch}
                      handleUserInteraction={handleUserInteraction}
                      isMaximized={isMaximized}
                      widgetsMayBeMaximized={widgetsMayBeMaximized}
                    />
                  </ErrorBoundary>
                )}
                {id === "weather" && weatherForecastEnabled && (
                  <ErrorBoundary className="widget-error-fallback">
                    {renderWeather({
                      novaEnabled,
                      weatherEnabled,
                      weatherForecastEnabled,
                      weatherSize,
                      dispatch,
                      handleUserInteraction,
                      isMaximized,
                      widgetsMayBeMaximized,
                    })}
                  </ErrorBoundary>
                )}
              </React.Fragment>
            );
          })}
          {/* Side-by-side has its own add button in the section header, and
              this tile's at-content-cols() reveal rules resolve against the
              band rather than the one-card-wide widgets column. */}
          {novaEnabled && !sideBySideActive && !allWidgetsAdded && (
            <button
              type="button"
              className={`widgets-add-button col-4 ${addButtonSize}-widget`}
              style={{ order: WIDGET_REGISTRY.length + 1 }}
              data-l10n-id="newtab-widget-add-widgets-button"
              onClick={handleManageWidgetsClick}
              tabIndex={-1}
            >
              <span className="widgets-add-button-icon" />
            </button>
          )}
        </div>
        {novaEnabled && !spacesActive && (
          <moz-button
            className="widgets-row-toggle"
            type="muted"
            size="small"
            aria-expanded={rowExpanded}
            aria-controls="widgets-container"
            onClick={handleToggleRowExpandedClick}
            data-l10n-id={
              rowExpanded
                ? "newtab-widget-section-show-less"
                : "newtab-widget-section-show-more"
            }
          />
        )}
        {messageData?.content?.messageType === "NovaWidgetMessage" && (
          <div className="widgets-row-highlight-anchor">
            <MessageWrapper dispatch={dispatch}>
              <WidgetsRowFeatureHighlight dispatch={dispatch} />
            </MessageWrapper>
          </div>
        )}
        {feedbackEnabled && !novaEnabled && (
          <a
            className="widgets-feedback-link"
            href={feedbackUrl}
            data-l10n-id="newtab-widget-section-feedback"
            onClick={handleFeedbackClick}
          />
        )}
      </div>
    </div>
  );
}

export { Widgets };
