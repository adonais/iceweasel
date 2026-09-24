/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_PAGE_LAYOUT_VARIANT,
  PAGE_LAYOUT_VARIANTS,
  SIDE_BY_SIDE_PAGE_LAYOUTS,
  SPACES_PAGE_LAYOUTS,
  isSideBySideActive,
  isSideBySideAssigned,
  isSpacesActive,
  isSpacesAssigned,
  isAutoMinimizeWidgetsAssigned,
  resolveAutoMinimizeDelayMs,
  resolvePageLayoutVariant,
  resolvePopulatedSpaces,
  sideBySideBandClasses,
  spacesBandClasses,
} from "common/PageLayoutVariants.mjs";

// The gates isSideBySideActive checks besides the variant itself.
const STORIES_ON = {
  "feeds.section.topstories": true,
  "feeds.system.topstories": true,
};
// The container being on is not enough: something has to actually be in it.
const WIDGETS_ON = {
  "widgets.system.enabled": true,
  "widgets.enabled": true,
  "widgets.system.lists.enabled": true,
  "widgets.lists.enabled": true,
};

const sideBySide = {
  "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
  ...STORIES_ON,
  ...WIDGETS_ON,
};

describe("resolvePageLayoutVariant", () => {
  it("defaults to the full-width layout when nothing is set", () => {
    expect(resolvePageLayoutVariant({})).toBe(DEFAULT_PAGE_LAYOUT_VARIANT);
    expect(DEFAULT_PAGE_LAYOUT_VARIANT).toBe("nova-full-width");
  });

  it("returns the pref value", () => {
    expect(
      resolvePageLayoutVariant({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD,
      })
    ).toBe("side-by-side-widgets-lead");
  });

  it("lets trainhopConfig override a non-default pref value", () => {
    expect(
      resolvePageLayoutVariant({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
        trainhopConfig: {
          pageLayouts: {
            variant: PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD,
          },
        },
      })
    ).toBe("side-by-side-widgets-lead");
  });

  it("falls back to the pref for a missing or non-string trainhop value", () => {
    const pref = {
      "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
    };
    expect(resolvePageLayoutVariant({ ...pref, trainhopConfig: {} })).toBe(
      "side-by-side-content-lead"
    );
    expect(
      resolvePageLayoutVariant({ ...pref, trainhopConfig: { pageLayouts: {} } })
    ).toBe("side-by-side-content-lead");
    expect(
      resolvePageLayoutVariant({
        ...pref,
        trainhopConfig: { pageLayouts: { variant: true } },
      })
    ).toBe("side-by-side-content-lead");
    expect(
      resolvePageLayoutVariant({
        ...pref,
        trainhopConfig: { pageLayouts: { variant: "" } },
      })
    ).toBe("side-by-side-content-lead");
  });
});

describe("isSideBySideAssigned", () => {
  it("is true for every side-by-side variant regardless of the sections", () => {
    expect(SIDE_BY_SIDE_PAGE_LAYOUTS).toHaveLength(4);
    for (const variant of SIDE_BY_SIDE_PAGE_LAYOUTS) {
      expect(isSideBySideAssigned({ "pageLayouts.variant": variant })).toBe(
        true
      );
    }
  });

  // This is the difference from isSideBySideActive: the panels follow the
  // assignment, so a lone section is still framed.
  it("stays true where isSideBySideActive is false", () => {
    const noWidgets = { ...sideBySide, "widgets.lists.enabled": false };
    expect(isSideBySideAssigned(noWidgets)).toBe(true);
    expect(isSideBySideActive(noWidgets)).toBe(false);
  });

  it("is false for the default layout", () => {
    expect(isSideBySideAssigned({})).toBe(false);
    expect(
      isSideBySideAssigned({ "pageLayouts.variant": "nova-full-width" })
    ).toBe(false);
  });

  it("follows a variant set through trainhopConfig", () => {
    expect(
      isSideBySideAssigned({
        trainhopConfig: {
          pageLayouts: {
            variant: PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD,
          },
        },
      })
    ).toBe(true);
  });
});

