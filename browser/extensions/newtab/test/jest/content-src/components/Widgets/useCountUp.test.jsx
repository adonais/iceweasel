/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, renderHook } from "@testing-library/react";
import { useCountUp } from "content-src/components/Widgets/useCountUp";

// Drives requestAnimationFrame by hand so each step lands on a known timestamp.
function mockRaf() {
  let pending = null;
  let cancelled = [];
  let nextId = 1;
  globalThis.requestAnimationFrame = callback => {
    pending = { id: nextId, callback };
    return nextId++;
  };
  globalThis.cancelAnimationFrame = id => cancelled.push(id);
  return {
    cancelled,
    step(timestamp) {
      const current = pending;
      pending = null;
      act(() => current.callback(timestamp));
    },
    get hasPending() {
      return pending !== null;
    },
  };
}

describe("useCountUp", () => {
  let raf;
  let originalRaf;
  let originalCancel;

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    originalCancel = globalThis.cancelAnimationFrame;
    raf = mockRaf();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  });

  it("returns the resting value when no count is running", () => {
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current.displayValue).toBe(42);
  });

  it("eases from the start value toward the target", () => {
    const { result } = renderHook(() => useCountUp(100, 1000));

    act(() => result.current.countUp(0, 100));
    expect(result.current.displayValue).toBe(0);

    raf.step(0);
    raf.step(500);
    // easeOutQuint at t=0.5 is 1 - 0.5^5 = 0.96875, so well past the midpoint.
    expect(result.current.displayValue).toBe(97);
  });

  it("hands the number back to the resting value when the count finishes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 1000),
      {
        initialProps: { value: 100 },
      }
    );

    act(() => result.current.countUp(0, 100));
    raf.step(0);
    raf.step(1000);

    expect(result.current.displayValue).toBe(100);
    expect(raf.hasPending).toBe(false);

    // A later feed update must win rather than the count's stale end value.
    rerender({ value: 137 });
    expect(result.current.displayValue).toBe(137);
  });

  it("climbs to a value that arrives mid-count instead of snapping at the end", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 1000),
      {
        initialProps: { value: 100 },
      }
    );

    act(() => result.current.countUp(0, 100));
    raf.step(0);

    // Feed update lands while the count is running.
    rerender({ value: 150 });
    raf.step(500);
    // Retargeted at 150: 0.96875 of the way there, not to the original 100.
    expect(result.current.displayValue).toBe(145);

    raf.step(1000);
    expect(result.current.displayValue).toBe(150);
  });

  it("pins the readout at a held value until a count starts", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCountUp(value, 1000),
      {
        initialProps: { value: 100 },
      }
    );

    act(() => result.current.hold(90));
    expect(result.current.displayValue).toBe(90);

    // A resting-value update must not dislodge the hold.
    rerender({ value: 110 });
    expect(result.current.displayValue).toBe(90);

    act(() => result.current.countUp(90, 110));
    raf.step(0);
    raf.step(1000);
    expect(result.current.displayValue).toBe(110);
  });

  it("ignores a count that would run backwards or nowhere", () => {
    const { result } = renderHook(() => useCountUp(10));

    act(() => result.current.countUp(30, 10));
    act(() => result.current.countUp(10, 10));

    expect(raf.hasPending).toBe(false);
    expect(result.current.displayValue).toBe(10);
  });

  it("cancels an in-flight frame on unmount", () => {
    const { result, unmount } = renderHook(() => useCountUp(100, 1000));

    act(() => result.current.countUp(0, 100));
    raf.step(0);
    unmount();

    expect(raf.cancelled.length).toBe(1);
  });
});
