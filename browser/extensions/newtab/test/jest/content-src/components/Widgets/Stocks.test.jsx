/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { Stocks } from "content-src/components/Widgets/Stocks/Stocks";

const mockState = {
  ...INITIAL_STATE,
  Prefs: {
    ...INITIAL_STATE.Prefs,
    values: {
      ...INITIAL_STATE.Prefs.values,
      "widgets.system.enabled": true,
      "widgets.system.stocks.enabled": true,
      "widgets.stocks.enabled": true,
      "widgets.stocks.size": "medium",
    },
  },
};

function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

function renderStocks(dispatch = jest.fn(), props = {}) {
  const { container, unmount } = render(
    <WrapWithProvider state={mockState}>
      <Stocks
        dispatch={dispatch}
        handleUserInteraction={jest.fn()}
        widgetsMayBeMaximized={true}
        widgetEnabledMap={{}}
        {...props}
      />
    </WrapWithProvider>
  );
  return { container, unmount, dispatch };
}

describe("Stocks widget", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the widget at the resolved size", () => {
    const { container } = renderStocks();
    const root = container.querySelector("article.stocks");
    expect(root).toBeTruthy();
    expect(root.className).toContain("medium-widget");
  });

  it("renders an always-visible localized title", () => {
    const { container } = renderStocks();
    const title = container.querySelector(
      '[data-l10n-id="newtab-stocks-widget-title"]'
    );
    expect(title).toBeTruthy();
    expect(title.getAttribute("aria-hidden")).toBeNull();
  });

  it("offers medium and large sizes only", () => {
    const { container } = renderStocks();
    const items = [
      ...container.querySelectorAll(
        "#stocks-size-submenu panel-item[type='checkbox']"
      ),
    ];
    const sizes = items.map(el => el.getAttribute("data-size"));
    expect(sizes).toEqual(["medium", "large"]);
    expect(items.every(el => !el.hasAttribute("disabled"))).toBe(true);
  });

  it("hides the widget by setting its enabled pref to false", () => {
    const dispatch = jest.fn();
    const { container } = renderStocks(dispatch);
    const hide = container.querySelector(
      '[data-l10n-id="newtab-widget-menu-hide"]'
    );
    fireEvent.click(hide);
    const setPref = dispatch.mock.calls.find(
      ([action]) =>
        action.type === at.SET_PREF &&
        action.data?.name === "widgets.stocks.enabled"
    );
    expect(setPref).toBeTruthy();
    expect(setPref[0].data.value).toBe(false);
  });

  it("records a telemetry event for the ticker-search stub", () => {
    const dispatch = jest.fn();
    const { container } = renderStocks(dispatch);
    const search = container.querySelector(
      '[data-l10n-id="newtab-stocks-menu-search"]'
    );
    fireEvent.click(search);
    const evt = dispatch.mock.calls.find(
      ([action]) =>
        action.type === at.WIDGETS_USER_EVENT &&
        action.data?.user_action === "search_tickers"
    );
    expect(evt).toBeTruthy();
    expect(evt[0].data).toMatchObject({
      widget_name: "stocks",
      widget_source: "context_menu",
      widget_size: "medium",
    });
    expect(evt[0].data.action_value).toBeUndefined();
  });

  it("records the change_size user event with the new size", () => {
    const dispatch = jest.fn();
    const { container } = renderStocks(dispatch);
    fireEvent.click(
      container.querySelector(
        '#stocks-size-submenu panel-item[data-size="large"]'
      )
    );
    const evt = dispatch.mock.calls.find(
      ([action]) =>
        action.type === at.WIDGETS_USER_EVENT &&
        action.data?.user_action === "change_size"
    );
    expect(evt).toBeTruthy();
    expect(evt[0].data).toMatchObject({
      widget_name: "stocks",
      widget_source: "context_menu",
      user_action: "change_size",
      action_value: "large",
      widget_size: "large",
    });
  });

  describe("interaction pref", () => {
    function renderWithInteraction() {
      const handleUserInteraction = jest.fn();
      const { container } = renderStocks(jest.fn(), { handleUserInteraction });
      return { container, handleUserInteraction };
    }

    it("flips the interaction pref on change_size", () => {
      const { container, handleUserInteraction } = renderWithInteraction();
      fireEvent.click(
        container.querySelector(
          '#stocks-size-submenu panel-item[data-size="large"]'
        )
      );
      expect(handleUserInteraction).toHaveBeenCalledWith("stocks");
    });

    it("flips the interaction pref on search_tickers", () => {
      const { container, handleUserInteraction } = renderWithInteraction();
      fireEvent.click(
        container.querySelector('[data-l10n-id="newtab-stocks-menu-search"]')
      );
      expect(handleUserInteraction).toHaveBeenCalledWith("stocks");
    });

    it("flips the interaction pref on learn_more", () => {
      const { container, handleUserInteraction } = renderWithInteraction();
      fireEvent.click(
        container.querySelector(
          '[data-l10n-id="newtab-stocks-menu-learn-more"]'
        )
      );
      expect(handleUserInteraction).toHaveBeenCalledWith("stocks");
    });

    it("does not flip the interaction pref when hiding the widget", () => {
      const { container, handleUserInteraction } = renderWithInteraction();
      fireEvent.click(
        container.querySelector('[data-l10n-id="newtab-widget-menu-hide"]')
      );
      expect(handleUserInteraction).not.toHaveBeenCalled();
    });
  });

  function renderStocksWithTickers(tickers, size = "medium") {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: { ...mockState.Prefs.values, "widgets.stocks.size": size },
      },
      Stocks: { tickers, lastUpdated: 1 },
    };
    return render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
  }

  // Matches what Merino actually returns: last_price ends with " USD" and
  // todays_change_perc has no "%". The widget formats both for display.
  const SAMPLE = [
    {
      ticker: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      last_price: "$559.44 USD",
      todays_change_perc: "+0.2",
    },
    {
      ticker: "ONEQ",
      name: "Fidelity Nasdaq Composite",
      last_price: "$70.10 USD",
      todays_change_perc: "-0.21",
    },
    {
      ticker: "DIA",
      name: "SPDR Dow Jones ETF",
      last_price: "$430.00 USD",
      todays_change_perc: "0.00",
    },
    {
      ticker: "IWM",
      name: "iShares Russell 2000 ETF",
      last_price: "$220.00 USD",
      todays_change_perc: "+1.0",
    },
  ];

  it("renders one card per ticker in the medium grid with formatted price and change", () => {
    const { container } = renderStocksWithTickers(SAMPLE, "medium");
    expect(
      container.querySelectorAll(".stocks-grid .stock-ticker").length
    ).toBe(4);
    expect(container.querySelector(".stock-ticker-symbol").textContent).toBe(
      "SPY"
    );
    expect(container.querySelector(".stock-ticker-price").textContent).toBe(
      "$559.44"
    );
    expect(container.querySelector(".stock-ticker-change").textContent).toBe(
      "+0.2%"
    );
  });

  it("renders placeholder cards before data arrives", () => {
    const { container } = renderStocksWithTickers([], "medium");
    expect(container.querySelector(".stocks-grid--loading")).toBeTruthy();
    expect(
      container.querySelectorAll(".stocks-grid .stock-ticker").length
    ).toBe(4);
    expect(container.querySelectorAll(".stock-ticker-sr").length).toBe(0);
  });

  it("renders the large size as a vertical list showing full names", () => {
    const { container } = renderStocksWithTickers(SAMPLE, "large");
    expect(container.querySelector(".stocks-grid")).toBeNull();
    expect(
      container.querySelectorAll(".stocks-list .stock-ticker--large").length
    ).toBe(4);
    expect(container.querySelector(".stock-ticker-name").textContent).toBe(
      "SPDR S&P 500 ETF Trust"
    );
    expect(container.querySelector(".stock-ticker-price").textContent).toBe(
      "$559.44"
    );
    expect(container.querySelector(".stock-ticker-change").textContent).toBe(
      "+0.2%"
    );
  });

  it("renders placeholder cards before data arrives at the large size", () => {
    const { container } = renderStocksWithTickers([], "large");
    expect(container.querySelector(".stocks-list--loading")).toBeTruthy();
    expect(
      container.querySelectorAll(".stocks-list .stock-ticker--large").length
    ).toBe(4);
    expect(container.querySelectorAll(".stock-ticker-sr").length).toBe(0);
  });

  function renderStocksWithError(size) {
    const state = {
      Stocks: { tickers: [], lastUpdated: null, error: true },
      Prefs: { values: { "widgets.stocks.size": size } },
    };
    return render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
  }

  it("renders the error box (icon + message) at medium when error and no data", () => {
    const { container } = renderStocksWithError("medium");
    expect(container.querySelector(".stocks-error")).toBeTruthy();
    expect(
      container.querySelector(".stocks-error .icon-info-warning")
    ).toBeTruthy();
    expect(
      container.querySelector(
        "[data-l10n-id='newtab-stocks-error-not-available']"
      )
    ).toBeTruthy();
    expect(container.querySelector(".stocks-grid")).toBeNull();
  });

  it("renders the error box at large when error and no data", () => {
    const { container } = renderStocksWithError("large");
    expect(container.querySelector(".stocks-error")).toBeTruthy();
    expect(container.querySelector(".stocks-list")).toBeNull();
  });

  it("shows data, not the error box, when tickers exist even if error is set", () => {
    const state = {
      Stocks: { tickers: SAMPLE, lastUpdated: 1, error: true },
      Prefs: { values: { "widgets.stocks.size": "medium" } },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".stocks-error")).toBeNull();
    expect(
      container.querySelectorAll(".stocks-grid .stock-ticker").length
    ).toBe(4);
  });

  it("does not render the error box when error is false", () => {
    const state = {
      Stocks: { tickers: [], lastUpdated: null, error: false },
      Prefs: { values: { "widgets.stocks.size": "medium" } },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".stocks-error")).toBeNull();
  });

  it("clears the error box and shows ticker cards once data arrives", () => {
    const { container, rerender } = render(
      <WrapWithProvider
        state={{
          Stocks: { tickers: [], lastUpdated: null, error: true },
          Prefs: { values: { "widgets.stocks.size": "medium" } },
        }}
      >
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".stocks-error")).toBeTruthy();

    rerender(
      <WrapWithProvider
        state={{
          Stocks: { tickers: SAMPLE, lastUpdated: 1, error: true },
          Prefs: { values: { "widgets.stocks.size": "medium" } },
        }}
      >
        <Stocks
          dispatch={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );

    expect(container.querySelector(".stocks-error")).toBeNull();
    expect(
      container.querySelectorAll(".stocks-grid .stock-ticker").length
    ).toBe(4);
  });
});

