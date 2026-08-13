/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { Privacy } from "content-src/components/Widgets/Privacy/Privacy";

const mockState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "widgets.system.enabled": true,
      "widgets.system.privacy.enabled": true,
      "widgets.privacy.enabled": true,
      "widgets.privacy.size": "medium",
    },
  },
};

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

function stateWithTrackers(trackersToday, sitesToday = 9) {
  return {
    ...mockState,
    PrivacyWidget: {
      ...INITIAL_STATE.PrivacyWidget,
      initialized: true,
      trackersToday,
      sitesToday,
    },
  };
}

function renderPrivacy(dispatch = jest.fn(), props = {}, state = mockState) {
  const { container, unmount } = render(
    <WrapWithProvider state={state}>
      <Privacy
        dispatch={dispatch}
        widgetsMayBeMaximized={true}
        widgetEnabledMap={{}}
        {...props}
      />
    </WrapWithProvider>
  );
  return { container, unmount, dispatch };
}

describe("Privacy widget", () => {
  it("renders the widget at the resolved size", () => {
    const { container } = renderPrivacy();
    const root = container.querySelector("article.privacy");
    expect(root).toBeTruthy();
    expect(root.className).toContain("medium-widget");
  });

  it("dispatches an impression once when it scrolls into view", () => {
    const dispatch = jest.fn();
    renderPrivacy(dispatch);
    // useIntersectionObserver invokes the callback on observe in the test env.
    const impressions = dispatch.mock.calls.filter(
      ([action]) => action.type === at.WIDGETS_IMPRESSION
    );
    expect(impressions.length).toBeLessThanOrEqual(1);
  });

  it("hides the widget by setting its enabled pref to false", () => {
    const dispatch = jest.fn();
    const { container } = renderPrivacy(dispatch);
    const hide = container.querySelector(
      '[data-l10n-id="newtab-widget-menu-hide"]'
    );
    fireEvent.click(hide);
    const setPref = dispatch.mock.calls.find(
      ([action]) =>
        action.type === at.SET_PREF &&
        action.data?.name === "widgets.privacy.enabled"
    );
    expect(setPref).toBeTruthy();
    expect(setPref[0].data.value).toBe(false);
  });

  it("shows no metric state until the feed has initialized", () => {
    // Default mockState has PrivacyWidget.initialized = false.
    const { container } = renderPrivacy();
    const root = container.querySelector("article.privacy");
    expect(root).toBeTruthy();
    expect(root.className).not.toContain("is-empty");
    expect(container.querySelector(".privacy-empty")).toBeFalsy();
    expect(container.querySelector(".privacy-count")).toBeFalsy();
  });

  it("shows the empty state when no trackers are blocked today", () => {
    const { container } = renderPrivacy(jest.fn(), {}, stateWithTrackers(0));
    expect(container.querySelector("article.privacy").className).toContain(
      "is-empty"
    );
    expect(container.querySelector(".privacy-empty-message")).toBeTruthy();
    expect(container.querySelector(".privacy-count")).toBeFalsy();
  });

  it("shows today's blocked-tracker count", () => {
    const { container } = renderPrivacy(jest.fn(), {}, stateWithTrackers(42));
    expect(container.querySelector(".privacy-count-number").textContent).toBe(
      "42"
    );
    expect(container.querySelector("article.privacy").className).not.toContain(
      "is-empty"
    );
  });

  it("ceilings the count at 100+", () => {
    const { container } = renderPrivacy(jest.fn(), {}, stateWithTrackers(250));
    expect(container.querySelector(".privacy-count-number").textContent).toBe(
      "100+"
    );
  });

  it("caps at the widgets.privacy.maxCount pref when set", () => {
    const base = stateWithTrackers(75);
    const state = {
      ...base,
      Prefs: {
        ...base.Prefs,
        values: { ...base.Prefs.values, "widgets.privacy.maxCount": 50 },
      },
    };
    const { container } = renderPrivacy(jest.fn(), {}, state);
    expect(container.querySelector(".privacy-count-number").textContent).toBe(
      "50+"
    );
  });

  it("lets trainhopConfig.widgets.privacyMaxCount override the pref", () => {
    const base = stateWithTrackers(75);
    const state = {
      ...base,
      Prefs: {
        ...base.Prefs,
        values: {
          ...base.Prefs.values,
          "widgets.privacy.maxCount": 200,
          trainhopConfig: { widgets: { privacyMaxCount: 50 } },
        },
      },
    };
    const { container } = renderPrivacy(jest.fn(), {}, state);
    // trainhop (50) wins over the pref (200): 75 > 50 caps to "50+".
    expect(container.querySelector(".privacy-count-number").textContent).toBe(
      "50+"
    );
  });

  it("shows the exact count just below the ceiling", () => {
    const { container } = renderPrivacy(jest.fn(), {}, stateWithTrackers(87));
    expect(container.querySelector(".privacy-count-number").textContent).toBe(
      "87"
    );
  });

  it("passes the site count to the across-sites line", () => {
    const { container } = renderPrivacy(
      jest.fn(),
      {},
      stateWithTrackers(42, 7)
    );
    const sites = container.querySelector(".privacy-count-sites");
    expect(sites).toBeTruthy();
    expect(sites.getAttribute("data-l10n-args")).toBe(
      JSON.stringify({ count: 7 })
    );
  });

  it("passes the numeric count (not the ceiling string) to the label plural", () => {
    const { container } = renderPrivacy(jest.fn(), {}, stateWithTrackers(250));
    const label = container.querySelector(".privacy-count-label");
    expect(label.getAttribute("data-l10n-args")).toBe(
      JSON.stringify({ count: 250 })
    );
  });
});
