/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { InterestPicker } from "content-src/components/DiscoveryStreamComponents/InterestPicker/InterestPicker";
import { WrapWithProvider } from "test/jest/test-utils";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { InterestPicker as NovaInterestPicker } from "content-src/components/Nova/InterestPicker/InterestPicker";

describe("<InterestPicker />", () => {
  const DEFAULT_PROPS = {
    title: "Pick your interests",
    subtitle: "Choose topics you care about",
    receivedFeedRank: 1,
    interests: [
      { sectionId: "section-1", title: "Technology", followable: true },
      { sectionId: "section-2", title: "Sports", followable: true },
      { sectionId: "section-3", title: "Hidden", followable: false },
    ],
  };

  it("should filter out interests with followable: false", () => {
    const { container } = render(
      <WrapWithProvider>
        <InterestPicker {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );

    const items = container.querySelectorAll(".topic-item-label");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe("Technology");
    expect(items[1].textContent).toBe("Sports");
  });

  it("should render all interests when all have followable: true", () => {
    const { container } = render(
      <WrapWithProvider>
        <InterestPicker
          {...DEFAULT_PROPS}
          interests={[
            { sectionId: "section-1", title: "Technology", followable: true },
            { sectionId: "section-2", title: "Sports", followable: true },
          ]}
        />
      </WrapWithProvider>
    );

    expect(container.querySelectorAll(".topic-item-label").length).toBe(2);
  });

  it("should render interests when followable is undefined", () => {
    const { container } = render(
      <WrapWithProvider>
        <InterestPicker
          {...DEFAULT_PROPS}
          interests={[
            {
              sectionId: "section-1",
              title: "Technology",
              followable: undefined,
            },
            { sectionId: "section-2", title: "Sports", followable: undefined },
          ]}
        />
      </WrapWithProvider>
    );

    expect(container.querySelectorAll(".topic-item-label").length).toBe(2);
  });

  it("should render no interests when all have followable: false", () => {
    const { container } = render(
      <WrapWithProvider>
        <InterestPicker
          {...DEFAULT_PROPS}
          interests={[
            { sectionId: "section-1", title: "Technology", followable: false },
            { sectionId: "section-2", title: "Sports", followable: false },
          ]}
        />
      </WrapWithProvider>
    );

    expect(container.querySelectorAll(".topic-item-label").length).toBe(0);
  });
});

const PREF_VISIBLE_SECTIONS =
  "discoverystream.sections.interestPicker.visibleSections";

const DEFAULT_INTERESTS = [
  { sectionId: "sports", title: "Sports", followable: true },
  { sectionId: "tech", title: "Technology", followable: true },
  { sectionId: "hidden", title: "Hidden", followable: false },
];

const DEFAULT_PROPS = {
  title: "Pick your interests",
  subtitle: "Choose topics you care about",
  receivedFeedRank: 1,
  interests: DEFAULT_INTERESTS,
};

const BASE_STATE = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      [PREF_VISIBLE_SECTIONS]: "",
    },
  },
};

function renderPicker(props = {}, stateOverrides = {}) {
  const state = { ...BASE_STATE, ...stateOverrides };
  const { container } = render(
    <WrapWithProvider state={state}>
      <NovaInterestPicker {...DEFAULT_PROPS} {...props} />
    </WrapWithProvider>
  );
  return { container };
}

describe("<InterestPicker /> selection behaviour", () => {
  it("filters out interests with followable: false", () => {
    const { container } = renderPicker();
    const buttons = container.querySelectorAll("moz-button");
    expect(buttons).toHaveLength(2);
    expect(container.textContent).not.toContain("Hidden");
  });

  it("renders all interests when all have followable: true", () => {
    const { container } = renderPicker({
      interests: [
        { sectionId: "sports", title: "Sports", followable: true },
        { sectionId: "tech", title: "Technology", followable: true },
      ],
    });
    expect(container.querySelectorAll("moz-button")).toHaveLength(2);
  });

  it("renders interests when followable is undefined", () => {
    const { container } = renderPicker({
      interests: [
        { sectionId: "sports", title: "Sports", followable: undefined },
        { sectionId: "tech", title: "Technology", followable: undefined },
      ],
    });
    expect(container.querySelectorAll("moz-button")).toHaveLength(2);
  });

  it("renders no interests when all have followable: false", () => {
    const { container } = renderPicker({
      interests: [
        { sectionId: "sports", title: "Sports", followable: false },
        { sectionId: "tech", title: "Technology", followable: false },
      ],
    });
    expect(container.querySelectorAll("moz-button")).toHaveLength(0);
  });

  it("sets aria-pressed correctly for checked and unchecked topics", () => {
    const { container } = renderPicker(
      {},
      {
        DiscoveryStream: {
          ...INITIAL_STATE.DiscoveryStream,
          sectionPersonalization: {
            sports: { isFollowed: true },
          },
        },
      }
    );
    const buttons = container.querySelectorAll("moz-button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("dispatches INLINE_SELECTION_CLICK and SECTION_PERSONALIZATION_SET when clicking a topic", () => {
    const store = createStore(combineReducers(reducers), BASE_STATE);
    const dispatchSpy = jest.spyOn(store, "dispatch");
    const { container } = render(
      <Provider store={store}>
        <NovaInterestPicker {...DEFAULT_PROPS} />
      </Provider>
    );

    fireEvent.click(container.querySelectorAll("moz-button")[0]);

    const types = dispatchSpy.mock.calls.map(([action]) => action.type);
    expect(types).toContain(at.INLINE_SELECTION_CLICK);
    const setAction = dispatchSpy.mock.calls
      .map(([a]) => a)
      .find(a => a.type === at.SECTION_PERSONALIZATION_SET);
    expect(setAction.data.sports).toMatchObject({ isFollowed: true });
  });

  it("removes the topic from SECTION_PERSONALIZATION_SET when clicking a checked topic", () => {
    const state = {
      ...BASE_STATE,
      DiscoveryStream: {
        ...INITIAL_STATE.DiscoveryStream,
        sectionPersonalization: { sports: { isFollowed: true } },
      },
    };
    const store = createStore(combineReducers(reducers), state);
    const dispatchSpy = jest.spyOn(store, "dispatch");
    const { container } = render(
      <Provider store={store}>
        <NovaInterestPicker {...DEFAULT_PROPS} />
      </Provider>
    );

    fireEvent.click(container.querySelectorAll("moz-button")[0]);

    const setAction = dispatchSpy.mock.calls
      .map(([a]) => a)
      .find(a => a.type === at.SECTION_PERSONALIZATION_SET);
    expect(setAction.data.sports).toBeUndefined();
  });
});
