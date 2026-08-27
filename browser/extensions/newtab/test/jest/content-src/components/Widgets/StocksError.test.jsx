/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, act } from "@testing-library/react";
import { StocksError } from "content-src/components/Widgets/Stocks/StocksError";

describe("StocksError", () => {
  let recordError;
  let observerCallbacks;
  let observerInstances;
  // Stable target so the same fake entry can be reused across calls.
  const mockTarget = {};

  beforeEach(() => {
    recordError = jest.fn();
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

  function renderStocksError() {
    return render(<StocksError recordError={recordError} />);
  }

  function fireIntersection() {
    const cb = observerCallbacks[observerCallbacks.length - 1];
    act(() => {
      cb([{ isIntersecting: true, target: mockTarget }]);
    });
  }

  it("records a load_error once when the error message is seen", () => {
    renderStocksError();
    fireIntersection();
    expect(recordError).toHaveBeenCalledTimes(1);
    expect(recordError).toHaveBeenCalledWith("load_error");
  });

  it("marks the error box as an alert for screen readers", () => {
    const { container } = renderStocksError();
    expect(container.querySelector(".stocks-error").getAttribute("role")).toBe(
      "alert"
    );
  });

  it("does not record an error when the message never intersects", () => {
    renderStocksError();
    expect(observerInstances[0].observe).toHaveBeenCalledTimes(1);
    expect(recordError).not.toHaveBeenCalled();
  });

  it("records the error only once even if the observer reports intersection twice", () => {
    renderStocksError();
    fireIntersection();
    fireIntersection();
    expect(recordError).toHaveBeenCalledTimes(1);
  });
});
