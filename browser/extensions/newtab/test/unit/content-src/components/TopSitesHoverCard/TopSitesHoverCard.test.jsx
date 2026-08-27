import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { TopSitesHoverCard } from "content-src/components/TopSitesHoverCard/TopSitesHoverCard";

const ORIGIN = "https://example.com";
const NOTIFICATIONS = {
  a: { id: "a", title: "A", origin: ORIGIN, persistent: true, timestamp: 1 },
};
const BY_ORIGIN = { [ORIGIN]: ["a"] };

function mockState(enabled, { gate = true } = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: {
        ...INITIAL_STATE.Prefs.values,
        "system.showWebNotifications": gate,
        showWebNotifications: enabled,
      },
    },
    WebNotifications: {
      ...INITIAL_STATE.WebNotifications,
      notifications: NOTIFICATIONS,
      byOrigin: BY_ORIGIN,
    },
  };
}

function render(link, enabled, opts) {
  const store = createStore(
    combineReducers(reducers),
    mockState(enabled, opts)
  );
  return mount(
    <Provider store={store}>
      <TopSitesHoverCard link={link} />
    </Provider>
  );
}

describe("<TopSitesHoverCard>", () => {
  const link = { url: `${ORIGIN}/path`, label: "Example" };

  it("renders nothing when the user pref is off", () => {
    const wrapper = render(link, false);
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 0);
  });

  it("renders nothing when the feature gate is off", () => {
    const wrapper = render(link, true, { gate: false });
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 0);
  });

  it("routes an ordinary tile to the notifications card", () => {
    const wrapper = render(link, true);
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 1);
  });

  it("routes a sponsored tile to the ad variant (no notifications card)", () => {
    const wrapper = render(
      { url: `${ORIGIN}/path`, label: "Ad", sponsored_tile_id: 42 },
      true
    );
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 0);
  });
});
