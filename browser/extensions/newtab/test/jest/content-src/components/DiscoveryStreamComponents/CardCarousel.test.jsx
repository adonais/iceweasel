/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, fireEvent, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { actionTypes as at } from "common/Actions.mjs";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { CardCarousel } from "content-src/components/DiscoveryStreamComponents/CardCarousel/CardCarousel";

const PREF_PAUSED = "discoverystream.carousel.paused";
const AUTOPLAY_DELAY_MS = 5000;

const RECS = [
  { id: "a", title: "Story A" },
  { id: "b", title: "Story B" },
  { id: "c", title: "Story C" },
];

describe("<CardCarousel />", () => {
  let dispatch;

  function renderCarousel({ recs = RECS, prefs = {} } = {}) {
    dispatch = jest.fn();
    const state = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: { ...INITIAL_STATE.Prefs.values, ...prefs },
      },
    };
    return render(
      <WrapWithProvider state={state}>
        <CardCarousel
          recs={recs}
          labelledBy="section-title"
          section="section_key"
          sectionPosition={0}
          dispatch={dispatch}
          renderCard={rec => <span className="test-card">{rec.title}</span>}
        />
      </WrapWithProvider>
    );
  }

  function slides(container) {
    return [...container.querySelectorAll(".ds-carousel-slide")];
  }

  function activeIndex(container) {
    return slides(container).findIndex(el =>
      el.classList.contains("is-active")
    );
  }

  // Awaited so the MutationObserver watching for an open card menu, which runs
  // as a microtask when slide classes change, settles inside act().
  async function advance(ms) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  async function click(element) {
    await act(async () => {
      fireEvent.click(element);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom has no matchMedia; default to motion allowed.
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders a slide per recommendation, with only the first active", () => {
    const { container } = renderCarousel();

    expect(slides(container)).toHaveLength(RECS.length);
    expect(container.querySelectorAll(".test-card")).toHaveLength(RECS.length);
    expect(activeIndex(container)).toBe(0);
    // Inactive slides stay out of the tab order and the a11y tree.
    expect(slides(container)[1].hasAttribute("inert")).toBe(true);
    expect(slides(container)[0].hasAttribute("inert")).toBe(false);
  });

  it("marks only the visible slide as active for impression reporting", () => {
    const seen = [];
    render(
      <WrapWithProvider>
        <CardCarousel
          recs={RECS}
          labelledBy="section-title"
          dispatch={jest.fn()}
          renderCard={(rec, { isActive }) => {
            seen.push(isActive);
            return <span className="test-card">{rec.title}</span>;
          }}
        />
      </WrapWithProvider>
    );

    expect(seen).toEqual([true, false, false]);
  });

  it("advances on its own and wraps at the end", async () => {
    const { container } = renderCarousel();

    await advance(AUTOPLAY_DELAY_MS - 1);
    expect(activeIndex(container)).toBe(0);

    await advance(1);
    expect(activeIndex(container)).toBe(1);

    await advance(AUTOPLAY_DELAY_MS);
    expect(activeIndex(container)).toBe(2);

    await advance(AUTOPLAY_DELAY_MS);
    expect(activeIndex(container)).toBe(0);
  });

  it("holds rotation while hovered and resumes after", async () => {
    const { container } = renderCarousel();
    const carousel = container.querySelector(".ds-carousel");

    fireEvent.mouseOver(carousel);
    await advance(AUTOPLAY_DELAY_MS);
    expect(activeIndex(container)).toBe(0);

    fireEvent.mouseOut(carousel, { relatedTarget: document.body });
    await advance(AUTOPLAY_DELAY_MS);
    expect(activeIndex(container)).toBe(1);
  });

  it("does not rotate when the paused pref is set", async () => {
    const { container } = renderCarousel({ prefs: { [PREF_PAUSED]: true } });

    await advance(AUTOPLAY_DELAY_MS * 3);
    expect(activeIndex(container)).toBe(0);
  });

  it("moves between slides with the previous and next controls, wrapping", async () => {
    const { container } = renderCarousel();
    const next = container.querySelector(".ds-carousel-next");
    const previous = container.querySelector(".ds-carousel-previous");

    await click(next);
    expect(activeIndex(container)).toBe(1);

    const [[navAction]] = dispatch.mock.calls;
    expect(navAction.type).toBe(at.CAROUSEL_NAVIGATE);
    expect(navAction.data.direction).toBe("next");
    expect(navAction.data.slide_index).toBe(1);
    expect(navAction.data.section).toBe("section_key");

    await click(previous);
    expect(activeIndex(container)).toBe(0);

    // Previous from the first slide wraps to the last.
    await click(previous);
    expect(activeIndex(container)).toBe(RECS.length - 1);
  });

  it("writes the paused pref and reports the toggle", async () => {
    const { container } = renderCarousel();

    await click(container.querySelector(".ds-carousel-rotation-control"));

    const [prefAction, telemetryAction] = dispatch.mock.calls.map(
      call => call[0]
    );
    expect(prefAction.data.name).toBe(PREF_PAUSED);
    expect(prefAction.data.value).toBe(true);
    expect(telemetryAction.type).toBe(at.CAROUSEL_TOGGLE_AUTOPLAY);
    expect(telemetryAction.data.paused).toBe(true);
  });

  it("renders nothing without recommendations", () => {
    const { container } = renderCarousel({ recs: [] });

    expect(container.querySelector(".ds-carousel")).toBeNull();
  });

  describe("with reduced motion", () => {
    beforeEach(() => {
      window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    });

    it("starts paused and does not rotate", async () => {
      const { container } = renderCarousel();

      await advance(AUTOPLAY_DELAY_MS * 2);
      expect(activeIndex(container)).toBe(0);
      expect(
        container
          .querySelector(".ds-carousel-rotation-control")
          .getAttribute("data-l10n-id")
      ).toBe("newtab-carousel-play");
    });

    it("rotates once the user presses play", async () => {
      const { container } = renderCarousel();

      await click(container.querySelector(".ds-carousel-rotation-control"));
      await advance(AUTOPLAY_DELAY_MS);
      expect(activeIndex(container)).toBe(1);
    });
  });
});