describe("isSideBySideActive", () => {
  it("is true for every side-by-side variant when stories and widgets are on", () => {
    for (const variant of SIDE_BY_SIDE_PAGE_LAYOUTS) {
      expect(
        isSideBySideActive({ ...sideBySide, "pageLayouts.variant": variant })
      ).toBe(true);
    }
  });

  it("is false for the default variant even with stories and widgets on", () => {
    expect(
      isSideBySideActive({ ...sideBySide, "pageLayouts.variant": undefined })
    ).toBe(false);
  });

  it("is false when either stories pref is off", () => {
    expect(
      isSideBySideActive({ ...sideBySide, "feeds.section.topstories": false })
    ).toBe(false);
    expect(
      isSideBySideActive({ ...sideBySide, "feeds.system.topstories": false })
    ).toBe(false);
  });

  it("is false when the widgets container is not visible", () => {
    expect(
      isSideBySideActive({ ...sideBySide, "widgets.system.enabled": false })
    ).toBe(false);
  });

  it("is false when the container is on but every widget is hidden", () => {
    expect(
      isSideBySideActive({ ...sideBySide, "widgets.enabled": false })
    ).toBe(false);
    expect(
      isSideBySideActive({ ...sideBySide, "widgets.lists.enabled": false })
    ).toBe(false);
  });

  // Small weather lives in the sidebar, not the band.
  it("is false when the only enabled widget is weather in the sidebar", () => {
    const weatherOnly = {
      ...sideBySide,
      "widgets.lists.enabled": false,
      "widgets.system.weather.enabled": true,
      "widgets.weather.enabled": true,
      "weather.display": "",
      "widgets.weather.size": "small",
    };
    expect(isSideBySideActive(weatherOnly)).toBe(false);

    // ...but a larger weather widget stays in the content area and does count.
    expect(
      isSideBySideActive({ ...weatherOnly, "widgets.weather.size": "medium" })
    ).toBe(true);
  });

  it("is true when the variant comes from trainhopConfig", () => {
    expect(
      isSideBySideActive({
        ...STORIES_ON,
        ...WIDGETS_ON,
        trainhopConfig: {
          pageLayouts: {
            variant: PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
          },
        },
      })
    ).toBe(true);
  });

  // Goes through isWidgetsContainerVisible, so the keys the hand-rolled copies in
  // DiscoveryStreamBase.jsx and selectLayoutRender.mjs miss still count.
  it("is true when widgets are enabled only via trainhopConfig.widgetsSettings", () => {
    expect(
      isSideBySideActive({
        ...sideBySide,
        "widgets.system.enabled": false,
        trainhopConfig: { widgetsSettings: { enabled: true } },
      })
    ).toBe(true);
  });

  it("is true when widgets are enabled only via trainhopConfig.widgets", () => {
    expect(
      isSideBySideActive({
        ...sideBySide,
        "widgets.system.enabled": false,
        trainhopConfig: { widgets: { enabled: true } },
      })
    ).toBe(true);
  });
});

describe("sideBySideBandClasses", () => {
  it("is empty outside the experiment", () => {
    expect(sideBySideBandClasses({})).toEqual([]);
    expect(
      sideBySideBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.NOVA_FULL_WIDTH,
      })
    ).toEqual([]);
    expect(
      sideBySideBandClasses({ "pageLayouts.variant": "not-a-variant" })
    ).toEqual([]);
  });

  // The lead class alone, so nothing unlocks the fourth content card.
  it("gives the four-column variants just their lead class", () => {
    expect(
      sideBySideBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
      })
    ).toEqual(["side-by-side-content-lead"]);
    expect(
      sideBySideBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD,
      })
    ).toEqual(["side-by-side-widgets-lead"]);
  });

  // The lead class is shared with the four-column variant, so every existing
  // side-by-side rule keeps matching; side-by-side-five is the only difference.
  it("adds side-by-side-five for the five-column variants", () => {
    expect(
      sideBySideBandClasses({
        "pageLayouts.variant":
          PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD_FIVE,
      })
    ).toEqual(["side-by-side-content-lead", "side-by-side-five"]);
    expect(
      sideBySideBandClasses({
        "pageLayouts.variant":
          PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD_FIVE,
      })
    ).toEqual(["side-by-side-widgets-lead", "side-by-side-five"]);
  });

  // CSS matches classes per token, so a "-five" variant name would not be
  // matched by any .side-by-side-*-lead rule. It must never reach the class list.
  it("never emits a -five variant name as a class", () => {
    for (const variant of SIDE_BY_SIDE_PAGE_LAYOUTS.filter(v =>
      v.endsWith("-five")
    )) {
      expect(
        sideBySideBandClasses({ "pageLayouts.variant": variant })
      ).not.toContain(variant);
    }
  });

  it("follows a variant set through trainhopConfig", () => {
    expect(
      sideBySideBandClasses({
        trainhopConfig: {
          pageLayouts: {
            variant: PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD_FIVE,
          },
        },
      })
    ).toEqual(["side-by-side-widgets-lead", "side-by-side-five"]);
  });
});