describe("Stocks error telemetry across a size change", () => {
  let observerCallbacks;

  beforeEach(() => {
    observerCallbacks = [];
    jest.spyOn(global, "IntersectionObserver").mockImplementation(cb => {
      observerCallbacks.push(cb);
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Trigger every observer that has been created so far. The error and
  // impression observers both fire; only WIDGETS_ERROR is counted below.
  function fireAllIntersections() {
    act(() => {
      observerCallbacks.forEach(cb =>
        cb([{ isIntersecting: true, target: {} }])
      );
    });
  }

  it("reports WIDGETS_ERROR once even if the size changes while the error box is shown", () => {
    const dispatch = jest.fn();
    const store = createStore(combineReducers(reducers), {
      ...mockState,
      Stocks: { tickers: [], lastUpdated: null, error: true },
      Prefs: {
        ...mockState.Prefs,
        values: { ...mockState.Prefs.values, "widgets.stocks.size": "medium" },
      },
    });
    render(
      <Provider store={store}>
        <Stocks
          dispatch={dispatch}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </Provider>
    );

    // Error box visible at medium: WIDGETS_ERROR fires once.
    fireAllIntersections();

    // Change size to large while still in the error state. The error box must
    // stay the same element so it doesn't report the failure a second time.
    act(() => {
      store.dispatch({
        type: at.PREF_CHANGED,
        data: { name: "widgets.stocks.size", value: "large" },
      });
    });
    fireAllIntersections();

    const errorCalls = dispatch.mock.calls.filter(
      ([action]) => action.type === at.WIDGETS_ERROR
    );
    expect(errorCalls).toHaveLength(1);
  });

  it("records the error with the current size after a resize", () => {
    const dispatch = jest.fn();
    const store = createStore(combineReducers(reducers), {
      ...mockState,
      Stocks: { tickers: [], lastUpdated: null, error: true },
      Prefs: {
        ...mockState.Prefs,
        values: { ...mockState.Prefs.values, "widgets.stocks.size": "medium" },
      },
    });
    render(
      <Provider store={store}>
        <Stocks
          dispatch={dispatch}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </Provider>
    );

    // Change to large before the error box is ever seen, so the first
    // intersection reports the error at the new size.
    act(() => {
      store.dispatch({
        type: at.PREF_CHANGED,
        data: { name: "widgets.stocks.size", value: "large" },
      });
    });
    fireAllIntersections();

    const errorCalls = dispatch.mock.calls.filter(
      ([action]) => action.type === at.WIDGETS_ERROR
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0].data).toMatchObject({
      widget_name: "stocks",
      error_type: "load_error",
      widget_size: "large",
    });
    expect(errorCalls[0][0].meta).toEqual(
      expect.objectContaining({ to: "ActivityStream:Main" })
    );
  });
});

describe("Stocks impression telemetry", () => {
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

  it("fires WIDGETS_IMPRESSION once when the widget is seen", () => {
    const dispatch = jest.fn();
    renderStocks(dispatch);
    const [observer] = observerInstances;
    const [target] = observer.observed;

    observer.callback([{ isIntersecting: true, target }], observer);
    observer.callback([{ isIntersecting: true, target }], observer);

    const impressions = dispatch.mock.calls.filter(
      ([action]) => action?.type === at.WIDGETS_IMPRESSION
    );
    expect(impressions).toHaveLength(1);
    expect(impressions[0][0].data).toMatchObject({
      widget_name: "stocks",
      widget_size: "medium",
    });
    expect(impressions[0][0].meta).toEqual(
      expect.objectContaining({ to: "ActivityStream:Main" })
    );
  });
});

describe("Stocks new badge", () => {
  const SAMPLE_TICKER = [
    {
      ticker: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      last_price: "$559.44 USD",
      todays_change_perc: "+0.2",
    },
  ];

  function renderStocksBadge({
    tickers = SAMPLE_TICKER,
    hasInteracted = false,
  } = {}) {
    const state = {
      ...mockState,
      Prefs: {
        ...mockState.Prefs,
        values: {
          ...mockState.Prefs.values,
          "widgets.stocks.interaction": hasInteracted,
        },
      },
      Stocks: { tickers, lastUpdated: 1, error: false },
    };
    return render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          handleUserInteraction={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
  }

  it("shows the New badge when tickers are present and the user has not interacted", () => {
    const { container } = renderStocksBadge();
    const badge = container.querySelector(".stocks-new-badge");
    expect(badge).toBeTruthy();
    expect(badge.getAttribute("data-l10n-id")).toBe(
      "newtab-widget-lists-label-new"
    );
  });

  it("hides the New badge once the interaction pref is set", () => {
    const { container } = renderStocksBadge({ hasInteracted: true });
    expect(container.querySelector(".stocks-new-badge")).toBeNull();
  });

  it("hides the New badge while there are no tickers (loading)", () => {
    const { container } = renderStocksBadge({ tickers: [] });
    expect(container.querySelector(".stocks-new-badge")).toBeNull();
  });

  it("hides the New badge in the error state", () => {
    const state = {
      Stocks: { tickers: [], lastUpdated: null, error: true },
      Prefs: { values: { "widgets.stocks.size": "medium" } },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          handleUserInteraction={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
    expect(container.querySelector(".stocks-new-badge")).toBeNull();
  });

  it("shows the New badge with stale tickers even when error is set", () => {
    const state = {
      ...mockState,
      Stocks: { tickers: SAMPLE_TICKER, lastUpdated: 1, error: true },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <Stocks
          dispatch={jest.fn()}
          handleUserInteraction={jest.fn()}
          widgetsMayBeMaximized={true}
          widgetEnabledMap={{}}
        />
      </WrapWithProvider>
    );
    // The badge follows ticker presence, not the error flag.
    expect(container.querySelector(".stocks-new-badge")).toBeTruthy();
  });
});
