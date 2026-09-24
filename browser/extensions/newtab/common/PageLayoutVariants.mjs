/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  hasContentAreaWidgets,
  isWidgetsContainerVisible,
} from "./WidgetsRegistry.mjs";

/**
 * Newtab page layout variants. "Page layout" is the arrangement of the whole
 * newtab page, not a DiscoveryStream layout (see SectionsLayoutFeed and
 * selectLayoutRender, which are unrelated).
 *
 * The pref holds the layout's name rather than a set of feature booleans, so a
 * new layout is a new value here instead of a new pref, class prefix and metric.
 * The value is what newtab.page_layout_variant reports.
 */
export const PAGE_LAYOUT_VARIANTS = {
  NOVA_FULL_WIDTH: "nova-full-width",
  SIDE_BY_SIDE_CONTENT_LEAD: "side-by-side-content-lead",
  SIDE_BY_SIDE_WIDGETS_LEAD: "side-by-side-widgets-lead",
  SIDE_BY_SIDE_CONTENT_LEAD_FIVE: "side-by-side-content-lead-five",
  SIDE_BY_SIDE_WIDGETS_LEAD_FIVE: "side-by-side-widgets-lead-five",
  SPACES_BUTTONS_TOP: "spaces-buttons-top",
  SPACES_BUTTONS_BOTTOM: "spaces-buttons-bottom",
  // @experiment(remove) { bug 2066527 }
  AUTO_MINIMIZE_WIDGETS: "auto-minimize-widgets",
};

export const DEFAULT_PAGE_LAYOUT_VARIANT = PAGE_LAYOUT_VARIANTS.NOVA_FULL_WIDTH;

/**
 * Band classes per side-by-side variant, keyed by variant name.
 *
 * Two orthogonal classes rather than the variant name itself, because CSS
 * matches classes per token: `.side-by-side-content-lead` would not match an
 * element classed `side-by-side-content-lead-five`, so every rule would need a
 * duplicate selector. The lead class carries the column order and every
 * side-by-side rule keys off it, so a variant and its -five counterpart share
 * one; side-by-side-five is what unlocks the fourth content card.
 *
 * "lead" is inline-start, so these stay correct in RTL.
 */
const SIDE_BY_SIDE_CLASSES = {
  [PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD]: [
    "side-by-side-content-lead",
  ],
  [PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD]: [
    "side-by-side-widgets-lead",
  ],
  [PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD_FIVE]: [
    "side-by-side-content-lead",
    "side-by-side-five",
  ],
  [PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD_FIVE]: [
    "side-by-side-widgets-lead",
    "side-by-side-five",
  ],
};

export const SIDE_BY_SIDE_PAGE_LAYOUTS = Object.keys(SIDE_BY_SIDE_CLASSES);

export const PREF_PAGE_LAYOUT_VARIANT = "pageLayouts.variant";

// @experiment(remove) { bug 2066527 }
export const PREF_AUTO_MINIMIZE_DELAY_MS = "pageLayouts.autoMinimizeDelayMs";
const DEFAULT_AUTO_MINIMIZE_DELAY_MS = 3000;

/**
 * Returns the assigned page layout variant, whether or not it can currently
 * render. This is the value telemetry reports.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string}
 */
export function resolvePageLayoutVariant(prefs) {
  const trainhop = prefs?.trainhopConfig?.pageLayouts?.variant;
  if (typeof trainhop === "string" && trainhop) {
    return trainhop;
  }
  return prefs?.[PREF_PAGE_LAYOUT_VARIANT] || DEFAULT_PAGE_LAYOUT_VARIANT;
}

// @experiment(remove) { bug 2066527 }
/**
 * Returns true if the auto-minimize-widgets variant is assigned.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isAutoMinimizeWidgetsAssigned(prefs) {
  return (
    resolvePageLayoutVariant(prefs) ===
    PAGE_LAYOUT_VARIANTS.AUTO_MINIMIZE_WIDGETS
  );
}

// @experiment(remove) { bug 2066527 }
/**
 * How long the widgets section stays expanded before it auto-collapses.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {number} delay in milliseconds
 */
export function resolveAutoMinimizeDelayMs(prefs) {
  const trainhop = prefs?.trainhopConfig?.pageLayouts?.autoMinimizeDelayMs;
  if (typeof trainhop === "number" && trainhop >= 0) {
    return trainhop;
  }
  const pref = prefs?.[PREF_AUTO_MINIMIZE_DELAY_MS];
  return typeof pref === "number" && pref >= 0
    ? pref
    : DEFAULT_AUTO_MINIMIZE_DELAY_MS;
}

/**
 * Returns the classes the content band needs for the assigned variant, or an
 * empty array outside the experiment.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string[]}
 */
export function sideBySideBandClasses(prefs) {
  return SIDE_BY_SIDE_CLASSES[resolvePageLayoutVariant(prefs)] ?? [];
}