const spaces = {
  "nova.enabled": true,
  "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_BOTTOM,
  ...STORIES_ON,
  ...WIDGETS_ON,
};

describe("spacesBandClasses", () => {
  it("decomposes each variant into the family class plus a placement", () => {
    expect(
      spacesBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_TOP,
      })
    ).toEqual(["spaces", "spaces-buttons-top"]);
    expect(
      spacesBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_BOTTOM,
      })
    ).toEqual(["spaces", "spaces-buttons-bottom"]);
  });

  it("returns nothing for the other layouts", () => {
    expect(spacesBandClasses({})).toEqual([]);
    expect(
      spacesBandClasses({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_CONTENT_LEAD,
      })
    ).toEqual([]);
  });
});

describe("isSpacesAssigned", () => {
  it("is true for every spaces variant, whatever the content prefs", () => {
    for (const variant of SPACES_PAGE_LAYOUTS) {
      expect(isSpacesAssigned({ "pageLayouts.variant": variant })).toBe(true);
    }
  });

  it("is false outside the spaces variants", () => {
    expect(isSpacesAssigned({})).toBe(false);
    expect(
      isSpacesAssigned({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SIDE_BY_SIDE_WIDGETS_LEAD,
      })
    ).toBe(false);
  });
});

describe("resolvePopulatedSpaces", () => {
  it("lists only the spaces whose content is enabled, in tablist order", () => {
    expect(resolvePopulatedSpaces(spaces)).toEqual(["stories", "widgets"]);
    expect(
      resolvePopulatedSpaces({
        ...spaces,
        "feeds.section.highlights": true,
      })
    ).toEqual(["stories", "widgets", "activity"]);
  });

  it("does not turn anything on", () => {
    expect(resolvePopulatedSpaces({ ...spaces, ...{} })).not.toContain(
      "activity"
    );
    expect(resolvePopulatedSpaces({})).toEqual([]);
  });
});

describe("the experiment override", () => {
  // One shape for all three spaces: the experiment turns a space on unless its
  // opt-out pref says the user turned it off while enrolled. The user's own
  // pref is never written, so unenrolling restores their choice.
  const enrolled = {
    ...spaces,
    trainhopConfig: {
      stories: { enabled: true },
      widgets: { enabled: true },
      highlights: { enabled: true },
    },
  };

  it("overrides a space the profile enrolled with turned off", () => {
    expect(
      resolvePopulatedSpaces({
        ...enrolled,
        "feeds.section.topstories": false,
        "feeds.section.highlights": false,
      })
    ).toEqual(["stories", "widgets", "activity"]);
  });

  it("respects a space turned off while enrolled, for every space", () => {
    expect(
      resolvePopulatedSpaces({
        ...enrolled,
        "feeds.section.topstories": false,
        "spaces.storiesOptOut": true,
        "widgets.enabled": false,
        "spaces.widgetsOptOut": true,
        "feeds.section.highlights": false,
        "spaces.activityOptOut": true,
      })
    ).toEqual([]);
  });

  it("does not override outside the experiment", () => {
    expect(
      resolvePopulatedSpaces({
        ...enrolled,
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.NOVA_FULL_WIDTH,
        "feeds.section.topstories": false,
      })
    ).toEqual(["widgets"]);
  });

  it("does not conjure content that is not there", () => {
    // Region and locale decide whether stories exist at all, and no override
    // should produce an empty panel.
    expect(
      resolvePopulatedSpaces({
        ...enrolled,
        "feeds.system.topstories": false,
      })
    ).not.toContain("stories");
  });
});

