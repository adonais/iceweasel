/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { RecentSearches } from "content-src/components/Widgets/RecentSearches/RecentSearches";

const mockState = {
  ...INITIAL_STATE,
  App: { ...INITIAL_STATE.App, locale: "en-US" },
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "widgets.system.enabled": true,
      "widgets.system.recentSearches.enabled": true,
      "widgets.recentSearches.enabled": true,
      "widgets.recentSearches.size": "medium",
      "widgets.recentSearches.interaction": false,
    },
  },
};

const HOUR = 60 * 60 * 1000;

function withSearchesState(
  searches = [
    { value: "alpha", lastUsed: Date.now() - 2 * HOUR },
    { value: "beta", lastUsed: Date.now() - 3 * HOUR },
  ],
  // Null is "the engine has not been asked yet", as the store starts.
  trending = null,
  engineName = "Google"
) {
  return {
    ...mockState,
    RecentSearches: { initialized: true, searches, trending, engineName },
  };
}

function WrapWithProvider({ children, state = INITIAL_STATE, storeRef }) {
  const store = createStore(combineReducers(reducers), state);
  if (storeRef) {
    storeRef.current = store;
  }
  return <Provider store={store}>{children}</Provider>;
}

function renderWidget(dispatch = jest.fn(), props = {}, state = mockState) {
  const handleUserInteraction = props.handleUserInteraction || jest.fn();
  const storeRef = { current: null };
  const { container, unmount } = render(
    <WrapWithProvider state={state} storeRef={storeRef}>
      <RecentSearches
        dispatch={dispatch}
        handleUserInteraction={handleUserInteraction}
        widgetsMayBeMaximized={true}
        widgetEnabledMap={{}}
        {...props}
      />
    </WrapWithProvider>
  );
  return {
    container,
    unmount,
    dispatch,
    handleUserInteraction,
    store: storeRef.current,
  };
}

