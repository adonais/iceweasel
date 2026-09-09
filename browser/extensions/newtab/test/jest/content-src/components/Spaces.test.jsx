/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import { Spaces } from "content-src/components/Spaces/Spaces";

const SPACES = [
  { id: "stories", content: <div data-testid="stories-content" /> },
  { id: "widgets", content: <div data-testid="widgets-content" /> },
  { id: "activity", content: <div data-testid="activity-content" /> },
];

function setup(spaces = SPACES) {
  const dispatch = jest.fn();
  const utils = render(<Spaces spaces={spaces} dispatch={dispatch} />);
  return { dispatch, ...utils };
}

// The switch payload, without the action envelope.
function switchData(dispatch) {
  const [action] = dispatch.mock.calls.at(-1);
  expect(action.type).toBe(at.SPACES_USER_EVENT);
  return action.data;
}

describe("Spaces", () => {
  it("renders a tab per space and selects the first", () => {
    const { container } = setup();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    // Roving tabindex, so the tablist is a single tab stop.
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
  });

  it("mounts every space, so returning to one does not remount it", () => {
    const { getByTestId } = setup();
    expect(getByTestId("stories-content")).toBeTruthy();
    expect(getByTestId("widgets-content")).toBeTruthy();
    expect(getByTestId("activity-content")).toBeTruthy();
  });

  it("hides the inactive spaces from assistive tech and from tabbing", () => {
    const { container } = setup();
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels[0].hasAttribute("aria-hidden")).toBe(false);
    expect(panels[0].hasAttribute("inert")).toBe(false);
    expect(panels[1].getAttribute("aria-hidden")).toBe("true");
    expect(panels[1].hasAttribute("inert")).toBe(true);
  });

  it("offsets each space from the active one, so only one is in view", () => {
    const { container } = setup();
    const panels = container.querySelectorAll('[role="tabpanel"]');
    expect(panels[0].style.getPropertyValue("--space-offset")).toBe("0");
    expect(panels[1].style.getPropertyValue("--space-offset")).toBe("1");
    expect(panels[2].style.getPropertyValue("--space-offset")).toBe("2");

    fireEvent.click(container.querySelector("#spaces-tab-widgets"));

    const after = container.querySelectorAll('[role="tabpanel"]');
    expect(after[0].style.getPropertyValue("--space-offset")).toBe("-1");
    expect(after[1].style.getPropertyValue("--space-offset")).toBe("0");
    expect(after[2].style.getPropertyValue("--space-offset")).toBe("1");
  });

  it("records a switch from the segmented control", () => {
    const { container, dispatch } = setup();
    fireEvent.click(container.querySelector("#spaces-tab-activity"));
    expect(switchData(dispatch)).toEqual({
      space: "activity",
      previous_space: "stories",
      method: "tab",
    });
  });

  it("does not record re-selecting the active space", () => {
    const { container, dispatch } = setup();
    fireEvent.click(container.querySelector("#spaces-tab-stories"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("advances a space on a horizontal wheel gesture", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    fireEvent.wheel(spaces, { deltaX: 80, deltaY: 0 });

    expect(switchData(dispatch)).toEqual({
      space: "widgets",
      previous_space: "stories",
      method: "swipe",
    });
  });

  it("treats shift plus wheel as horizontal, which Gecko reports as deltaY", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    fireEvent.wheel(spaces, { deltaX: 0, deltaY: 80, shiftKey: true });

    expect(switchData(dispatch)).toEqual({
      space: "widgets",
      previous_space: "stories",
      method: "swipe",
    });
  });

  it("leaves ordinary vertical scrolling alone", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    fireEvent.wheel(spaces, { deltaX: 5, deltaY: 200 });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("spends one wheel gesture on one switch, despite momentum", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    // A flick plus its momentum tail, with no quiet period between.
    for (let i = 0; i < 6; i++) {
      fireEvent.wheel(spaces, { deltaX: 40, deltaY: 0 });
    }

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("advances a space on a touch swipe", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    fireEvent.touchStart(spaces, { touches: [{ clientX: 300, clientY: 100 }] });
    // Dragging left pulls the next space in.
    fireEvent.touchEnd(spaces, {
      changedTouches: [{ clientX: 200, clientY: 105 }],
    });

    expect(switchData(dispatch).space).toBe("widgets");
    expect(switchData(dispatch).method).toBe("swipe");
  });

  it("ignores a mostly-vertical touch drag", () => {
    const { container, dispatch } = setup();
    const spaces = container.querySelector(".spaces-container");

    fireEvent.touchStart(spaces, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(spaces, {
      changedTouches: [{ clientX: 260, clientY: 400 }],
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("traverses with the arrow keys and reports the keyboard as the method", () => {
    const { container, dispatch } = setup();
    const tablist = container.querySelector('[role="tablist"]');

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(switchData(dispatch)).toEqual({
      space: "widgets",
      previous_space: "stories",
      method: "keyboard",
    });

    fireEvent.keyDown(tablist, { key: "End" });
    expect(switchData(dispatch).space).toBe("activity");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(switchData(dispatch).space).toBe("stories");
  });

  it("does not run off either end", () => {
    const { container, dispatch } = setup();
    const tablist = container.querySelector('[role="tablist"]');
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("stays on the same space when an earlier one is turned off", () => {
    const dispatch = jest.fn();
    const { container, rerender } = render(
      <Spaces spaces={SPACES} dispatch={dispatch} />
    );
    fireEvent.click(container.querySelector("#spaces-tab-widgets"));

    // Drop Stories, which shifts every index after it.
    rerender(<Spaces spaces={SPACES.slice(1)} dispatch={dispatch} />);

    expect(
      container
        .querySelector("#spaces-tab-widgets")
        .getAttribute("aria-selected")
    ).toBe("true");
  });

  it("falls back to the leftmost space when the active one is turned off", () => {
    const dispatch = jest.fn();
    const { container, rerender } = render(
      <Spaces spaces={SPACES} dispatch={dispatch} />
    );
    fireEvent.click(container.querySelector("#spaces-tab-activity"));

    rerender(<Spaces spaces={SPACES.slice(0, 2)} dispatch={dispatch} />);

    expect(
      container
        .querySelector("#spaces-tab-stories")
        .getAttribute("aria-selected")
    ).toBe("true");
  });
});
