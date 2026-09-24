/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useLayoutEffect, useRef, useState } from "react";

// Widths can differ by a tiny fraction of a pixel without anything actually
// changing, so only re-measure when a width really changes.
const WIDTH_EPSILON = 0.5;

/**
 * How many of the items fit in containerWidth. The More button's width is only
 * subtracted when it is actually rendered.
 */
function getVisibleItemCount(containerWidth, { widths, gap, controlWidth }) {
  const rowWidth =
    widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (rowWidth <= containerWidth) {
    return widths.length;
  }

  const available = containerWidth - controlWidth - gap;
  let used = 0;
  for (let i = 0; i < widths.length; i++) {
    used += widths[i] + (i ? gap : 0);
    if (used > available) {
      return i;
    }
  }
  return widths.length;
}

/**
 * Splits a single row of items into the ones that fit and the ones that
 * overflow into a More button. Only the items that fit are rendered, so a
 * partly cut off item never appears.
 *
 * Widths can only be read while every item is rendered, which is what a null
 * count asks for: render everything, laid out but not painted. After that a
 * resize is just arithmetic against the cached widths.
 *
 * moz-button renders its contents asynchronously, so an early read finds zero
 * widths. The count stays null until they are real, and the items and More
 * button stay observed so a later width change starts a fresh pass.
 *
 * @param {string[]} labels - The item labels, which re-measure when they change
 * @returns {object} Refs to attach, and visibleCount, null while measuring
 */
function useOverflowSplit(labels) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const itemsRef = useRef([]);
  const overflowRef = useRef(null);
  const metricsRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(null);

  const itemCount = labels.length;
  const cacheKey = labels.join();

  useLayoutEffect(() => {
    const container = containerRef.current;
    const list = listRef.current;
    if (!container || !list) {
      return undefined;
    }

    const measure = () => {
      const metrics = {
        widths: itemsRef.current
          .slice(0, itemCount)
          .map(el => el?.getBoundingClientRect().width ?? 0),
        gap: parseFloat(globalThis.getComputedStyle(list).columnGap) || 0,
        controlWidth: overflowRef.current?.getBoundingClientRect().width ?? 0,
      };
      const isReady =
        metrics.controlWidth > 0 && metrics.widths.every(width => width > 0);
      // Null rather than stale, so a rejected read can't feed the update below.
      metricsRef.current = isReady ? metrics : null;
    };

    // Only valid while every item is rendered.
    if (visibleCount === null) {
      measure();
    }

    // A resize lands here every frame but the count only changes at a
    // breakpoint, so returning prev skips a re-render on all other frames.
    const update = containerWidth => {
      if (!metricsRef.current) {
        return;
      }
      setVisibleCount(prev => {
        const next = getVisibleItemCount(containerWidth, metricsRef.current);
        return next === prev ? prev : next;
      });
    };

    // Rect, not clientWidth, to avoid rounding.
    update(container.getBoundingClientRect().width);

    const observer = new ResizeObserver(entries => {
      // Check each element width against its cached width, so it only reads as
      // changed when the width really differs.
      const cachedWidth = target => {
        if (target === overflowRef.current) {
          return metricsRef.current?.controlWidth;
        }
        const index = itemsRef.current.indexOf(target);
        return index === -1 ? undefined : metricsRef.current?.widths[index];
      };

      const staleWidths = entries.some(entry => {
        if (entry.target === container) {
          return false;
        }
        const { width } = entry.target.getBoundingClientRect();
        // Zero means the item mounted this frame and hasn't rendered yet;
        // counting it would restart measuring every time the strip widens.
        if (width === 0) {
          return false;
        }
        const cached = cachedWidth(entry.target);
        return cached === undefined || Math.abs(cached - width) > WIDTH_EPSILON;
      });
      if (staleWidths) {
        if (visibleCount === null) {
          measure();
        } else {
          // Items are missing, so ask for a fresh measuring pass instead.
          setVisibleCount(null);
          return;
        }
      }

      update(container.getBoundingClientRect().width);
    });

    observer.observe(container);
    // Every mounted item, since a measuring pass is waiting on the ones that
    // just mounted, and an item that rendered earlier won't resize again.
    itemsRef.current.slice(0, itemCount).forEach(el => {
      if (el) {
        observer.observe(el);
      }
    });
    if (overflowRef.current) {
      observer.observe(overflowRef.current);
    }

    return () => observer.disconnect();
  }, [itemCount, cacheKey, visibleCount]);

  return { containerRef, listRef, itemsRef, overflowRef, visibleCount };
}

export { useOverflowSplit, getVisibleItemCount };
