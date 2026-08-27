/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 750;

const easeOutQuint = t => 1 - (1 - t) ** 5;

/**
 * Animates a number from one value to another on demand.
 *
 * Returns `displayValue` (the resting value unless an animation is running),
 * `countUp(from, to)` to start one, `hold(at)` to pin the readout without
 * animating, and `release()` to undo a hold. Callers keep rendering their own
 * value; this only takes over for the duration of a run.
 *
 * @param {number} value Resting value shown when no animation is running.
 * @param {number} durationMs Length of the count, in ms.
 */
export const useCountUp = (value, durationMs = DEFAULT_DURATION_MS) => {
  const [animatedValue, setAnimatedValue] = useState(null);
  const frameRef = useRef(null);
  // Read by the running animation so a feed update mid-flight can retarget it.
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const countUp = useCallback(
    (from, to) => {
      if (from >= to) {
        return;
      }
      cancel();
      let startTime = null;

      const tick = now => {
        if (startTime === null) {
          startTime = now;
        }
        const linearT = Math.min(1, (now - startTime) / durationMs);
        // Track the live value: the readout drops back to it when the run
        // ends, so a fixed target would land short and then snap.
        const target = Math.max(to, valueRef.current);
        if (linearT < 1) {
          setAnimatedValue(
            Math.round(from + (target - from) * easeOutQuint(linearT))
          );
          frameRef.current = requestAnimationFrame(tick);
          return;
        }
        // Hand the number back to the caller's own value rather than pinning
        // it at `to`, which would go stale on the next feed update.
        frameRef.current = null;
        setAnimatedValue(null);
      };

      setAnimatedValue(from);
      frameRef.current = requestAnimationFrame(tick);
    },
    [cancel, durationMs]
  );

  // Pins the readout at `at` with no animation, for a run that is deferred and
  // must not show the resting value in the meantime.
  const hold = useCallback(
    at => {
      cancel();
      setAnimatedValue(at);
    },
    [cancel]
  );

  // Drops a hold when the deferred run turns out never to happen. Leaves a
  // running count alone, which would otherwise flicker to the resting value.
  const release = useCallback(() => {
    if (frameRef.current === null) {
      setAnimatedValue(null);
    }
  }, []);

  return { countUp, displayValue: animatedValue ?? value, hold, release };
};
