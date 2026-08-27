/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useLayoutEffect, useRef } from "react";

const REORDER_FLIP_MS = 160;

/**
 * Framework-agnostic FLIP (First-Last-Invert-Play) reorder animator for a grid
 * whose tiles are repositioned by something CSS can't transition (a changed
 * `order`, grid placement, or DOM reordering). After the layout has changed,
 * `sync()` measures every `childSelector` element, snaps each back to where it
 * was with an instant inverse transform, then releases it so it transitions to
 * its new cell.
 *
 * Rects are keyed by the DOM node itself, so any consumer that preserves its
 * nodes across a reorder (stable React keys, or a stable CSS `order`) works
 * with no per-item id attribute. `skipSelector` matches tiles to leave
 * untransformed — the one being dragged, which should track the cursor
 * instantly rather than be flung by its own (largest) inverse transform.
 *
 * A sliding tile's transform also moves its hit-testing box, so with
 * dragenter-based drop detection (TopSites) a tile sliding under a still cursor
 * re-triggers the reorder and oscillates. The engine exposes `isAnimating()`;
 * such a consumer should ignore reorder events while it returns true, which
 * fully decouples detection from the animation.
 *
 * The caller drives intent via `sync(container, { enabled, reset })`:
 * - `reset: true` only refreshes the baseline (measure, no animation). Used at
 *   a drag's start so the first move animates from the tiles' current on-screen
 *   positions rather than a stale snapshot — e.g. one captured while newtab was
 *   preloaded offscreen, where getBoundingClientRect reports the origin.
 * - otherwise tiles that moved animate from the previous baseline.
 *
 * getBoundingClientRect includes transforms, so in-flight transforms are
 * cleared before measuring — this keeps deltas correct when a drag reorders
 * faster than an animation can finish. The "Play" step forces a synchronous
 * reflow to commit the inverted state instead of waiting for rAF: a native
 * HTML5 drag runs a nested event loop where rAF callbacks are throttled, so an
 * rAF-driven release intermittently skips the transition (most visibly on slow
 * drags).
 */
export function createReorderFlip({
  childSelector,
  skipSelector = null,
  durationMs = REORDER_FLIP_MS,
} = {}) {
  let prevRects = new Map();
  let slideUntil = 0;

  return {
    // True while a slide is in flight. Hit-test-based consumers gate their
    // reorder detection on this so moving tiles can't feed back into it.
    isAnimating() {
      return performance.now() < slideUntil;
    },

    sync(container, { enabled = true, reset = false } = {}) {
      if (!container) {
        return;
      }

      const items = [...container.querySelectorAll(childSelector)];

      // Clear any in-flight transform so we measure true layout positions.
      for (const el of items) {
        el.style.transition = "none";
        el.style.transform = "";
      }

      const newRects = new Map(
        items.map(el => [el, el.getBoundingClientRect()])
      );

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      if (enabled && !reset && !reduceMotion) {
        const moved = [];
        for (const el of items) {
          if (skipSelector && el.matches(skipSelector)) {
            continue;
          }
          const prev = prevRects.get(el);
          if (!prev) {
            continue;
          }
          const next = newRects.get(el);
          const dx = prev.left - next.left;
          const dy = prev.top - next.top;
          if (!dx && !dy) {
            continue;
          }
          // Invert: snap back to where it was, with no transition.
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          moved.push(el);
        }
        if (moved.length) {
          // Commit the inverted state as the transition's starting point, then
          // release. The reflow read makes this synchronous and drag-loop-proof.
          void container.offsetWidth;
          for (const el of moved) {
            el.style.transition = `transform ${durationMs}ms ease`;
            el.style.transform = "";
          }
          slideUntil = performance.now() + durationMs;
        }
      }

      prevRects = newRects;
    },
  };
}

/**
 * React hook wrapper around createReorderFlip for function components. Returns a
 * ref to put on the grid container. `orderKey` must change whenever the visual
 * order changes; `resetKey` should change at each drag boundary (e.g. the
 * dragged id) so the baseline is refreshed before the first move. A render
 * where only `resetKey` changed refreshes the baseline without animating.
 */
export function useReorderFlip({
  orderKey,
  resetKey = null,
  enabled = true,
  childSelector,
  skipSelector = null,
} = {}) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const orderRef = useRef(orderKey);

  if (!engineRef.current) {
    engineRef.current = createReorderFlip({ childSelector, skipSelector });
  }

  useLayoutEffect(() => {
    const orderChanged = orderKey !== orderRef.current;
    orderRef.current = orderKey;
    engineRef.current.sync(containerRef.current, {
      enabled,
      reset: !orderChanged,
    });
    // resetKey is a dep so a drag-start refresh fires even when orderKey is
    // unchanged; it intentionally has no other use in the body.
  }, [orderKey, enabled, resetKey]);

  return containerRef;
}
