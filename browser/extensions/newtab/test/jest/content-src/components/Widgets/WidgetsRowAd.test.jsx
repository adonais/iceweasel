/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { WidgetsRowAd } from "content-src/components/Widgets/WidgetsRowAd";
import {
  PAGE_LAYOUT_VARIANTS,
  selectWidgetsRowAd,
} from "common/PageLayoutVariants.mjs";

const SPOC = {
  id: 1,
  flight_id: 2,
  url: "https://example.com/ad",
  title: "Make hard look easy",
  excerpt: "Outfitting the hardest workers in the gym",
  raw_image_src: "https://example.com/ad.jpg",
  domain: "example.com",
  sponsor: "Example",
  shim: { click: "click-shim", impression: "impression-shim" },
  attribution: [{ format: "lorem", url: "https://example.com/attr" }],
};

// Everything selectWidgetsRowAd gates on besides the spoc list itself.
const ASSIGNED_PREFS = {
  "nova.enabled": true,
  showSponsored: true,
  "system.showSponsored": true,
  "pageLayouts.variant": PAGE_LAYOUT_VARIANTS.WIDGETS_AD_LARGE,
  "widgets.system.enabled": true,
  "widgets.enabled": true,
  "widgets.system.lists.enabled": true,
  "widgets.lists.enabled": true,
};

const spocsWith = items => ({
  loaded: true,
  blocked: [],
  data: { newtab_spocs: { items } },
});

const WrapWithProvider = ({ children }) => {
  const store = createStore(combineReducers(reducers), INITIAL_STATE);
  return <Provider store={store}>{children}</Provider>;
};

describe("selectWidgetsRowAd", () => {
  it("returns nothing outside the experiment", () => {
    expect(selectWidgetsRowAd({}, spocsWith([SPOC]))).toBeNull();
  });

  it("returns the first eligible spoc when assigned", () => {
    expect(selectWidgetsRowAd(ASSIGNED_PREFS, spocsWith([SPOC]))).toBe(SPOC);
  });

  // Rectangle would render generic copy with no attribution, so it is out too.
  it("skips the rectangle format", () => {
    const rect = {
      ...SPOC,
      url: "https://example.com/rect",
      format: "rectangle",
    };
    expect(selectWidgetsRowAd(ASSIGNED_PREFS, spocsWith([rect, SPOC]))).toBe(
      SPOC
    );
    expect(selectWidgetsRowAd(ASSIGNED_PREFS, spocsWith([rect]))).toBeNull();
  });

  it("skips banner formats, which are placed by row rather than in a cell", () => {
    const banner = { ...SPOC, url: "https://example.com/banner" };
    expect(
      selectWidgetsRowAd(ASSIGNED_PREFS, {
        ...spocsWith([
          { ...banner, format: "billboard" },
          { ...banner, format: "leaderboard" },
          SPOC,
        ]),
      })
    ).toBe(SPOC);
  });

  it("shows nothing once the ad is blocked", () => {
    expect(
      selectWidgetsRowAd(ASSIGNED_PREFS, {
        ...spocsWith([SPOC]),
        blocked: [SPOC.url],
      })
    ).toBeNull();
  });

  // Dismissing hides the slot. Advancing would pull a second ad out of the
  // Stories inventory, which is the behavior HNT-3210 ruled out.
  it("does not fall through to the next ad when the first is blocked", () => {
    const second = { ...SPOC, id: 9, url: "https://example.com/second" };

    expect(
      selectWidgetsRowAd(ASSIGNED_PREFS, {
        ...spocsWith([SPOC, second]),
        blocked: [SPOC.url],
      })
    ).toBeNull();
  });

  it("returns nothing with no spocs, and nothing when none are left", () => {
    expect(selectWidgetsRowAd(ASSIGNED_PREFS, undefined)).toBeNull();
    expect(selectWidgetsRowAd(ASSIGNED_PREFS, spocsWith([]))).toBeNull();
  });

  // Either half of the sponsored-content opt-out kills it, so a spoc left in
  // the store cannot outlive the user turning sponsored content off.
  it("returns nothing when sponsored content is off", () => {
    expect(
      selectWidgetsRowAd(
        { ...ASSIGNED_PREFS, showSponsored: false },
        spocsWith([SPOC])
      )
    ).toBeNull();
    expect(
      selectWidgetsRowAd(
        { ...ASSIGNED_PREFS, "system.showSponsored": false },
        spocsWith([SPOC])
      )
    ).toBeNull();
  });

  // An ad by itself under a heading that says Widgets is worse than no ad.
  it("returns nothing when no widget renders in the content area", () => {
    const noWidgets = { ...ASSIGNED_PREFS, "widgets.lists.enabled": false };
    expect(selectWidgetsRowAd(noWidgets, spocsWith([SPOC]))).toBeNull();
  });
});

describe("WidgetsRowAd", () => {
  // Dropping either of these silently kills attribution reporting and the
  // ad-eligible flag, neither of which shows up in the rendered markup.
  it("forwards attribution and the ad-eligible flag to the card", () => {
    const card = WidgetsRowAd({
      spoc: SPOC,
      dispatch: () => {},
      type: "widgets_row_ad",
    });

    expect(card.props.attribution).toBe(SPOC.attribution);
    expect(card.props.is_ad_eligible_position).toBe(true);
    expect(card.props.shim).toBe(SPOC.shim);
    expect(card.props.flightId).toBe(SPOC.flight_id);
  });

  it("renders the spoc's title and source", () => {
    const { container } = render(
      <WrapWithProvider>
        <WidgetsRowAd spoc={SPOC} dispatch={() => {}} type="widgets_row_ad" />
      </WrapWithProvider>
    );

    expect(container.querySelector(".widgets-row-ad")).toBeTruthy();
    expect(container.textContent).toContain(SPOC.title);
    // DSSource shows the domain, the same field the story cards pass.
    expect(container.textContent).toContain(SPOC.domain);
  });

  it("links to the spoc url", () => {
    const { container } = render(
      <WrapWithProvider>
        <WidgetsRowAd spoc={SPOC} dispatch={() => {}} type="widgets_row_ad" />
      </WrapWithProvider>
    );

    expect(container.querySelector(`a[href="${SPOC.url}"]`)).toBeTruthy();
  });
});