/**
 * Returns true if a side-by-side variant is assigned, whether or not the page
 * can lay it out. The section panels key off this rather than isSideBySideActive,
 * so a lone section still gets its panel while in the experiment.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSideBySideAssigned(prefs) {
  return SIDE_BY_SIDE_PAGE_LAYOUTS.includes(resolvePageLayoutVariant(prefs));
}

/**
 * Returns true if a side-by-side variant is assigned and the page has both
 * things to put side by side. Without stories, or without a content-area widget,
 * the band falls back to its full-width single column.
 *
 * Use this rather than testing the variant directly, so the widgets gate stays
 * consistent with the rest of the page.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSideBySideActive(prefs) {
  return Boolean(
    SIDE_BY_SIDE_PAGE_LAYOUTS.includes(resolvePageLayoutVariant(prefs)) &&
    prefs?.["feeds.section.topstories"] &&
    prefs?.["feeds.system.topstories"] &&
    isWidgetsContainerVisible(prefs) &&
    hasContentAreaWidgets(prefs)
  );
}

// Orthogonal classes, for the same reason side-by-side uses them.
const SPACES_CLASSES = {
  [PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_TOP]: ["spaces", "spaces-buttons-top"],
  [PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_BOTTOM]: [
    "spaces",
    "spaces-buttons-bottom",
  ],
};

export const SPACES_PAGE_LAYOUTS = Object.keys(SPACES_CLASSES);

// Tablist order. Stories leads so an unaware user lands where they expect.
export const SPACE_IDS = {
  STORIES: "stories",
  WIDGETS: "widgets",
  // Backed by feeds.section.highlights, despite the name.
  ACTIVITY: "activity",
};

// Every space, in tablist order. The experiment turns a space on unless
// optOutPref says the user switched it off while enrolled; PrefsFeed mirrors
// !userPref into it on change, so enrollment itself leaves it alone. userPref
// is never written. feedGated means userPref also starts a feed, so PrefsFeed
// has to write its default too.
export const SPACE_CONFIG = {
  [SPACE_IDS.STORIES]: {
    trainhopKey: "stories",
    userPref: "feeds.section.topstories",
    optOutPref: "spaces.storiesOptOut",
  },
  [SPACE_IDS.WIDGETS]: {
    trainhopKey: "widgets",
    userPref: "widgets.enabled",
    optOutPref: "spaces.widgetsOptOut",
  },
  [SPACE_IDS.ACTIVITY]: {
    trainhopKey: "highlights",
    userPref: "feeds.section.highlights",
    optOutPref: "spaces.activityOptOut",
    feedGated: true,
  },
};

/**
 * Band classes for the assigned variant, empty outside the experiment.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string[]}
 */
export function spacesBandClasses(prefs) {
  return SPACES_CLASSES[resolvePageLayoutVariant(prefs)] ?? [];
}

/**
 * Whether a spaces variant is assigned, populated or not.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSpacesAssigned(prefs) {
  return SPACES_PAGE_LAYOUTS.includes(resolvePageLayoutVariant(prefs));
}

/**
 * Whether the experiment is currently forcing this space on, which it does for
 * a profile that had it switched off. Only ever true while enrolled, and never
 * a reason to ignore a choice made since.
 *
 * OR this with the pref a caller already reads, rather than replacing it:
 * `prefs[PREF_X] || isSpaceOverridden(...)` keeps the user's value visible at
 * the call site. Callers that read one of these prefs need it, or the space
 * renders empty and its customize-menu toggle contradicts the page.
 *
 * @param {string} id - a SPACE_IDS value
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSpaceOverridden(id, prefs) {
  const { trainhopKey, optOutPref } = SPACE_CONFIG[id];
  return Boolean(
    isSpacesAssigned(prefs) &&
    prefs?.trainhopConfig?.[trainhopKey]?.enabled &&
    !prefs?.[optOutPref]
  );
}

function isSpaceEnabled(id, prefs) {
  return (
    Boolean(prefs?.[SPACE_CONFIG[id].userPref]) || isSpaceOverridden(id, prefs)
  );
}

/**
 * Ids of the spaces that have content, in tablist order. Being enabled is not
 * enough for two of them, and no override crosses that floor -- an empty space
 * is worse than a missing one.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string[]}
 */
export function resolvePopulatedSpaces(prefs = {}) {
  return Object.values(SPACE_IDS).filter(id => {
    if (!isSpaceEnabled(id, prefs)) {
      return false;
    }
    if (id === SPACE_IDS.STORIES) {
      // Region and locale decide whether stories exist at all.
      return Boolean(prefs["feeds.system.topstories"]);
    }
    if (id === SPACE_IDS.WIDGETS) {
      // Ignoring the master toggle, which isSpaceEnabled already covered: is
      // any widget on that renders in the content area? Weather moves to the
      // sidebar at its small size, so a weather-only profile has nothing here.
      return hasContentAreaWidgets(prefs, true);
    }
    return true;
  });
}

/**
 * Whether spaces is assigned and has somewhere to navigate to. Below two spaces
 * the band falls back to stacking its sections.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSpacesActive(prefs) {
  return Boolean(
    // Every spaces style is scoped under .nova-enabled.
    prefs?.["nova.enabled"] &&
    isSpacesAssigned(prefs) &&
    resolvePopulatedSpaces(prefs).length > 1
  );
}
