/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, act } from "@testing-library/react";
import { WidgetCelebration } from "content-src/components/Widgets/WidgetCelebration";

const FRAME = { width: 332, height: 276, strokeInset: 1, radius: 16 };

// testing-library's fireEvent.animationEnd doesn't propagate animationName to
// React's synthetic event in JSDOM, so dispatch a native Event with the
// property defined manually (mirrors FocusTimer.test.jsx).
function fireAnimationEnd(element, animationName) {
  act(() => {
    const event = new Event("animationend", { bubbles: true });
    Object.defineProperty(event, "animationName", { value: animationName });
    element.dispatchEvent(event);
  });
}

const COPY_PROPS = {
  celebrationFrame: FRAME,
  celebrationId: 1,
  headlineL10nId: "test-headline",
  subheadL10nId: "test-subhead",
  illustrationSrc: "chrome://newtab/content/data/content/assets/image.svg",
  onComplete: () => {},
};

function renderCelebration(props = {}) {
  return render(
    <WidgetCelebration celebrationFrame={FRAME} celebrationId={1} {...props} />
  );
}

describe("<WidgetCelebration>", () => {
  it("renders with the default widget-celebration classNamePrefix", () => {
    const { container } = render(<WidgetCelebration {...COPY_PROPS} />);
    expect(container.querySelector(".widget-celebration")).toBeInTheDocument();
    expect(
      container.querySelector(".widget-celebration-copy")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".widget-celebration-effects")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".widget-celebration-illustration")
    ).toBeInTheDocument();
  });

  it("uses a custom classNamePrefix", () => {
    const { container } = render(
      <WidgetCelebration {...COPY_PROPS} classNamePrefix="lists-celebration" />
    );
    expect(container.querySelector(".lists-celebration")).toBeInTheDocument();
    expect(
      container.querySelector(".lists-celebration-copy")
    ).toBeInTheDocument();
    expect(container.querySelector(".widget-celebration")).toBeNull();
  });

  it("appends ?run=celebrationId to an SVG illustration src", () => {
    const { container } = render(
      <WidgetCelebration {...COPY_PROPS} celebrationId={3} />
    );
    expect(
      container.querySelector("img").getAttribute("src").endsWith("?run=3")
    ).toBe(true);
  });

  it("does not modify a non-SVG illustration src", () => {
    const src = "chrome://newtab/content/data/content/assets/image.png";
    const { container } = render(
      <WidgetCelebration {...COPY_PROPS} illustrationSrc={src} />
    );
    expect(container.querySelector("img").getAttribute("src")).toBe(src);
  });

  it("renders the headline and subhead with their l10n ids", () => {
    const { container } = render(<WidgetCelebration {...COPY_PROPS} />);
    expect(
      container
        .querySelector(".widget-celebration-headline")
        .getAttribute("data-l10n-id")
    ).toBe("test-headline");
    expect(
      container
        .querySelector(".widget-celebration-subhead")
        .getAttribute("data-l10n-id")
    ).toBe("test-subhead");
  });

  describe("onComplete", () => {
    it("fires when the lifecycle animation ends on the root", () => {
      const onComplete = jest.fn();
      const { container } = render(
        <WidgetCelebration {...COPY_PROPS} onComplete={onComplete} />
      );
      fireAnimationEnd(
        container.querySelector(".widget-celebration"),
        "widget-celebration-lifecycle"
      );
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("does not fire for a different animation name", () => {
      const onComplete = jest.fn();
      const { container } = render(
        <WidgetCelebration {...COPY_PROPS} onComplete={onComplete} />
      );
      fireAnimationEnd(
        container.querySelector(".widget-celebration"),
        "other-animation"
      );
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("does not fire when the event target is not the root", () => {
      const onComplete = jest.fn();
      const { container } = render(
        <WidgetCelebration {...COPY_PROPS} onComplete={onComplete} />
      );
      // Bubbles up from a child, so target !== currentTarget on the root.
      fireAnimationEnd(
        container.querySelector(".widget-celebration-effects"),
        "widget-celebration-lifecycle"
      );
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("does not throw when onComplete is not provided", () => {
      const { container } = render(
        <WidgetCelebration {...COPY_PROPS} onComplete={undefined} />
      );
      expect(() =>
        fireAnimationEnd(
          container.querySelector(".widget-celebration"),
          "widget-celebration-lifecycle"
        )
      ).not.toThrow();
    });
  });

  describe("fireworks", () => {
    it("renders one firework per requested burst when colors are supplied", () => {
      const { container } = renderCelebration({
        confettiColors: ["#ff0000", "#00ff00"],
        fireworkBursts: 3,
      });
      expect(
        container.querySelector(".widget-celebration-fireworks")
      ).toBeInTheDocument();
      expect(
        container.querySelectorAll(".widget-celebration-firework")
      ).toHaveLength(3);
      // Each burst radiates sparks.
      expect(
        container.querySelectorAll(".widget-celebration-firework-spark").length
      ).toBeGreaterThan(0);
    });

    it("renders no fireworks by default (fireworkBursts unset)", () => {
      const { container } = renderCelebration({ confettiColors: ["#ff0000"] });
      expect(
        container.querySelector(".widget-celebration-fireworks")
      ).toBeNull();
    });

    it("renders no fireworks when bursts are requested but no colors are given", () => {
      const { container } = renderCelebration({ fireworkBursts: 5 });
      expect(
        container.querySelector(".widget-celebration-fireworks")
      ).toBeNull();
    });
  });
});
