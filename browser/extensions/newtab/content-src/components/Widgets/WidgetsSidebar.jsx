/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { useSelector } from "react-redux";
import { resolveSidebarWidget } from "common/WidgetsRegistry.mjs";
import { isSpaceOverridden, SPACE_IDS } from "common/PageLayoutVariants.mjs";
import { Weather as WeatherWidget } from "./Weather/Weather";
import { ErrorBoundary } from "content-src/components/ErrorBoundary/ErrorBoundary";
import { WIDGET_SIDEBAR_COMPONENTS } from "./WidgetsComponentRegistry.jsx";
import { WIDGET_LOCATIONS, WidgetLocationContext } from "./WidgetPlacement";

const PREF_WIDGETS_ENABLED = "widgets.enabled";
const PREF_NOVA_ENABLED = "nova.enabled";

function WidgetsSidebar({ dispatch }) {
  const prefs = useSelector(state => state.Prefs.values);
  const widgetsEnabled =
    prefs[PREF_WIDGETS_ENABLED] || isSpaceOverridden(SPACE_IDS.WIDGETS, prefs);
  const novaEnabled = prefs[PREF_NOVA_ENABLED];

  // Only one widget fits here: .sidebar-inline-end subgrids two rows of the
  // outer grid, and anything past that overflows into the .content-full-width
  // band below it. resolveSidebarWidget picks that one widget.
  const sidebarWidget = resolveSidebarWidget(prefs, widgetsEnabled);

  if (!sidebarWidget) {
    return null;
  }

  const inSidebar = widget => (
    <WidgetLocationContext.Provider value={WIDGET_LOCATIONS.SIDEBAR}>
      {widget}
    </WidgetLocationContext.Provider>
  );

  // Keyed so a widget swap gets a fresh ErrorBoundary.
  if (novaEnabled) {
    const Component = WIDGET_SIDEBAR_COMPONENTS[sidebarWidget.id];
    return Component
      ? inSidebar(
          <ErrorBoundary key={sidebarWidget.id}>
            <Component dispatch={dispatch} />
          </ErrorBoundary>
        )
      : null;
  }

  // @nova-cleanup: remove below
  if (sidebarWidget.id === "weather" && prefs.showWeather) {
    return inSidebar(
      <ErrorBoundary key="weather">
        <WeatherWidget dispatch={dispatch} size="small" />
      </ErrorBoundary>
    );
  }
  return null;
}

export { WidgetsSidebar };
