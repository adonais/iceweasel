/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { useWidgetCelebration } from "content-src/components/Widgets/useWidgetCelebration";

function TestComponent({ onRender }) {
  const widgetRef = useRef(null);
  const celebration = useWidgetCelebration(widgetRef);
  onRender(celebration);
  return <div ref={widgetRef} />;
}

function NullRefComponent({ onRender }) {
  const celebration = useWidgetCelebration({ current: null });
  onRender(celebration);
  return <div />;
}

describe("useWidgetCelebration", () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ width: 300, height: 200 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  it("returns initial state", () => {
    let state;
    render(<TestComponent onRender={s => (state = s)} />);
    expect(state.isCelebrating).toBe(false);
    expect(state.celebrationFrame).toBeNull();
    expect(state.celebrationId).toEqual(0);
  });

  it("triggerCelebration sets isCelebrating to true", () => {
    let state;
    render(<TestComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.isCelebrating).toBe(true);
  });

  it("triggerCelebration increments celebrationId on each call", () => {
    let state;
    render(<TestComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.celebrationId).toEqual(1);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.celebrationId).toEqual(2);
  });

  it("triggerCelebration sets celebrationFrame from widget dimensions", () => {
    let state;
    render(<TestComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.celebrationFrame.width).toEqual(300);
    expect(state.celebrationFrame.height).toEqual(200);
    expect(state.celebrationFrame.strokeInset).toEqual(1.5);
  });

  it("triggerCelebration does nothing when widgetRef.current is null", () => {
    let state;
    render(<NullRefComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.isCelebrating).toBe(false);
  });

  it("triggerCelebration does nothing when prefers-reduced-motion is set", () => {
    let state;
    window.matchMedia = () => ({ matches: true });
    render(<TestComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.isCelebrating).toBe(false);
  });

  it("completeCelebration sets isCelebrating to false", () => {
    let state;
    render(<TestComponent onRender={s => (state = s)} />);
    act(() => {
      state.triggerCelebration();
    });
    expect(state.isCelebrating).toBe(true);
    act(() => {
      state.completeCelebration();
    });
    expect(state.isCelebrating).toBe(false);
  });
});
