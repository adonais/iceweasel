/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import {
  TopSiteImpressionWrapper,
  INTERSECTION_RATIO,
} from "content-src/components/TopSites/TopSiteImpressionWrapper";
import { actionTypes as at } from "common/Actions.mjs";
import React from "react";

describe("<TopSiteImpressionWrapper>", () => {
  const FullIntersectEntries = [
    { isIntersecting: true, intersectionRatio: INTERSECTION_RATIO },
  ];
  const ZeroIntersectEntries = [
    { isIntersecting: false, intersectionRatio: 0 },
  ];
  const PartialIntersectEntries = [
    { isIntersecting: true, intersectionRatio: INTERSECTION_RATIO / 2 },
  ];

  // Build IntersectionObserver class with the arg `entries` for the intersect callback.
  function buildIntersectionObserver(entries) {
    return class {
      constructor(callback) {
        this.callback = callback;
      }

      observe() {
        this.callback(entries);
      }

      unobserve() {}
    };
  }

  const DEFAULT_PROPS = {
    actionType: at.TOP_SITES_SPONSORED_IMPRESSION_STATS,
    tile: {
      tile_id: 1,
      position: 1,
      reporting_url: "https://test.reporting.com",
      advertiser: "test_advertiser",
    },
    IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  const InnerEl = () => <div>Inner Element</div>;

  function renderTopSiteImpressionWrapper(props = {}) {
    return render(
      <TopSiteImpressionWrapper {...DEFAULT_PROPS} {...props}>
        <InnerEl />
      </TopSiteImpressionWrapper>
    );
  }

  it("should render", () => {
    const { container } = render(
      <TopSiteImpressionWrapper dispatch={jest.fn()}>
        <div />
      </TopSiteImpressionWrapper>
    );
    expect(
      container.querySelector(".topsite-impression-observer")
    ).toBeInTheDocument();
  });

  it("should render props.children", () => {
    const { getByText } = renderTopSiteImpressionWrapper();
    expect(getByText("Inner Element")).toBeInTheDocument();
  });
  it("should not send impression when the wrapped item is visbible but below the ratio", () => {
    const dispatch = jest.fn();
    const props = {
      dispatch,
      IntersectionObserver: buildIntersectionObserver(PartialIntersectEntries),
    };
    renderTopSiteImpressionWrapper(props);

    expect(dispatch).not.toHaveBeenCalled();
  });
  it("should send an impression when the page is visible and the wrapped item meets the visibility ratio", () => {
    const dispatch = jest.fn();
    const props = {
      dispatch,
      IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    };
    renderTopSiteImpressionWrapper(props);

    expect(dispatch).toHaveBeenCalledTimes(1);

    const [[action]] = dispatch.mock.calls;
    expect(action.type).toEqual(at.TOP_SITES_SPONSORED_IMPRESSION_STATS);
    expect(action.data).toEqual({
      type: "impression",
      ...DEFAULT_PROPS.tile,
    });
  });
  it("should send an impression when the wrapped item transiting from invisible to visible", () => {
    const dispatch = jest.fn();
    const ref = React.createRef();
    const props = {
      dispatch,
      IntersectionObserver: buildIntersectionObserver(ZeroIntersectEntries),
      ref,
    };
    renderTopSiteImpressionWrapper(props);

    expect(dispatch).not.toHaveBeenCalled();

    dispatch.mockClear();
    ref.current.impressionObserver.callback(FullIntersectEntries);

    // For the impression
    expect(dispatch).toHaveBeenCalledTimes(1);

    const [[action]] = dispatch.mock.calls;
    expect(action.type).toEqual(at.TOP_SITES_SPONSORED_IMPRESSION_STATS);
    expect(action.data).toEqual({
      type: "impression",
      ...DEFAULT_PROPS.tile,
    });
  });
  it("should remove visibility change listener when the wrapper is removed", () => {
    const props = {
      dispatch: jest.fn(),
      document: {
        visibilityState: "hidden",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      IntersectionObserver: globalThis.IntersectionObserver,
    };

    const { unmount } = renderTopSiteImpressionWrapper(props);
    expect(props.document.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    const [[, listener]] = props.document.addEventListener.mock.calls;

    unmount();
    expect(props.document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      listener
    );
  });
  it("should unobserve the intersection observer when the wrapper is removed", () => {
    const IntersectionObserver =
      buildIntersectionObserver(ZeroIntersectEntries);
    const spy = jest.spyOn(IntersectionObserver.prototype, "unobserve");
    const props = { dispatch: jest.fn(), IntersectionObserver };

    const { unmount } = renderTopSiteImpressionWrapper(props);
    unmount();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