describe("RecentSearches widget", () => {
  it("renders the widget at the resolved size", () => {
    const { container } = renderWidget();
    const root = container.querySelector("article.recent-searches");
    expect(root).toBeTruthy();
    expect(root.className).toContain("medium-widget");
  });

  it("renders the localized title", () => {
    const { container } = renderWidget();
    const title = container.querySelector(".recent-searches-title");
    expect(title.getAttribute("data-l10n-id")).toBe(
      "newtab-recent-searches-widget-title"
    );
  });

  it("renders a labelled context menu button", () => {
    const { container } = renderWidget();
    expect(
      container.querySelector(
        ".recent-searches-context-menu-button[data-l10n-id='newtab-recent-searches-widget-menu-button']"
      )
    ).toBeTruthy();
  });

  it("renders an empty body before the first update arrives", () => {
    const { container } = renderWidget();
    const body = container.querySelector(".recent-searches-body");
    expect(body).toBeTruthy();
    expect(body.children.length).toBe(0);
  });

  it("shows an empty state once there are no searches to show", () => {
    const { container } = renderWidget(jest.fn(), {}, withSearchesState([]));
    const empty = container.querySelector(".recent-searches-empty-message");
    expect(empty.getAttribute("data-l10n-id")).toBe(
      "newtab-recent-searches-empty-recent"
    );
    expect(container.querySelectorAll(".recent-searches-row")).toHaveLength(0);
  });

  it("renders a row per search from the store", () => {
    const { container } = renderWidget(jest.fn(), {}, withSearchesState());
    const rows = container.querySelectorAll(".recent-searches-row");
    expect(rows).toHaveLength(2);
    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(["alpha", "beta"]);
  });

  it("shows how long ago each search was made", () => {
    const { container } = renderWidget(jest.fn(), {}, withSearchesState());
    const times = container.querySelectorAll(".recent-searches-row-time");
    expect(times[0].textContent).toBe("2 hours ago");
    expect(times[1].textContent).toBe("3 hours ago");
    // A machine-readable timestamp for the same moment.
    expect(times[0].getAttribute("datetime")).toMatch(/^\d{4}-/);
  });

  it("shows a search made in the last minute as just now", () => {
    const { container } = renderWidget(
      jest.fn(),
      {},
      withSearchesState([{ value: "alpha", lastUsed: Date.now() - 30 * 1000 }])
    );
    const [time] = container.querySelectorAll(".recent-searches-row-time");
    expect(time.getAttribute("data-l10n-id")).toBe(
      "newtab-recent-searches-just-now"
    );
    expect(time.textContent).toBe("");
    expect(time.getAttribute("datetime")).toMatch(/^\d{4}-/);
  });

  it("opens the search on click, with the click's modifiers", () => {
    const dispatch = jest.fn();
    const { container } = renderWidget(dispatch, {}, withSearchesState());
    fireEvent.click(container.querySelector(".recent-searches-row-search"), {
      ctrlKey: true,
    });

    const actions = dispatch.mock.calls.map(([a]) => a);
    const [action] = actions.filter(
      a => a?.type === at.WIDGETS_RECENT_SEARCHES_OPEN_LINK
    );
    expect(action.data.search).toBe("alpha");
    expect(action.data.eventInfo).toMatchObject({ ctrlKey: true });

    const userEvents = actions.filter(a => a?.type === at.WIDGETS_USER_EVENT);
    expect(userEvents).toHaveLength(1);
    expect(userEvents[0].data).toEqual(
      expect.objectContaining({
        widget_name: "recent_searches",
        widget_source: "widget",
        user_action: "open_link",
        widget_size: "medium",
      })
    );

    // Check the telemetry does not include the search.
    for (const event of userEvents) {
      expect(JSON.stringify(event)).not.toContain("alpha");
    }
  });

  it("marks the widget as interacted with when a search is opened", () => {
    const { container, handleUserInteraction } = renderWidget(
      jest.fn(),
      {},
      withSearchesState()
    );
    fireEvent.click(container.querySelector(".recent-searches-row-search"));
    expect(handleUserInteraction).toHaveBeenCalledWith("recentSearches");
  });

  it("offers a remove button per search, labelled with the search", () => {
    const { container } = renderWidget(jest.fn(), {}, withSearchesState());
    const removes = [
      ...container.querySelectorAll(".recent-searches-row-remove"),
    ];
    expect(removes).toHaveLength(2);
    expect(removes.map(el => el.getAttribute("data-l10n-id"))).toEqual([
      "newtab-recent-searches-row-remove",
      "newtab-recent-searches-row-remove",
    ]);
    expect(JSON.parse(removes[0].getAttribute("data-l10n-args"))).toStrictEqual(
      {
        search: "alpha",
      }
    );
  });

  it("forgets the search, and does not open it, when a row is removed", () => {
    const dispatch = jest.fn();
    const { container } = renderWidget(dispatch, {}, withSearchesState());
    fireEvent.click(container.querySelector(".recent-searches-row-remove"));

    const actions = dispatch.mock.calls.map(([action]) => action);
    const [removed] = actions.filter(
      action => action?.type === at.WIDGETS_RECENT_SEARCHES_REMOVE_SEARCH
    );
    expect(removed.data.search).toBe("alpha");
    expect(
      actions.some(
        action => action?.type === at.WIDGETS_RECENT_SEARCHES_OPEN_LINK
      )
    ).toBe(false);

    const userEvents = actions.filter(a => a?.type === at.WIDGETS_USER_EVENT);
    expect(userEvents).toHaveLength(1);
    expect(userEvents[0].data).toEqual(
      expect.objectContaining({
        widget_name: "recent_searches",
        widget_source: "widget",
        user_action: "remove_search",
        widget_size: "medium",
      })
    );

    // Check the telemetry does not include the search.
    for (const event of userEvents) {
      expect(JSON.stringify(event)).not.toContain("alpha");
    }
  });

  it("shows the New badge until the widget has been interacted with", () => {
    const { container } = renderWidget();
    expect(container.querySelector(".recent-searches-new-badge")).toBeTruthy();
  });

  it("offers only medium and large in the size submenu", () => {
    const { container } = renderWidget();
    const sizes = Array.from(
      container.querySelectorAll("panel-item[data-size]")
    ).map(el => el.getAttribute("data-size"));
    expect(sizes).toEqual(["medium", "large"]);
  });

  it("omits the size submenu when the layout cannot maximize", () => {
    const { container } = renderWidget(jest.fn(), {
      widgetsMayBeMaximized: false,
    });
    expect(
      container.querySelector("panel-list[id='recent-searches-size-submenu']")
    ).toBeNull();
  });

  it("renders the shared menu footer without a leading divider", () => {
    const { container } = renderWidget();
    const menu = container.querySelector(
      "panel-list[id='recent-searches-context-menu']"
    );
    expect(menu).toBeTruthy();
    expect(menu.querySelector("hr")).toBeNull();
    expect(
      menu.querySelector("panel-item[data-l10n-id='newtab-widget-menu-hide']")
    ).toBeTruthy();
    expect(
      menu.querySelector(
        "panel-item[data-l10n-id='newtab-recent-searches-menu-learn-more']"
      )
    ).toBeTruthy();
  });

  describe("context menu actions", () => {
    it("picking a size writes the pref and records change_size", () => {
      const { container, dispatch, handleUserInteraction } = renderWidget();
      fireEvent.click(
        container.querySelector(
          "#recent-searches-size-submenu panel-item[data-size='large']"
        )
      );

      const setPref = dispatch.mock.calls.find(
        ([action]) =>
          action?.type === at.SET_PREF &&
          action.data?.name === "widgets.recentSearches.size"
      );
      expect(setPref[0].data.value).toBe("large");

      const userEvent = dispatch.mock.calls.find(
        ([action]) =>
          action?.type === at.WIDGETS_USER_EVENT &&
          action.data?.user_action === "change_size"
      );
      // widget_size must be the NEW size, not the pre-change one.
      expect(userEvent[0].data).toMatchObject({
        widget_name: "recent_searches",
        widget_source: "context_menu",
        action_value: "large",
        widget_size: "large",
      });
      expect(handleUserInteraction).toHaveBeenCalledWith("recentSearches");
    });

    it("Learn more records the event without opening the link itself", () => {
      const { container, dispatch, handleUserInteraction } = renderWidget();
      fireEvent.click(
        container.querySelector(
          "panel-item[data-l10n-id='newtab-recent-searches-menu-learn-more']"
        )
      );

      const userEvent = dispatch.mock.calls.find(
        ([action]) =>
          action?.type === at.WIDGETS_USER_EVENT &&
          action.data?.user_action === "learn_more"
      );
      expect(userEvent[0].data).toMatchObject({
        widget_name: "recent_searches",
        widget_source: "context_menu",
      });
      expect(handleUserInteraction).toHaveBeenCalledWith("recentSearches");
    });
  });

  describe("impression telemetry", () => {
    let originalIntersectionObserver;
    let observerInstances;

    beforeEach(() => {
      observerInstances = [];
      originalIntersectionObserver = global.IntersectionObserver;
      global.IntersectionObserver = class MockIntersectionObserver {
        constructor(callback) {
          this.callback = callback;
          this.observed = [];
          observerInstances.push(this);
        }
        observe(el) {
          this.observed.push(el);
        }
        unobserve() {}
        disconnect() {}
      };
    });

    afterEach(() => {
      global.IntersectionObserver = originalIntersectionObserver;
    });

    it("dispatches WIDGETS_IMPRESSION once, keyed on the telemetry name", () => {
      const dispatch = jest.fn();
      renderWidget(dispatch);
      const [observer] = observerInstances;
      const [target] = observer.observed;

      observer.callback([{ isIntersecting: true, target }], observer);
      observer.callback([{ isIntersecting: true, target }], observer);

      const impressions = dispatch.mock.calls.filter(
        ([action]) => action?.type === at.WIDGETS_IMPRESSION
      );
      expect(impressions).toHaveLength(1);
      expect(impressions[0][0].data).toMatchObject({
        widget_name: "recent_searches",
        widget_size: "medium",
      });
    });
  });
});

