/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CUSTOMIZE_SUBPANELS } from "./constants.mjs";

const THEME_PICKER_TAG = "theme-picker";

// Stands in for the previous props when CustomizeMenu mounts.
export const PANEL_HIDDEN = Object.freeze({ showing: false });

// Only the most recent request for an element counts once the element is
// defined; an earlier request that resolves later is dropped.
const latestRequest = new WeakMap();

export function isRootPanelVisible(props) {
  return Boolean(props.showing && !props.activeSubpanel);
}

export function isThemesPanelVisible(props) {
  return Boolean(
    props.showing && props.activeSubpanel === CUSTOMIZE_SUBPANELS.THEMES
  );
}

const PICKERS = [
  [isRootPanelVisible, "compact"],
  [isThemesPanelVisible, "full"],
];

// React writes `layout` as an attribute while the element is still undefined
// and as a property once it is defined, and lit does not reflect it back, so
// check both.
function findPicker(dialog, layout) {
  for (const el of dialog.querySelectorAll(THEME_PICKER_TAG)) {
    if ((el.layout ?? el.getAttribute("layout")) === layout) {
      return el;
    }
  }
  return null;
}

/**
 * Tells a toolkit theme picker it is visible, which makes it record shown
 * telemetry. The element module loads lazily on the first open. By the time
 * the element is defined the panel may have closed or moved to a subpanel,
 * which is why the caller confirms the picker is still on screen.
 */
export async function notifyThemePickerShown(el, isStillVisible = () => true) {
  if (!el) {
    return;
  }
  const request = {};
  latestRequest.set(el, request);
  await customElements.whenDefined(THEME_PICKER_TAG);
  if (latestRequest.get(el) !== request) {
    return;
  }
  if (!el.isConnected || !isStillVisible()) {
    return;
  }
  /**
   * @backward-compat { version 157 }
   * Firefox 155 and 156 have the theme-picker element but no shown(), so they
   * record no shown telemetry. Remove this check once 157 reaches Release.
   */
  if (typeof el.shown !== "function") {
    return;
  }
  el.shown();
}

export function notifyThemePickersOnTransition(
  dialog,
  prevProps,
  getCurrentProps
) {
  if (!dialog) {
    return;
  }
  const props = getCurrentProps();
  for (const [isVisible, layout] of PICKERS) {
    if (!isVisible(prevProps) && isVisible(props)) {
      notifyThemePickerShown(findPicker(dialog, layout), () =>
        isVisible(getCurrentProps())
      );
    }
  }
}
