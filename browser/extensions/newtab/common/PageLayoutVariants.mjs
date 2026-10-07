/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  hasContentAreaWidgets,
  isWidgetEnabled,
  isWidgetsContainerVisible,
  WIDGET_REGISTRY,
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
  SPACES_THEMATIC_V1: "spaces-thematic-v1",
  // @experiment(remove) { bug 2066527 }
  AUTO_MINIMIZE_WIDGETS: "auto-minimize-widgets",
  // @experiment(remove) { bug 2069496 }
  WIDGETS_AD_LARGE: "widgets-ad-large",
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

// Orthogonal classes, for the same reason side-by-side uses them.
const SPACES_CLASSES = {
  [PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_TOP]: ["spaces", "spaces-buttons-top"],
  [PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_BOTTOM]: [
    "spaces",
    "spaces-buttons-bottom",
  ],
  // Reuses the buttons-bottom control, which is where the comps put it. Not the
  // side-by-side lead class: those band rules would fire on the band itself, and
  // here the pair is inside a panel.
  [PAGE_LAYOUT_VARIANTS.SPACES_THEMATIC_V1]: [
    "spaces",
    "spaces-buttons-bottom",
    "spaces-thematic",
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

export const PREF_SPACES_CONFIG = "pageLayouts.spacesConfig";

// Where the Firefox Profiles avatar icons live. Those are a filled background
// circle plus a knocked-out glyph, so they need the opposite fill and stroke
// treatment to an ordinary toolbar glyph; the path is what tells them apart.
const PROFILE_AVATAR_ICON_PATH = "chrome://browser/content/profiles/assets/";

/**
 * A config-supplied icon URL, or undefined for anything that is not a chrome
 * URL. Not a safety check against markup -- an <img> cannot execute -- but
 * about:newtab makes no third-party requests, and an https URL in a recipe
 * would have it fetch one. A rejected or broken URL leaves the tab with just
 * its label.
 *
 * @param {string} url - a chrome:// URL from the config
 * @returns {string|undefined}
 */
export function resolveThematicSpaceIcon(url) {
  return typeof url === "string" && url.startsWith("chrome://")
    ? url
    : undefined;
}

/**
 * Which icon family a URL belongs to, so the stylesheet can paint it. "avatar"
 * for the Profiles set, "glyph" for everything else.
 *
 * @param {string|undefined} url - a resolved icon URL
 * @returns {string|undefined}
 */
function resolveThematicIconFamily(url) {
  if (!url) {
    return undefined;
  }
  return url.startsWith(PROFILE_AVATAR_ICON_PATH) ? "avatar" : "glyph";
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
}

/**
 * Says why a config was thrown out, so whoever wrote the recipe or the pref
 * finds out rather than watching a layout quietly not appear. Reported here
 * because this is where the shape is understood; callers just get null.
 *
 * @param {*} raw - the config that was rejected
 * @returns {null}
 */
function rejectSpacesConfig(raw) {
  console.error(
    "Thematic spaces config rejected, so the layout will not render. It needs " +
      "an `order` array of ids and a `spaces` object giving each of them a " +
      "label.",
    raw
  );
  return null;
}

/**
 * Normalises a raw config into what the resolvers below expect, or null when it
 * cannot render. Nothing is merged with the default: a config either stands on
 * its own or is discarded, so a recipe is never half-applied. A space that is
 * unusable is dropped and the rest still render; only a missing order, missing
 * spaces, or nothing left after dropping kills the layout.
 *
 * @param {object} raw - a spaces config from trainhopConfig or the pref
 * @returns {object|null} { order, default, spaces } or null
 */
export function normalizeSpacesConfig(raw) {
  const order = asStringArray(raw?.order);
  const rawSpaces = raw?.spaces;
  if (!order.length || !rawSpaces || typeof rawSpaces !== "object") {
    return rejectSpacesConfig(raw);
  }

  const spaces = {};
  const kept = order.filter(id => {
    const space = rawSpaces[id];
    // A tab with no label is unusable: nothing tells the user what is behind it.
    if (!space || typeof space.label !== "string" || !space.label) {
      return false;
    }
    const icon = resolveThematicSpaceIcon(space.icon);
    spaces[id] = {
      label: space.label,
      icon,
      iconFamily: resolveThematicIconFamily(icon),
      sections: asStringArray(space.sections),
      widgets: asStringArray(space.widgets),
    };
    return true;
  });

  if (!kept.length) {
    return rejectSpacesConfig(raw);
  }

  return {
    order: kept,
    // The named default has to have survived; otherwise the leftmost space
    // takes both roles, including the catch-all.
    default: kept.includes(raw.default) ? raw.default : kept[0],
    spaces,
  };
}

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
 * Whether the thematic spaces variant is assigned, populated or not. Its spaces
 * come from its own config rather than SPACE_IDS, so callers that branch on
 * the id set need this and not isSpacesAssigned.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export function isSpacesThematicAssigned(prefs) {
  return (
    resolvePageLayoutVariant(prefs) === PAGE_LAYOUT_VARIANTS.SPACES_THEMATIC_V1
  );
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

/**
 * Whether the page has both halves of the side-by-side pair, ignoring which
 * variant is assigned. The thematic spaces variant puts the pair inside each
 * space rather than on the band, so it needs this without the variant test.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
function hasSideBySidePair(prefs) {
  return Boolean(
    // The overrides, like Base.jsx does for V1: the experiment turns stories and
    // the widgets container back on for a profile that had them off, unless it
    // has since opted out. isSpaceOverridden is false outside a spaces variant,
    // so the side-by-side layouts read the plain prefs. feeds.system.topstories
    // stays raw -- region and locale are not a user choice.
    (prefs?.["feeds.section.topstories"] ||
      isSpaceOverridden(SPACE_IDS.STORIES, prefs)) &&
    prefs?.["feeds.system.topstories"] &&
    isWidgetsContainerVisible(prefs) &&
    hasContentAreaWidgets(
      prefs,
      prefs?.["widgets.enabled"] || isSpaceOverridden(SPACE_IDS.WIDGETS, prefs)
    )
  );
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
    hasSideBySidePair(prefs)
  );
}

function isSpaceEnabled(id, prefs) {
  return (
    Boolean(prefs?.[SPACE_CONFIG[id].userPref]) || isSpaceOverridden(id, prefs)
  );
}

/**
 * Which space the page opens on, given the spaces that survived the populated
 * check. Falls back to the first of them, so dropping the config's default still
 * opens somewhere.
 *
 * @param {object} config - from resolveThematicSpacesConfig
 * @param {string[]} populatedSpaces - ids from resolvePopulatedSpaces
 * @returns {string|undefined}
 */
export function resolveThematicDefaultSpace(config, populatedSpaces = []) {
  return populatedSpaces.includes(config?.default)
    ? config.default
    : populatedSpaces[0];
}

/**
 * The config a profile should use: a train-hop payload when enrolled, otherwise
 * the pref, a JSON string whose shipped default is DEFAULT_SPACES_CONFIG in
 * ActivityStream.sys.mjs and which devtools edits. Null when neither yields a
 * usable config, which is what stops the layout rendering.
 *
 * @param {object} [trainhopConfig] - the merged train-hop config
 * @param {string} [prefValue] - the pageLayouts.spacesConfig pref
 * @returns {object|null}
 */
export function resolveSpacesConfigFrom(trainhopConfig, prefValue) {
  if (trainhopConfig?.spaces) {
    return normalizeSpacesConfig(trainhopConfig.spaces);
  }
  if (!prefValue) {
    return null;
  }
  try {
    return normalizeSpacesConfig(JSON.parse(prefValue));
  } catch {
    return rejectSpacesConfig(prefValue);
  }
}

/**
 * The thematic spaces config in force, resolved and normalised here rather than
 * in a feed, since only PREFS_INITIAL_VALUES has arrived before the first paint.
 * Null means the variant cannot render and the band falls back to its ordinary
 * layout, which is what a config with a mistake in it does: a broken config is
 * rejected outright, never patched up from the pref's shipped default.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {object|null}
 */
let lastResolved = { trainhop: undefined, pref: undefined, value: null };

export function resolveThematicSpacesConfig(prefs) {
  const trainhop = prefs?.trainhopConfig?.spaces;
  const pref = prefs?.[PREF_SPACES_CONFIG];
  // Memoised on the inputs, not for speed alone: it also keeps a rejected
  // config from complaining once per render. Both are stable between changes --
  // trainhopConfig is replaced wholesale, and the pref is a string.
  if (lastResolved.trainhop === trainhop && lastResolved.pref === pref) {
    return lastResolved.value;
  }
  const value = resolveSpacesConfigFrom(prefs?.trainhopConfig, pref);
  lastResolved = { trainhop, pref, value };
  return value;
}

/**
 * Which of the delivered sectionKeys belong to a space, in delivery order. The
 * default space is the catch-all, so it also takes every key no other space
 * claims and an unrecognised section still renders somewhere.
 *
 * @param {object} config - from resolveThematicSpacesConfig
 * @param {string} spaceId - a config space id
 * @param {string[]} sectionKeys - sectionKeys the feed delivered, in order
 * @returns {string[]}
 */
export function resolveThematicSpaceSections(
  config,
  spaceId,
  sectionKeys = []
) {
  const assigned = new Set(config?.spaces?.[spaceId]?.sections ?? []);
  const isCatchAll = spaceId === config?.default;
  const claimedElsewhere = new Set(
    Object.entries(config?.spaces ?? {})
      .filter(([id]) => id !== spaceId && id !== config?.default)
      .flatMap(([, space]) => space.sections)
  );

  // Delivery order is the feed's ranking, so filter rather than reorder.
  return sectionKeys.filter(
    key => assigned.has(key) || (isCatchAll && !claimedElsewhere.has(key))
  );
}

/**
 * The sectionKeys the feed has delivered, in order. Empty before the feed
 * arrives, which is why a space with nothing to show is dropped rather than
 * rendered blank: the next refresh can bring it back.
 *
 * @param {object} discoveryStream - state.DiscoveryStream
 * @returns {string[]}
 */
export function resolveFeedSectionKeys(discoveryStream) {
  const sections = Object.values(discoveryStream?.feeds?.data ?? {}).find(
    feed => feed?.data?.sections?.length
  )?.data?.sections;
  return sections?.map(section => section.sectionKey).filter(Boolean) ?? [];
}

/**
 * The widgets a space should show, in registry order, filtered to the ones
 * actually enabled. The default space is the catch-all here too, so a widget no
 * space names is never invisible everywhere. Empty means the space shows its
 * feed alone.
 *
 * Weather is never named: at its small size it renders in the page's inline-end
 * sidebar, outside every space, as it does in the side-by-side layouts.
 *
 * @param {object} config - from resolveThematicSpacesConfig
 * @param {string} spaceId - a config space id
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string[]} widget ids
 */
export function resolveThematicSpaceWidgets(config, spaceId, prefs) {
  const assigned = new Set(config?.spaces?.[spaceId]?.widgets ?? []);
  const isCatchAll = spaceId === config?.default;
  const claimed = new Set(
    Object.values(config?.spaces ?? {}).flatMap(space => space.widgets)
  );
  const widgetsEnabled =
    prefs?.["widgets.enabled"] || isSpaceOverridden(SPACE_IDS.WIDGETS, prefs);

  return WIDGET_REGISTRY.filter(
    w =>
      (assigned.has(w.id) || (isCatchAll && !claimed.has(w.id))) &&
      isWidgetEnabled(w, prefs, widgetsEnabled)
  ).map(w => w.id);
}

/**
 * The thematic spaces that have something to show, in the config's order.
 * Without the side-by-side pair there is nothing to put in a space at all, and
 * a space with none of its sections in the feed is dropped rather than rendered
 * empty -- the next refresh can bring it back.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @param {string[]|null} sectionKeys - sectionKeys the feed delivered, or null
 *   from a caller that only has prefs, which skips the per-space check
 * @returns {string[]}
 */
function resolvePopulatedThematicSpaces(prefs, sectionKeys) {
  const config = resolveThematicSpacesConfig(prefs);
  if (!config || !hasSideBySidePair(prefs)) {
    return [];
  }
  return config.order.filter(
    id =>
      !sectionKeys ||
      resolveThematicSpaceSections(config, id, sectionKeys).length
  );
}

/**
 * The V1 spaces that have something to show, in tablist order. Being enabled is
 * not enough for two of them, and no override crosses that floor -- an empty
 * space is worse than a missing one.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {string[]}
 */
function resolvePopulatedFeatureSpaces(prefs) {
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
 * Each space's enabled widgets, keyed by space id. Folded once because it
 * answers two questions at the call site: whether a space gets a widget column
 * at all, and what goes in it.
 *
 * @param {object} config - from resolveThematicSpacesConfig
 * @param {string[]} spaceIds - ids from resolvePopulatedSpaces
 * @param {object} prefs - current pref values from the Redux store
 * @returns {object} space id to widget ids
 */
export function resolveThematicWidgetsBySpace(config, spaceIds, prefs) {
  return Object.fromEntries(
    spaceIds.map(id => [id, resolveThematicSpaceWidgets(config, id, prefs)])
  );
}

/**
 * Ids of the spaces that have content, in tablist order. The two variants
 * answer this differently enough to keep apart: V1 asks per feature pref,
 * thematic asks the config and the feed.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @param {string[]} [sectionKeys] - sectionKeys the feed delivered. Thematic
 *   only; V1 spaces are not built from sections.
 * @returns {string[]}
 */
export function resolvePopulatedSpaces(prefs = {}, sectionKeys = null) {
  return isSpacesThematicAssigned(prefs)
    ? resolvePopulatedThematicSpaces(prefs, sectionKeys)
    : resolvePopulatedFeatureSpaces(prefs);
}

/**
 * Everything the thematic layout needs, or null when it is not assigned or has
 * no usable config. One call so the component composing the page reads the
 * layout's shape in one place rather than assembling it from six resolvers.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @param {object} discoveryStream - state.DiscoveryStream
 * @returns {object|null} { order, defaultId, spaces } where each space carries
 *   its label, icon, iconFamily, sectionKeys and widgetIds
 */
export function resolveThematicSpaces(prefs, discoveryStream) {
  if (!isSpacesThematicAssigned(prefs)) {
    return null;
  }
  const config = resolveThematicSpacesConfig(prefs);
  const sectionKeys = resolveFeedSectionKeys(discoveryStream);
  const order = resolvePopulatedSpaces(prefs, sectionKeys);
  if (!config || !order.length) {
    return null;
  }
  return {
    order,
    defaultId: resolveThematicDefaultSpace(config, order),
    spaces: Object.fromEntries(
      order.map(id => [
        id,
        {
          ...config.spaces[id],
          sectionKeys: resolveThematicSpaceSections(config, id, sectionKeys),
          widgetIds: resolveThematicSpaceWidgets(config, id, prefs),
        },
      ])
    ),
  };
}

/**
 * Whether spaces is assigned and has somewhere to navigate to. Below two spaces
 * the band falls back to stacking its sections.
 *
 * Takes the DiscoveryStream state rather than section keys so the keys are only
 * derived once the cheap checks have passed: the default page is not built from
 * sections and should not pay to look at them.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @param {object} [discoveryStream] - state.DiscoveryStream. Only the thematic
 *   variant uses it, and omitting it asks whether the layout is assigned rather
 *   than whether its spaces have content
 * @returns {boolean}
 */
export function isSpacesActive(prefs, discoveryStream) {
  // Every spaces style is scoped under .nova-enabled.
  if (!prefs?.["nova.enabled"] || !isSpacesAssigned(prefs)) {
    return false;
  }
  // No feed state given means the caller only wants to know which layout is
  // assigned, so the per-space section check is skipped. Deriving keys from
  // undefined would come back empty and read as "no space has content".
  const sectionKeys =
    discoveryStream && isSpacesThematicAssigned(prefs)
      ? resolveFeedSectionKeys(discoveryStream)
      : null;
  return resolvePopulatedSpaces(prefs, sectionKeys).length > 1;
}

// Banner formats are placed by row rather than in a card slot, so the row can't
// use one. Rectangle is out too: DSCard swaps its title and excerpt for generic
// copy and drops the attribution footer. Deliberately duplicates the list in
// selectLayoutRender, since sharing it would make common/ depend on
// content-src/, which is the wrong direction.
const WIDGETS_AD_EXCLUDED_FORMATS = ["billboard", "leaderboard", "rectangle"];

// @experiment(remove) { bug 2069496 }
/**
 * Whether the widgets-row ad variant is assigned and the page can lay it out.
 * The row is a Nova-only grid, and an ad on its own under a heading that says
 * Widgets is worse than no ad, so this needs a content-area widget too.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @returns {boolean}
 */
export const isWidgetsAdActive = prefs =>
  Boolean(
    prefs?.["nova.enabled"] &&
    resolvePageLayoutVariant(prefs) === PAGE_LAYOUT_VARIANTS.WIDGETS_AD_LARGE &&
    // Both gates, as selectLayoutRender and DiscoveryStreamFeed use. A stale
    // spoc in the store must not outlive the user turning sponsored off.
    prefs.showSponsored &&
    prefs["system.showSponsored"] &&
    isWidgetsContainerVisible(prefs) &&
    hasContentAreaWidgets(prefs)
  );

// @experiment(remove) { bug 2069496 }
/**
 * The sponsored card the widgets row shows, or null when it shows none.
 *
 * The row takes the first eligible ad and the stories fill skips whichever one
 * this returns, so both call this rather than deciding separately. Two gates
 * that can disagree would drop an ad nobody renders.
 *
 * @param {object} prefs - current pref values from the Redux store
 * @param {object} spocs - state.DiscoveryStream.spocs
 * @returns {object|null} a normalized spoc, in the same shape a story card gets
 */
export const selectWidgetsRowAd = (prefs, spocs) => {
  if (!isWidgetsAdActive(prefs)) {
    return null;
  }
  // The first eligible ad, and nothing once it is blocked. Advancing to the
  // next would take a second ad out of the Stories inventory.
  const first = spocs?.data?.newtab_spocs?.items?.find(
    item => !WIDGETS_AD_EXCLUDED_FORMATS.includes(item.format)
  );
  const blocked = spocs?.blocked ?? [];
  return first && !blocked.includes(first.url) ? first : null;
};
