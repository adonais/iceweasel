/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef, useCallback, useState } from "react";

// Matches --carousel-resize-duration, so the card finishes growing and
// arriving at the same moment.
const CAROUSEL_SCROLL_MS = 500;

/**
 * Centres the selected carousel card and reports which layout the row is in.
 * Belongs in the component that owns the row, since it needs the scroller and
 * every card element; the pill row only says which card to centre.
 */
export function useCarouselScroll(activeId, isCarousel) {
  const cardRefs = useRef(new Map());
  const scrollerRef = useRef(null);
  const glidingRef = useRef(false);
  const [isSmallLayout, setIsSmallLayout] = useState(false);

  const registerCard = useCallback((id, el) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  // The scroll position that centres a card. Measured such that
  // it holds regardless of text direction, padding or offset parent.
  const centredScrollLeft = useCallback(id => {
    const card = cardRefs.current.get(id);
    const scroller = scrollerRef.current;
    if (!card || !scroller) {
      return null;
    }
    const cardRect = card.getBoundingClientRect();
    const rowRect = scroller.getBoundingClientRect();
    const offset =
      cardRect.left + cardRect.width / 2 - (rowRect.left + rowRect.width / 2);
    return { scroller, left: scroller.scrollLeft + offset };
  }, []);

  const settle = useCallback(
    id => {
      const end = centredScrollLeft(id);
      end?.scroller.scrollTo({ left: end.left, behavior: "auto" });
    },
    [centredScrollLeft]
  );

  // Glide the selected card to the centre, re-measures the destination each
  // frame because the card is still growing. Progress comes from elapsed time
  // so the journey takes the same duration whatever its length or the display
  // refresh rate.
  useEffect(() => {
    if (!isCarousel || !activeId) {
      return undefined;
    }
    let frame;
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ||
      !window.performance
    ) {
      frame = window.requestAnimationFrame(() => settle(activeId));
      return () => window.cancelAnimationFrame(frame);
    }
    const start = window.performance.now();
    let easedBefore = 0;
    glidingRef.current = true;
    const step = now => {
      const elapsed = Math.max(0, now - start);
      const progress = Math.min(1, elapsed / CAROUSEL_SCROLL_MS);
      if (progress >= 1) {
        settle(activeId);
        glidingRef.current = false;
        return;
      }
      const target = centredScrollLeft(activeId);
      if (target) {
        const eased = 1 - Math.pow(1 - progress, 3);
        // Cover this frame's share of whatever distance is left.
        // Both follow the same curve, but this one still
        // converges if something else scrolls the row.
        const share = (eased - easedBefore) / (1 - easedBefore);
        easedBefore = eased;
        const current = target.scroller.scrollLeft;
        target.scroller.scrollTo({
          left: current + (target.left - current) * share,
          behavior: "auto",
        });
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => {
      glidingRef.current = false;
      window.cancelAnimationFrame(frame);
    };
  }, [activeId, isCarousel, centredScrollLeft, settle]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!isCarousel || !scroller || !activeId || !window.ResizeObserver) {
      return undefined;
    }
    let frame = 0;
    // Which layout the row is in is decided by a container query, read the
    // marker it sets rather than duplicating the breakpoint here.
    const readLayout = () =>
      setIsSmallLayout(
        window
          .getComputedStyle(scroller)
          .getPropertyValue("--carousel-layout")
          .trim() === "small"
      );
    readLayout();
    // Re-centre the card when the row is resized.
    // Initialize a observer to watch for size changes and ignore callbacks
    // that do not reflect an actual change.
    let { width, height } = scroller.getBoundingClientRect();
    const observer = new window.ResizeObserver(() => {
      readLayout();
      const box = scroller.getBoundingClientRect();
      if (
        glidingRef.current ||
        (box.width === width && box.height === height)
      ) {
        return;
      }
      ({ width, height } = box);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        settle(activeId);
        // Crossing the breakpoint restarts the card's size transition which causes the
        // centre keeps moving after this frame so settle again once it stops.
        const running = cardRefs.current.get(activeId)?.getAnimations?.() ?? [];
        if (running.length) {
          Promise.allSettled(running.map(anim => anim.finished)).then(() =>
            settle(activeId)
          );
        }
      });
    });
    observer.observe(scroller, { box: "border-box" });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [activeId, isCarousel, settle]);

  return { scrollerRef, registerCard, isSmallLayout };
}

export const CarouselNav = ({
  items = [],
  activeId,
  onSelect,
  navLabel,
  compact,
}) => {
  const groupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return undefined;
    }
    const handleChange = () => onSelectRef.current?.(group.value);
    group.addEventListener("change", handleChange);
    return () => group.removeEventListener("change", handleChange);
  }, []);

  const pillItems = items.filter(item => item?.pill && item.id);
  if (pillItems.length < 2) {
    return null;
  }

  const labelProps = navLabel?.raw
    ? { "aria-label": navLabel.raw }
    : { "data-l10n-id": navLabel?.string_id ?? "onboarding-carousel-nav" };

  return (
    <div className="carousel-nav">
      <moz-segmented-control ref={groupRef} value={activeId} {...labelProps}>
        {pillItems.map(({ id, pill }) => (
          <moz-segmented-control-item
            key={id}
            value={id}
            size="small"
            label={pill.label?.raw}
            data-l10n-id={pill.label?.string_id}
            iconsrc={compact ? undefined : pill.icon}
          />
        ))}
      </moz-segmented-control>
    </div>
  );
};
