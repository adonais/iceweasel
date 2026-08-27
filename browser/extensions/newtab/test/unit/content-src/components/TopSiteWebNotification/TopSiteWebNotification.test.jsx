import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { TopSiteWebNotification } from "content-src/components/TopSiteWebNotification/TopSiteWebNotification";

const ORIGIN = "https://example.com";

function mockState({
  enabled = true,
  gate = true,
  byOrigin = {},
  notifications = {},
} = {}) {
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
      notifications,
      byOrigin,
    },
  };
}

function render(link, stateOpts) {
  const store = createStore(combineReducers(reducers), mockState(stateOpts));
  return mount(
    <Provider store={store}>
      <TopSiteWebNotification link={link} />
    </Provider>
  );
}

describe("<TopSiteWebNotification>", () => {
  const link = { url: `${ORIGIN}/path` };
  const populated = {
    byOrigin: { [ORIGIN]: ["a", "b"] },
    notifications: { a: { id: "a" }, b: { id: "b" } },
  };

  it("renders the count when enabled and the site has notifications", () => {
    const wrapper = render(link, { enabled: true, ...populated });
    const badge = wrapper.find(".top-site-web-notification");
    assert.lengthOf(badge, 1);
    assert.equal(badge.text(), "2");
  });

  it("renders nothing when the user pref is off", () => {
    const wrapper = render(link, { enabled: false, ...populated });
    assert.lengthOf(wrapper.find(".top-site-web-notification"), 0);
  });

  it("renders nothing when the feature gate is off", () => {
    const wrapper = render(link, { gate: false, ...populated });
    assert.lengthOf(wrapper.find(".top-site-web-notification"), 0);
  });

  it("renders nothing when the site has no notifications", () => {
    const wrapper = render(link, { enabled: true });
    assert.lengthOf(wrapper.find(".top-site-web-notification"), 0);
  });

  it("resolves the count through the apex alias", () => {
    const wrapper = render(
      { url: "https://gmail.com" },
      {
        enabled: true,
        byOrigin: { "https://mail.google.com": ["x"] },
        notifications: { x: { id: "x" } },
      }
    );
    assert.equal(wrapper.find(".top-site-web-notification").text(), "1");
  });
});
