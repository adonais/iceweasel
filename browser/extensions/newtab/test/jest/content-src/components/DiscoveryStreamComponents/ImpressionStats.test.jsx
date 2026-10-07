/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import {
  ImpressionStats,
  INTERSECTION_RATIO,
} from "content-src/components/DiscoveryStreamImpressionStats/ImpressionStats";

describe("<ImpressionStats>", () => {
  const SOURCE = "TEST_SOURCE";
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
    rows: [
      { id: 1, pos: 0 },
      { id: 2, pos: 1 },
      { id: 3, pos: 2 },
    ],
    source: SOURCE,
    IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    document: {
      visibilityState: "visible",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  const InnerEl = () => <div>Inner Element</div>;

  // The impression ping tiles are enriched with a fixed set of fields; rows
  // without an explicit `format` resolve to "medium-card" because they have no
  // `section` (see getActiveCardSize).
  function organicTile(id, pos) {
    return {
      id,
      pos,
      type: "organic",
      recommendation_id: undefined,
      scheduled_corpus_item_id: undefined,
      corpus_item_id: undefined,
      recommended_at: undefined,
      received_rank: undefined,
      topic: undefined,
      features: undefined,
      attribution: undefined,
      is_ad_eligible_position: undefined,
      format: "medium-card",
    };
  }

  function renderImpressionStats(props = {}) {
    return render(
      <ImpressionStats {...DEFAULT_PROPS} {...props}>
        <InnerEl />
      </ImpressionStats>
    );
  }

  it("should render props.children", () => {
    const { getByText } = renderImpressionStats();
    expect(getByText("Inner Element")).toBeInTheDocument();
  });

  it("should not send loaded content nor impression when the page is not visible", () => {
    const dispatch = jest.fn();
    renderImpressionStats({
      dispatch,
      document: {
        visibilityState: "hidden",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("should only send loaded content but not impression when the wrapped item is not visbible", () => {
    const dispatch = jest.fn();
    renderImpressionStats({
      dispatch,
      IntersectionObserver: buildIntersectionObserver(ZeroIntersectEntries),
    });

    // This one is for loaded content.
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[action]] = dispatch.mock.calls;
    expect(action.type).toBe(at.DISCOVERY_STREAM_LOADED_CONTENT);
    expect(action.data.source).toBe(SOURCE);
    expect(action.data.tiles).toEqual([
      { id: 1, pos: 0 },
      { id: 2, pos: 1 },
      { id: 3, pos: 2 },
    ]);
  });

  it("should not send impression when the wrapped item is visbible but below the ratio", () => {
    const dispatch = jest.fn();
    renderImpressionStats({
      dispatch,
      IntersectionObserver: buildIntersectionObserver(PartialIntersectEntries),
    });

    // This one is for loaded content.
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("should send a loaded content and an impression when the page is visible and the wrapped item meets the visibility ratio", () => {
    const dispatch = jest.fn();
    renderImpressionStats({
      dispatch,
      IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    });

    expect(dispatch).toHaveBeenCalledTimes(2);

    const [[loadedAction], [impressionAction]] = dispatch.mock.calls;
    expect(loadedAction.type).toBe(at.DISCOVERY_STREAM_LOADED_CONTENT);
    expect(loadedAction.data.source).toBe(SOURCE);
    expect(loadedAction.data.tiles).toEqual([
      { id: 1, pos: 0 },
      { id: 2, pos: 1 },
      { id: 3, pos: 2 },
    ]);

    expect(impressionAction.type).toBe(at.DISCOVERY_STREAM_IMPRESSION_STATS);
    expect(impressionAction.data.source).toBe(SOURCE);
    expect(impressionAction.data.tiles).toEqual([
      organicTile(1, 0),
      organicTile(2, 1),
      organicTile(3, 2),
    ]);
  });

  it("should send a DISCOVERY_STREAM_SPOC_IMPRESSION when the wrapped item has a flightId", () => {
    const dispatch = jest.fn();
    const flightId = "a_flight_id";
    renderImpressionStats({
      dispatch,
      flightId,
      rows: [{ id: 1, pos: 1, advertiser: "test advertiser" }],
      source: "TOP_SITES",
      IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    });

    // Loaded content + DISCOVERY_STREAM_SPOC_IMPRESSION + TOP_SITES_SPONSORED_IMPRESSION_STATS + impression
    expect(dispatch).toHaveBeenCalledTimes(4);

    const [, [spocAction]] = dispatch.mock.calls;
    expect(spocAction.type).toBe(at.DISCOVERY_STREAM_SPOC_IMPRESSION);
    expect(spocAction.data).toEqual({ flightId });
  });

  it("should send a TOP_SITES_SPONSORED_IMPRESSION_STATS when the wrapped item has a flightId", () => {
    const dispatch = jest.fn();
    const flightId = "a_flight_id";
    renderImpressionStats({
      dispatch,
      flightId,
      rows: [{ id: 1, pos: 1, advertiser: "test advertiser" }],
      source: "TOP_SITES",
      IntersectionObserver: buildIntersectionObserver(FullIntersectEntries),
    });

    // Loaded content + DISCOVERY_STREAM_SPOC_IMPRESSION + TOP_SITES_SPONSORED_IMPRESSION_STATS + impression
    expect(dispatch).toHaveBeenCalledTimes(4);

    const [, , [topSitesAction]] = dispatch.mock.calls;
    expect(topSitesAction.type).toBe(at.TOP_SITES_SPONSORED_IMPRESSION_STATS);
    expect(topSitesAction.data).toEqual({
      type: "impression",
      tile_id: 1,
      source: "newtab",
      advertiser: "test advertiser",
      position: 1,
      attribution: undefined,
    });
  });

  it("should send an impression when the wrapped item transiting from invisible to visible", () => {
    // Capture the injected IntersectionObserver's callback so the test can drive
    // it a second time to simulate a later intersection, mirroring the legacy
    // test without reaching into the React component instance.
    let capturedCallback;
    class CapturingIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        capturedCallback = callback;
      }

      observe() {
        this.callback(ZeroIntersectEntries);
      }

      unobserve() {}
    }

    const dispatch = jest.fn();
    renderImpressionStats({
      dispatch,
      IntersectionObserver: CapturingIntersectionObserver,
    });

    // For the loaded content
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[loadedAction]] = dispatch.mock.calls;
    expect(loadedAction.type).toBe(at.DISCOVERY_STREAM_LOADED_CONTENT);
    expect(loadedAction.data.source).toBe(SOURCE);
    expect(loadedAction.data.tiles).toEqual([
      { id: 1, pos: 0 },
      { id: 2, pos: 1 },
      { id: 3, pos: 2 },
    ]);

    dispatch.mockClear();
    capturedCallback(FullIntersectEntries);

    // For the impression
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [[impressionAction]] = dispatch.mock.calls;
    expect(impressionAction.type).toBe(at.DISCOVERY_STREAM_IMPRESSION_STATS);
    expect(impressionAction.data.tiles).toEqual([
      organicTile(1, 0),
      organicTile(2, 1),
      organicTile(3, 2),
    ]);
  });

  it("should remove visibility change listener when the wrapper is removed", () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    const { unmount } = renderImpressionStats({
      dispatch: jest.fn(),
      document: {
        visibilityState: "hidden",
        addEventListener,
        removeEventListener,
      },
    });

    expect(addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    const [[, listener]] = addEventListener.mock.calls;

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      listener
    );
  });

  it("should unobserve the intersection observer when the wrapper is removed", () => {
    const FakeIntersectionObserver =
      buildIntersectionObserver(ZeroIntersectEntries);
    const unobserveSpy = jest.spyOn(
      FakeIntersectionObserver.prototype,
      "unobserve"
    );
    const { unmount } = renderImpressionStats({
      dispatch: jest.fn(),
      IntersectionObserver: FakeIntersectionObserver,
    });

    unmount();

    expect(unobserveSpy).toHaveBeenCalledTimes(1);
  });

  it("should only send the latest impression on a visibility change", () => {
    const listeners = new Set();
    const dispatch = jest.fn();
    const fakeDocument = {
      visibilityState: "hidden",
      addEventListener: (ev, cb) => listeners.add(cb),
      removeEventListener: (ev, cb) => listeners.delete(cb),
    };

    const { rerender } = renderImpressionStats({
      dispatch,
      document: fakeDocument,
    });

    // Update twice
    rerender(
      <ImpressionStats
        {...DEFAULT_PROPS}
        dispatch={dispatch}
        document={fakeDocument}
        rows={[{ id: 123, pos: 4 }]}
      >
        <InnerEl />
      </ImpressionStats>
    );
    rerender(
      <ImpressionStats
        {...DEFAULT_PROPS}
        dispatch={dispatch}
        document={fakeDocument}
        rows={[{ id: 2432, pos: 5 }]}
      >
        <InnerEl />
      </ImpressionStats>
    );

    expect(dispatch).not.toHaveBeenCalled();

    // Simulate listeners getting called
    fakeDocument.visibilityState = "visible";
    listeners.forEach(l => l());

    // Make sure we only sent the latest event
    expect(dispatch).toHaveBeenCalledTimes(2);
    const [[action]] = dispatch.mock.calls;
    expect(action.data.tiles).toEqual([{ id: 2432, pos: 5 }]);
  });

  function impressionCount(dispatch) {
    return dispatch.mock.calls.filter(
      ([action]) => action.type === at.DISCOVERY_STREAM_IMPRESSION_STATS
    ).length;
  }

  // The isActive tests toggle the prop and reach for the instance's observer,
  // so they render through a ref and re-render with this helper.
  function renderActivatable(props) {
    const ref = { current: null };
    const element = extra => (
      <ImpressionStats
        {...DEFAULT_PROPS}
        {...props}
        {...extra}
        ref={instance => {
          ref.current = instance;
        }}
      >
        <InnerEl />
      </ImpressionStats>
    );
    const { rerender } = render(element());
    return {
      ref,
      setIsActive: isActive => rerender(element({ isActive })),
    };
  }

  it("should not send an impression while isActive is false", () => {
    const dispatch = jest.fn();

    renderImpressionStats({ dispatch, isActive: false });

    expect(impressionCount(dispatch)).toBe(0);
  });

  it("should send one impression however often isActive is toggled", () => {
    const dispatch = jest.fn();
    const { setIsActive } = renderActivatable({ dispatch, isActive: true });

    expect(impressionCount(dispatch)).toBe(1);

    // A caller that hides and reshows the same item, such as a carousel
    // rotating through its slides, still reports a single impression.
    setIsActive(false);
    setIsActive(true);
    setIsActive(false);
    setIsActive(true);

    expect(impressionCount(dispatch)).toBe(1);
  });

  it("should stop observing when isActive becomes false", () => {
    const FakeIntersectionObserver =
      buildIntersectionObserver(ZeroIntersectEntries);
    const unobserveSpy = jest.spyOn(
      FakeIntersectionObserver.prototype,
      "unobserve"
    );
    const { ref, setIsActive } = renderActivatable({
      dispatch: jest.fn(),
      IntersectionObserver: FakeIntersectionObserver,
    });

    // A carousel slide below the fold rotates away before it is ever seen. It
    // must not stay armed, or every slide would report at once on scroll.
    setIsActive(false);

    expect(unobserveSpy).toHaveBeenCalledTimes(1);
    expect(ref.current.impressionObserver).toBeNull();
  });

  it("should still report after being reactivated", () => {
    const dispatch = jest.fn();
    const { ref, setIsActive } = renderActivatable({
      dispatch,
      IntersectionObserver: buildIntersectionObserver(ZeroIntersectEntries),
    });

    // A slide that rotates out before it was ever seen still owes an
    // impression the next time it comes around and is visible.
    setIsActive(false);
    setIsActive(true);
    ref.current.impressionObserver.callback(FullIntersectEntries);

    expect(impressionCount(dispatch)).toBe(1);
  });
});