describe("the widgets space gate", () => {
  it("is not a space when the user has switched widgets off", () => {
    expect(
      resolvePopulatedSpaces({ ...spaces, "widgets.enabled": false })
    ).not.toContain("widgets");
  });

  it("is not a space when the container is on but no widget is enabled", () => {
    expect(
      resolvePopulatedSpaces({
        ...spaces,
        "widgets.lists.enabled": false,
      })
    ).not.toContain("widgets");
  });

  it("is not a space when weather is the only widget", () => {
    // Weather moves to the sidebar at its small size, so the row is empty.
    expect(
      resolvePopulatedSpaces({
        ...spaces,
        "widgets.lists.enabled": false,
        "widgets.system.weather.enabled": true,
        "widgets.weather.enabled": true,
        "widgets.weather.size": "small",
      })
    ).not.toContain("widgets");
  });

  it("is a space when a widget is actually showing", () => {
    expect(resolvePopulatedSpaces(spaces)).toContain("widgets");
  });
});

describe("isSpacesActive", () => {
  it("is true with a spaces variant and somewhere to navigate to", () => {
    expect(isSpacesActive(spaces)).toBe(true);
  });

  it("is false with only one populated space", () => {
    expect(
      isSpacesActive({
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.SPACES_BUTTONS_BOTTOM,
        ...STORIES_ON,
      })
    ).toBe(false);
  });

  it("is false outside the spaces variants", () => {
    expect(
      isSpacesActive({
        ...spaces,
        "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.NOVA_FULL_WIDTH,
      })
    ).toBe(false);
  });

  it("is false without Nova, whose stylesheet it depends on", () => {
    expect(isSpacesActive({ ...spaces, "nova.enabled": false })).toBe(false);
  });
});

// @experiment(remove) { bug 2066527 }
describe("auto-minimize widgets variant", () => {
  const assigned = {
    "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.AUTO_MINIMIZE_WIDGETS,
  };

  it("is assigned by pref and by trainhop", () => {
    expect(isAutoMinimizeWidgetsAssigned(assigned)).toBe(true);
    expect(
      isAutoMinimizeWidgetsAssigned({
        trainhopConfig: {
          pageLayouts: {
            variant: PAGE_LAYOUT_VARIANTS.AUTO_MINIMIZE_WIDGETS,
          },
        },
      })
    ).toBe(true);
    expect(isAutoMinimizeWidgetsAssigned({})).toBe(false);
  });

  it("defaults the delay to 3s", () => {
    expect(resolveAutoMinimizeDelayMs({})).toBe(3000);
  });

  it("prefers trainhop over the pref, and the pref over the default", () => {
    expect(
      resolveAutoMinimizeDelayMs({ "pageLayouts.autoMinimizeDelayMs": 750 })
    ).toBe(750);
    expect(
      resolveAutoMinimizeDelayMs({
        "pageLayouts.autoMinimizeDelayMs": 750,
        trainhopConfig: { pageLayouts: { autoMinimizeDelayMs: 200 } },
      })
    ).toBe(200);
  });

  it("ignores non-numeric and negative values", () => {
    expect(
      resolveAutoMinimizeDelayMs({
        "pageLayouts.autoMinimizeDelayMs": 750,
        trainhopConfig: { pageLayouts: { autoMinimizeDelayMs: "200" } },
      })
    ).toBe(750);
    expect(
      resolveAutoMinimizeDelayMs({ "pageLayouts.autoMinimizeDelayMs": -1 })
    ).toBe(3000);
  });
});