describe("RecentSearches trending tab", () => {
  const TRENDING = ["nirvana", "frightened rabbit"];
  const TAB_PREF = "widgets.recentSearches.tab";

  function renderWithTrending(dispatch = jest.fn()) {
    return renderWidget(dispatch, {}, withSearchesState(undefined, TRENDING));
  }

  function pickTab(container, store, tab) {
    fireEvent.click(container.querySelector(`#recent-searches-${tab}-tab`));
    act(() => {
      store.dispatch({
        type: at.PREF_CHANGED,
        data: { name: TAB_PREF, value: tab },
      });
    });
  }

  it("offers both tabs", () => {
    const { container } = renderWidget(jest.fn(), {}, withSearchesState());
    const tabs = [...container.querySelectorAll(".recent-searches-tab")];
    expect(tabs.map(tab => tab.hidden)).toEqual([false, false]);
    expect(
      [...container.querySelectorAll(".recent-searches-tab-label")].map(label =>
        label.getAttribute("data-l10n-id")
      )
    ).toEqual([
      "newtab-recent-searches-tab-recent",
      "newtab-recent-searches-tab-trending",
    ]);
  });

  it("shows an empty state when the engine has nothing trending", () => {
    const { container, store } = renderWidget(
      jest.fn(),
      {},
      withSearchesState(undefined, [])
    );
    pickTab(container, store, "trending");

    const empty = container.querySelector(".recent-searches-empty-message");
    expect(empty.getAttribute("data-l10n-id")).toBe(
      "newtab-recent-searches-empty-trending"
    );
  });

  it("shows no empty state while the engine has yet to answer", () => {
    const { container, store } = renderWidget(
      jest.fn(),
      {},
      withSearchesState()
    );
    pickTab(container, store, "trending");

    expect(container.querySelector(".recent-searches-empty")).toBeNull();
  });

  it("remembers the tab picked, for the next tab the user opens", () => {
    const dispatch = jest.fn();
    const { container } = renderWithTrending(dispatch);
    fireEvent.click(container.querySelectorAll(".recent-searches-tab")[1]);

    expect(
      dispatch.mock.calls
        .map(([action]) => action)
        .find(
          action =>
            action?.type === at.SET_PREF && action.data?.name === TAB_PREF
        ).data.value
    ).toBe("trending");

    const tabs = [...container.querySelectorAll(".recent-searches-tab")];
    expect(tabs.map(tab => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(["alpha", "beta"]);
  });

  // A new tab is often one that was preloaded before the pref changed, and it
  // learns about the change from PrefsFeed rather than at mount.
  it("moves to the remembered tab when the pref changes after mount", () => {
    const { container, store } = renderWidget(
      jest.fn(),
      {},
      withSearchesState(undefined, TRENDING)
    );
    const tabs = [...container.querySelectorAll(".recent-searches-tab")];
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    act(() => {
      store.dispatch({
        type: at.PREF_CHANGED,
        data: { name: "widgets.recentSearches.tab", value: "trending" },
      });
    });

    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(TRENDING);
  });

  it("opens on the tab the pref remembers", () => {
    const state = withSearchesState(undefined, TRENDING);
    state.Prefs = {
      ...state.Prefs,
      values: {
        ...state.Prefs.values,
        "widgets.recentSearches.tab": "trending",
      },
    };
    const { container } = renderWidget(jest.fn(), {}, state);

    const tabs = [...container.querySelectorAll(".recent-searches-tab")];
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(TRENDING);
  });

  it("starts on the searches tab", () => {
    const { container } = renderWithTrending();
    const tabs = [...container.querySelectorAll(".recent-searches-tab")];
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
  });

  it("swaps the rows for the trending searches when the tab is picked", () => {
    const { container, store } = renderWithTrending();
    pickTab(container, store, "trending");

    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(TRENDING);
    // Trending searches have no age to show.
    expect(
      container.querySelectorAll(".recent-searches-row-time")
    ).toHaveLength(0);
  });

  it("credits the engine the trending searches came from", () => {
    const { container, store } = renderWithTrending();
    pickTab(container, store, "trending");

    const attribution = container.querySelector(
      ".recent-searches-trending-attribution"
    );
    expect(attribution.getAttribute("data-l10n-id")).toBe(
      "newtab-recent-searches-trending-attribution"
    );
    expect(
      JSON.parse(attribution.getAttribute("data-l10n-args"))
    ).toStrictEqual({ engine: "Google" });
  });

  it("offers no remove button on the trending tab", () => {
    const { container, store } = renderWithTrending();
    pickTab(container, store, "trending");

    expect(
      container.querySelectorAll(".recent-searches-row-remove")
    ).toHaveLength(0);
  });

  it("renders every trending search, clipping as the searches tab does", () => {
    const { container, store } = renderWidget(
      jest.fn(),
      {},
      withSearchesState(undefined, ["nirvana", "frightened rabbit", "mogwai"])
    );
    pickTab(container, store, "trending");

    expect(
      [...container.querySelectorAll(".recent-searches-row-label")].map(
        label => label.textContent
      )
    ).toEqual(["nirvana", "frightened rabbit", "mogwai"]);
  });

  it("records the tab change and opens a trending search on click", () => {
    const dispatch = jest.fn();
    const { container, store } = renderWithTrending(dispatch);
    pickTab(container, store, "trending");
    fireEvent.click(container.querySelector(".recent-searches-row-search"));

    const actions = dispatch.mock.calls.map(([action]) => action);
    expect(
      actions.find(
        action =>
          action?.type === at.WIDGETS_USER_EVENT &&
          action.data?.user_action === "change_tab"
      )?.data
    ).toMatchObject({ action_value: "trending" });
    expect(
      actions.find(
        action => action?.type === at.WIDGETS_RECENT_SEARCHES_OPEN_LINK
      ).data.search
    ).toBe(TRENDING[0]);
  });
});
