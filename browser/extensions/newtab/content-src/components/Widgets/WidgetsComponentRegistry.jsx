/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { useSelector } from "react-redux";
import { Lists } from "./Lists/Lists";
import { FocusTimer } from "./FocusTimer/FocusTimer";
import { Weather as WeatherWidget } from "./Weather/Weather";
import { SportsWidget } from "./SportsWidget/SportsWidget";
import { Clocks } from "./Clocks/Clocks";
import { WIDGET_REGISTRY, resolveWidgetSize } from "common/WidgetsRegistry.mjs";

const weatherEntry = WIDGET_REGISTRY.find(w => w.id === "weather");
const clocksEntry = WIDGET_REGISTRY.find(w => w.id === "clocks");

function WeatherRowWidget({ dispatch }) {
  const prefs = useSelector(state => state.Prefs.values);
  const weatherSize = resolveWidgetSize(weatherEntry, prefs);
  return <WeatherWidget dispatch={dispatch} size={weatherSize} />;
}

function WeatherSidebarWidget({ dispatch }) {
  const prefs = useSelector(state => state.Prefs.values);
  if (!prefs.showWeather) {
    return null;
  }
  return <WeatherWidget dispatch={dispatch} size="small" />;
}

function ClocksRowWidget({ dispatch }) {
  const prefs = useSelector(state => state.Prefs.values);
  const clocksSize = resolveWidgetSize(clocksEntry, prefs);
  return <Clocks dispatch={dispatch} size={clocksSize} />;
}

export const WIDGET_ROW_COMPONENTS = {
  lists: Lists,
  focusTimer: FocusTimer,
  weather: WeatherRowWidget,
  sportsWidget: SportsWidget,
  clocks: ClocksRowWidget,
};

export const WIDGET_SIDEBAR_COMPONENTS = {
  weather: WeatherSidebarWidget,
};
