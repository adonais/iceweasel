/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, act } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import { StocksError } from "content-src/components/Widgets/Stocks/StocksError";

describe("StocksError", () => {
  let dispatch;
  let observerCallbacks;
  let observerInstances;
  // Stable target so the same fake entry can be reused across calls.
  const mockTarget = {};

  beforeEach(() => {
    dispatch = jest.fn();
    observerCallbacks = [];
    observerInstances = [];
    jest.spyOn(global, "IntersectionObserver").mockImplementation(cb => {
      const instance = {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      };
      observerCallbacks.push(cb);
      observerInstances.push(instance);
      return instance;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderStocksError(size = "medium") {
    return render(<StocksError widgetSize={size} dispatch={dispatch} />);
  }

  function fireIntersection() {
    const cb = observerCallbacks[observerCallbacks.length - 1];
    act(() => {
      cb([{ isIntersecting: true, target: mockTarget }]);
    });
  }

  function errorCalls() {
    return dispatch.mock.calls.filter(
      ([action]) => action.type === at.WIDGETS_ERROR
    );
  }

  it("fires WIDGETS_ERROR once when the error message is seen", () => {
    renderStocksError("medium");
    fireIntersection();

    const calls = errorCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0].data).toMatchObject({
      widget_name: "stocks",
      widget_size: "medium",
      error_type: "load_error",
    });
    expect(calls[0][0].meta).toEqual(
      expect.objectContaining({ to: "ActivityStream:Main" })
    );
  });

  it("marks the error box as an alert for screen readers", () => {
    const { container } = renderStocksError();
    expect(container.querySelector(".stocks-error").getAttribute("role")).toBe(
      "alert"
    );
  });

  it("does not fire WIDGETS_ERROR when the error message never intersects", () => {
    renderStocksError();

    expect(observerInstances[0].observe).toHaveBeenCalledTimes(1);
    expect(errorCalls()).toHaveLength(0);
  });

  it("fires WIDGETS_ERROR only once even if the observer reports intersection twice", () => {
    renderStocksError();

    fireIntersection();
    fireIntersection();

    expect(errorCalls()).toHaveLength(1);
  });
});
