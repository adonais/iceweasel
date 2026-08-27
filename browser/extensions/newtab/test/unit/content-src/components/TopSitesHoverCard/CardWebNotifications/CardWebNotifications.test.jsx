import React from "react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { mount } from "enzyme";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { CardWebNotifications } from "content-src/components/TopSitesHoverCard/CardWebNotifications/CardWebNotifications";

const ORIGIN = "https://example.com";

const NOTIFICATIONS = {
  a: {
    id: "a",
    title: "First",
    body: "A",
    origin: ORIGIN,
    timestamp: 100,
  },
  b: {
    id: "b",
    title: "Second",
    origin: ORIGIN,
    timestamp: 300,
  },
  c: {
    id: "c",
    title: "Third",
    origin: ORIGIN,
    timestamp: 200,
  },
  d: {
    id: "d",
    title: "Fourth",
    origin: ORIGIN,
    timestamp: 400,
  },
};
const BY_ORIGIN = { [ORIGIN]: ["a", "b", "c", "d"] };

function mockState({ notifications = {}, byOrigin = {} } = {}) {
  return {
    ...INITIAL_STATE,
    WebNotifications: {
      ...INITIAL_STATE.WebNotifications,
      notifications,
      byOrigin,
    },
  };
}

function renderCard(link, stateOpts) {
  const store = createStore(combineReducers(reducers), mockState(stateOpts));
  const dispatch = sinon.spy(store, "dispatch");
  const wrapper = mount(
    <Provider store={store}>
      <CardWebNotifications link={link} />
    </Provider>
  );
  return { wrapper, dispatch };
}

describe("<CardWebNotifications>", () => {
  const link = { url: `${ORIGIN}/path`, label: "Example" };

  it("renders nothing when the site has no notifications", () => {
    const { wrapper } = renderCard(link, {});
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 0);
  });

  it("renders nothing for a non-http(s) link", () => {
    const { wrapper } = renderCard(
      { url: "about:blank" },
      { notifications: NOTIFICATIONS, byOrigin: BY_ORIGIN }
    );
    assert.lengthOf(wrapper.find(".top-sites-hover-card"), 0);
  });

  it("lists every notification, most recent first", () => {
    const { wrapper } = renderCard(link, {
      notifications: NOTIFICATIONS,
      byOrigin: BY_ORIGIN,
    });
    const titles = wrapper
      .find(".top-sites-hover-card-notification-title")
      .map(node => node.text());
    assert.deepEqual(titles, ["Fourth", "Second", "Third", "First"]);
  });

  it("renders every notification as an activatable button", () => {
    const { wrapper } = renderCard(link, {
      notifications: {
        a: {
          id: "a",
          title: "SW",
          origin: ORIGIN,
          timestamp: 2,
        },
        b: {
          id: "b",
          title: "Page",
          origin: ORIGIN,
          timestamp: 1,
        },
      },
      byOrigin: { [ORIGIN]: ["a", "b"] },
    });
    const activators = wrapper.find(
      ".top-sites-hover-card-notification-activate"
    );
    assert.equal(activators.at(0).type(), "button");
    assert.equal(activators.at(1).type(), "button");
  });

  it("dispatches WEB_NOTIFICATIONS_CLICK when a notification is activated", () => {
    const { wrapper, dispatch } = renderCard(link, {
      notifications: {
        a: {
          id: "a",
          title: "Page",
          origin: ORIGIN,
          timestamp: 1,
        },
      },
      byOrigin: { [ORIGIN]: ["a"] },
    });
    wrapper
      .find("button.top-sites-hover-card-notification-activate")
      .simulate("click");
    assert.isTrue(
      dispatch
        .getCalls()
        .some(c => c.args[0].type === at.WEB_NOTIFICATIONS_CLICK)
    );
  });

  it("dispatches WEB_NOTIFICATIONS_DISMISS from the per-row dismiss", () => {
    const { wrapper, dispatch } = renderCard(link, {
      notifications: {
        a: {
          id: "a",
          title: "A",
          origin: ORIGIN,
          timestamp: 1,
        },
      },
      byOrigin: { [ORIGIN]: ["a"] },
    });
    wrapper
      .find("button.top-sites-hover-card-notification-dismiss")
      .simulate("click");
    const action = dispatch
      .getCalls()
      .map(c => c.args[0])
      .find(a => a.type === at.WEB_NOTIFICATIONS_DISMISS);
    assert.ok(action);
    assert.deepEqual(action.data, { origin: ORIGIN, id: "a" });
  });

  it("dispatches WEB_NOTIFICATIONS_DISMISS_ALL from mark-all-read", () => {
    const { wrapper, dispatch } = renderCard(link, {
      notifications: NOTIFICATIONS,
      byOrigin: BY_ORIGIN,
    });
    wrapper.find("button.top-sites-hover-card-mark-read").simulate("click");
    assert.isTrue(
      dispatch
        .getCalls()
        .some(c => c.args[0].type === at.WEB_NOTIFICATIONS_DISMISS_ALL)
    );
  });

  describe("notification icons", () => {
    function renderWithIcon(icon, site = ORIGIN) {
      const id = "icon-1";
      return renderCard(
        { url: `${site}/path`, label: "Example" },
        {
          notifications: { [id]: { id, title: "T", origin: site, icon } },
          byOrigin: { [site]: [id] },
        }
      );
    }

    it("loads an icon through the image proxy, never from the origin", () => {
      const { wrapper } = renderWithIcon("https://example.com/icon.png");
      const src = wrapper
        .find("img.top-sites-hover-card-notification-icon")
        .prop("src");
      assert.include(src, "https://img-getpocket.cdn.mozilla.net/");
      assert.notEqual(src, "https://example.com/icon.png");
    });

    it("renders no icon when the icon cannot be proxied", () => {
      const { wrapper } = renderWithIcon("http://example.com/icon.png");
      assert.lengthOf(
        wrapper.find("img.top-sites-hover-card-notification-icon"),
        0
      );
    });

    it("renders no icon for a suppressed origin", () => {
      const { wrapper } = renderWithIcon(
        "https://apnews.com/icon.png",
        "https://apnews.com"
      );
      assert.lengthOf(
        wrapper.find("img.top-sites-hover-card-notification-icon"),
        0
      );
    });

    it("drops the icon on a proxy error rather than retrying the origin", () => {
      const { wrapper } = renderWithIcon("https://example.com/icon.png");
      wrapper
        .find("img.top-sites-hover-card-notification-icon")
        .simulate("error");
      assert.lengthOf(
        wrapper.find("img.top-sites-hover-card-notification-icon"),
        0
      );
    });
  });
});
