/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  StocksFeed: "resource://newtab/lib/Widgets/StocksFeed.sys.mjs",
});

function stubFeed(sandbox, { fetchResult = [], cache = {} } = {}) {
  sandbox.stub(StocksFeed.prototype, "PersistentCache").returns({
    get: async () => cache,
    set: async () => {},
  });
  const fetchStub = sandbox.stub().resolves(fetchResult);
  sandbox
    .stub(StocksFeed.prototype, "MerinoClient")
    .returns({ name: "TEST", fetch: fetchStub });
  // Don't fire either timer: the refresh timer would recursively call fetch(),
  // and the retry is now a background fetch that the retry tests trigger
  // explicitly.
  sandbox.stub(StocksFeed.prototype, "setTimeout").returns(1);
  sandbox.stub(StocksFeed.prototype, "clearTimeout");
  sandbox.stub(StocksFeed.prototype, "Date").returns({ now: () => 1000 });
  return fetchStub;
}

add_task(async function test_construction() {
  let sandbox = sinon.createSandbox();
  stubFeed(sandbox);
  let feed = new StocksFeed();
  Assert.strictEqual(feed.loaded, false, "not loaded");
  Assert.strictEqual(feed.merino, null, "merino null");
  Assert.strictEqual(feed.tickers.length, 0, "tickers empty");
  Assert.strictEqual(feed.fetchTimer, null, "fetchTimer null");
  sandbox.restore();
});

add_task(async function test_fetch_parses_and_dispatches() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox, {
    fetchResult: [
      {
        custom_details: {
          polygon: {
            values: [
              {
                ticker: "SPY",
                name: "SPDR S&P 500 ETF Trust",
                // Matches what Merino returns: last_price ends with " USD" and no "%".
                last_price: "$559.44 USD",
                todays_change_perc: "+0.20",
              },
            ],
          },
        },
      },
    ],
  });

  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };

  await feed.fetch();

  const [args] = fetchStub.firstCall.args;
  Assert.deepEqual(args.providers, ["polygon"], "polygon provider");
  Assert.equal(args.otherParams.source, "newtab", "source newtab");
  Assert.equal(args.query, "", "empty query -> default ETFs");

  const [dispatched] = feed.store.dispatch.getCall(0).args;
  Assert.equal(
    dispatched.type,
    actionTypes.WIDGETS_STOCKS_UPDATE,
    "dispatches WIDGETS_STOCKS_UPDATE"
  );
  Assert.equal(dispatched.data.tickers.length, 1, "one ticker stored");
  Assert.equal(dispatched.data.tickers[0].ticker, "SPY", "ticker parsed");
  sandbox.restore();
});

add_task(async function test_fetch_supports_individual_query() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox, { fetchResult: [] });
  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  await feed.fetch("$AAPL");
  Assert.equal(
    fetchStub.firstCall.args[0].query,
    "$AAPL",
    "passes a non-empty query through the same path"
  );
  sandbox.restore();
});

add_task(async function test_stopFetching_clears_timer_without_merino() {
  let sandbox = sinon.createSandbox();
  stubFeed(sandbox);
  let feed = new StocksFeed();
  feed.fetchTimer = 123;
  feed.merino = null;

  feed.stopFetching();

  Assert.ok(
    StocksFeed.prototype.clearTimeout.calledWith(123),
    "clearTimeout called even when merino is null"
  );
  Assert.strictEqual(feed.fetchTimer, null, "fetchTimer reset to null");
  Assert.strictEqual(feed.lastUpdated, null, "stopFetching resets lastUpdated");
  sandbox.restore();
});

add_task(async function test_isEnabled_gating() {
  let sandbox = sinon.createSandbox();
  stubFeed(sandbox);
  let feed = new StocksFeed();
  feed.store = {
    getState: () => ({
      Prefs: {
        values: {
          "widgets.stocks.enabled": true,
          "widgets.system.stocks.enabled": true,
        },
      },
    }),
  };
  Assert.ok(feed.isEnabled(), "enabled when user + system prefs true");

  feed.store.getState = () => ({
    Prefs: { values: { "widgets.stocks.enabled": false } },
  });
  Assert.ok(!feed.isEnabled(), "disabled when user pref false");
  sandbox.restore();
});

add_task(async function test_onPrefChangedAction_enable_disable_reenable() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox, {
    fetchResult: [
      {
        custom_details: {
          polygon: {
            values: [
              {
                ticker: "SPY",
                name: "SPDR S&P 500 ETF Trust",
                last_price: "$559.44 USD",
                todays_change_perc: "+0.20",
              },
            ],
          },
        },
      },
    ],
  });

  let enabled = true;
  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({
      Prefs: {
        values: {
          "widgets.stocks.enabled": enabled,
          "widgets.system.stocks.enabled": true,
        },
      },
    }),
  };

  await feed.onPrefChangedAction({ data: { name: "widgets.stocks.enabled" } });
  Assert.ok(feed.loaded, "loaded after enabling");
  Assert.equal(fetchStub.callCount, 1, "fetched once after enabling");
  Assert.equal(
    feed.store.dispatch.callCount,
    1,
    "dispatched once after enabling"
  );

  enabled = false;
  await feed.onPrefChangedAction({ data: { name: "widgets.stocks.enabled" } });
  Assert.strictEqual(feed.loaded, false, "disabling resets loaded");
  Assert.strictEqual(feed.tickers.length, 0, "disabling clears tickers");

  enabled = true;
  await feed.onPrefChangedAction({ data: { name: "widgets.stocks.enabled" } });
  Assert.ok(feed.loaded, "loaded again after re-enabling");
  Assert.equal(fetchStub.callCount, 2, "fetches again after re-enabling");
  sandbox.restore();
});

add_task(async function test_system_tick_while_disabled_does_not_fetch() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox);
  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({
      Prefs: { values: { "widgets.stocks.enabled": false } },
    }),
  };

  await feed.onAction({ type: actionTypes.SYSTEM_TICK });

  Assert.ok(!fetchStub.called, "no Merino fetch while disabled");
  Assert.strictEqual(feed.loaded, false, "not marked loaded");
  sandbox.restore();
});

add_task(
  async function test_loadStocks_cache_hit_hydrates_without_merino_client() {
    let sandbox = sinon.createSandbox();
    const STOCKS_UPDATE_TIME = 15 * 60 * 1000;
    const now = 1_000_000;
    const age = 60 * 1000; // 1 minute old, well inside the 15 minute TTL.
    const cachedTickers = [
      {
        ticker: "SPY",
        name: "SPDR S&P 500 ETF Trust",
        last_price: "$559.44 USD",
        todays_change_perc: "+0.20",
      },
    ];
    sandbox.stub(StocksFeed.prototype, "PersistentCache").returns({
      get: async () => ({
        stocks: { tickers: cachedTickers, lastUpdated: now - age },
      }),
      set: async () => {},
    });
    const fetchStub = sandbox.stub();
    const merinoClientStub = sandbox
      .stub(StocksFeed.prototype, "MerinoClient")
      .returns({ name: "TEST", fetch: fetchStub });
    const setTimeoutStub = sandbox
      .stub(StocksFeed.prototype, "setTimeout")
      .returns(1);
    sandbox.stub(StocksFeed.prototype, "clearTimeout");
    sandbox.stub(StocksFeed.prototype, "Date").returns({ now: () => now });

    let feed = new StocksFeed();
    feed.store = {
      dispatch: sinon.spy(),
      getState: () => ({ Prefs: { values: {} } }),
    };

    await feed.loadStocks();

    Assert.ok(!fetchStub.called, "cache hit does not call Merino.fetch");
    Assert.ok(
      !merinoClientStub.called,
      "cache hit does not construct a Merino client"
    );
    Assert.equal(
      feed.store.dispatch.callCount,
      1,
      "dispatches the cached tickers"
    );
    const [dispatched] = feed.store.dispatch.getCall(0).args;
    Assert.equal(dispatched.data.tickers.length, 1, "hydrated from cache");
    Assert.ok(setTimeoutStub.called, "arms the refresh timer");
    Assert.equal(
      setTimeoutStub.firstCall.args[1],
      STOCKS_UPDATE_TIME - age,
      "arms the timer for the remaining TTL, not a full interval"
    );
    Assert.ok(feed.loaded, "marked loaded");
    sandbox.restore();
  }
);

add_task(async function test_fetch_handles_missing_custom_details() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox, { fetchResult: [{}] });
  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };

  await feed.fetch();

  Assert.equal(
    feed.tickers.length,
    0,
    "missing custom_details resolves to no tickers"
  );
  const [dispatched] = feed.store.dispatch.getCall(0).args;
  Assert.deepEqual(
    dispatched.data.tickers,
    [],
    "dispatches an empty ticker list"
  );
  Assert.equal(
    fetchStub.callCount,
    1,
    "missing custom_details is treated as empty; the retry is deferred to a timer"
  );
  Assert.equal(
    dispatched.data.error,
    true,
    "an empty response sets the error flag immediately"
  );
  sandbox.restore();
});

add_task(async function test_fetch_handles_non_array_values() {
  let sandbox = sinon.createSandbox();
  const fetchStub = stubFeed(sandbox, {
    fetchResult: [{ custom_details: { polygon: { values: "bad" } } }],
  });
  let feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };

  await feed.fetch();

  Assert.equal(
    feed.tickers.length,
    0,
    "non-array values resolves to no tickers"
  );
  const [dispatched] = feed.store.dispatch.getCall(0).args;
  Assert.deepEqual(
    dispatched.data.tickers,
    [],
    "dispatches an empty ticker list"
  );
  Assert.equal(
    fetchStub.callCount,
    1,
    "malformed values are treated as empty; the retry is deferred to a timer"
  );
  Assert.equal(
    dispatched.data.error,
    true,
    "malformed values set the error flag immediately"
  );
  sandbox.restore();
});

add_task(async function test_fetch_generation_guard_ignores_stale_response() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(StocksFeed.prototype, "PersistentCache").returns({
    get: async () => ({}),
    set: async () => {},
  });
  let resolveFetch;
  const fetchStub = sandbox.stub().returns(
    new Promise(resolve => {
      resolveFetch = resolve;
    })
  );
  sandbox
    .stub(StocksFeed.prototype, "MerinoClient")
    .returns({ name: "TEST", fetch: fetchStub });
  sandbox.stub(StocksFeed.prototype, "setTimeout").returns(1);
  const clearTimeoutStub = sandbox.stub(StocksFeed.prototype, "clearTimeout");
  sandbox.stub(StocksFeed.prototype, "Date").returns({ now: () => 1000 });

  let feed = new StocksFeed();
  // The Merino client is already set, so fetch() goes straight to the network
  // call without creating one first.
  feed.merino = { fetch: fetchStub };
  feed.fetchTimer = 42;
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };

  const fetchPromise = feed.fetch();
  // The widget is disabled while the Merino request is still running.
  feed.stopFetching();
  resolveFetch([
    {
      custom_details: {
        polygon: {
          values: [
            {
              ticker: "SPY",
              name: "SPDR S&P 500 ETF Trust",
              last_price: "$559.44 USD",
              todays_change_perc: "+0.20",
            },
          ],
        },
      },
    },
  ]);
  await fetchPromise;

  Assert.ok(
    clearTimeoutStub.calledWith(1),
    "stopFetching cleared the refresh timer armed during the in-flight fetch"
  );
  Assert.ok(
    !feed.store.dispatch.called,
    "a stale response after teardown does not dispatch"
  );
  Assert.strictEqual(
    feed.tickers.length,
    0,
    "a stale response after teardown does not repopulate tickers"
  );
  Assert.strictEqual(
    feed.lastUpdated,
    null,
    "a stale response after teardown does not re-arm lastUpdated"
  );
  sandbox.restore();
});

add_task(
  async function test_fetch_shows_error_immediately_and_schedules_retry() {
    const sandbox = sinon.createSandbox();
    const feed = new StocksFeed();
    feed.store = {
      dispatch: sinon.spy(),
      getState: () => ({ Prefs: { values: {} } }),
    };
    feed.merino = { fetch: sandbox.stub().rejects(new Error("network")) };
    sandbox.stub(feed, "restartFetchTimer");
    // Capture the scheduled retry instead of firing it.
    let retryDelay;
    sandbox.stub(feed, "setTimeout").callsFake((fn, ms) => {
      retryDelay = ms;
      return 1;
    });

    await feed.fetch();

    const [update] = feed.store.dispatch.getCalls().at(-1).args;
    Assert.equal(
      update.data.error,
      true,
      "the error flag is set on the first failure, without waiting for a retry"
    );
    Assert.equal(
      feed.merino.fetch.callCount,
      1,
      "only the initial attempt runs; the retry is deferred to a timer"
    );
    Assert.equal(retryDelay, 60 * 1000, "a retry is scheduled 60s later");
    sandbox.restore();
  }
);

add_task(async function test_fetch_clears_error_on_success() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  feed.error = true;
  feed.merino = {
    fetch: sandbox.stub().resolves([
      {
        custom_details: {
          polygon: {
            values: [
              {
                ticker: "SPY",
                name: "n",
                last_price: "$1 USD",
                todays_change_perc: "+0.1",
              },
            ],
          },
        },
      },
    ]),
  };
  sandbox.stub(feed, "restartFetchTimer");
  sandbox.stub(feed.cache, "set").resolves();

  await feed.fetch();

  const [update] = feed.store.dispatch.getCalls().at(-1).args;
  Assert.equal(update.data.error, false, "error flag is cleared on success");
  sandbox.restore();
});

add_task(function test_stopFetching_clears_retry_timer_and_error() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  const clearStub = sandbox.stub(feed, "clearTimeout");
  feed.retryTimer = 7;
  feed.error = true;
  feed.stopFetching();
  Assert.ok(clearStub.calledWith(7), "retry timer is cleared");
  Assert.equal(feed.error, false, "error is reset");
  sandbox.restore();
});

add_task(async function test_fetch_retry_succeeds_recovers() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  const fetchStub = sandbox.stub();
  fetchStub.onCall(0).rejects(new Error("network"));
  fetchStub.onCall(1).resolves([
    {
      custom_details: {
        polygon: {
          values: [
            {
              ticker: "SPY",
              name: "SPDR S&P 500 ETF Trust",
              last_price: "$559.44 USD",
              todays_change_perc: "+0.20",
            },
          ],
        },
      },
    },
  ]);
  feed.merino = { fetch: fetchStub };
  sandbox.stub(feed, "restartFetchTimer");
  sandbox.stub(feed.cache, "set").resolves();
  // Capture the scheduled retry callback so the test runs the real timer path.
  let retryCb;
  sandbox.stub(feed, "setTimeout").callsFake(fn => {
    retryCb = fn;
    return 1;
  });

  // First attempt fails: the error surfaces immediately.
  await feed.fetch();
  Assert.equal(
    feed.store.dispatch.getCall(0).args[0].data.error,
    true,
    "the first failure sets the error flag"
  );

  // Run the scheduled retry; it succeeds and clears the error.
  await retryCb();

  Assert.equal(fetchStub.callCount, 2, "one failed call plus one retry");
  const [update] = feed.store.dispatch.getCalls().at(-1).args;
  Assert.equal(
    update.data.error,
    false,
    "error flag is cleared once the retry succeeds"
  );
  Assert.equal(
    feed.tickers.length,
    1,
    "tickers are populated from the retry's response"
  );
  Assert.equal(
    feed.tickers[0].ticker,
    "SPY",
    "ticker parsed from the retry's response"
  );
  sandbox.restore();
});

add_task(async function test_stopFetching_cancels_pending_retry() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  const fetchStub = sandbox.stub().rejects(new Error("network"));
  feed.merino = { fetch: fetchStub };
  sandbox.stub(feed, "restartFetchTimer");
  const clearStub = sandbox.stub(feed, "clearTimeout");
  // Capture the scheduled retry (return a handle) without firing it.
  sandbox.stub(feed, "setTimeout").returns(42);

  await feed.fetch();
  Assert.equal(
    feed.retryTimer,
    42,
    "a retry timer is scheduled after a failure"
  );

  feed.stopFetching();

  Assert.ok(clearStub.calledWith(42), "stopFetching clears the pending retry");
  Assert.equal(feed.error, false, "teardown resets the error flag");
  Assert.equal(fetchStub.callCount, 1, "the cancelled retry never runs");
  sandbox.restore();
});

add_task(async function test_scheduled_retry_bails_after_teardown() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  const fetchStub = sandbox.stub().rejects(new Error("network"));
  feed.merino = { fetch: fetchStub };
  sandbox.stub(feed, "MerinoClient").returns({ fetch: fetchStub });
  const restartStub = sandbox.stub(feed, "restartFetchTimer");
  sandbox.stub(feed, "clearTimeout");
  // Capture the scheduled retry callback so the test can run it after teardown.
  let retryCb;
  sandbox.stub(feed, "setTimeout").callsFake(fn => {
    retryCb = fn;
    return 1;
  });

  await feed.fetch();
  Assert.equal(
    restartStub.callCount,
    1,
    "the first attempt armed the refresh timer once"
  );

  // The widget is stopped, then the already-scheduled retry callback runs.
  feed.stopFetching();
  await retryCb();

  Assert.equal(
    restartStub.callCount,
    1,
    "a retry that fires after teardown does not restart fetching"
  );
  Assert.equal(fetchStub.callCount, 1, "the stale retry does not fetch again");
  sandbox.restore();
});

add_task(async function test_expire_cache_clears_snapshot_and_refetches() {
  const sandbox = sinon.createSandbox();
  // An empty Merino result drives the error path on the forced refetch.
  const fetchStub = stubFeed(sandbox, { fetchResult: [] });
  const feed = new StocksFeed();
  const setSpy = sandbox.spy(feed.cache, "set");
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({
      Prefs: {
        values: {
          "widgets.stocks.enabled": true,
          "widgets.system.stocks.enabled": true,
        },
      },
    }),
  };
  // Pretend an earlier successful fetch left tickers in memory.
  feed.tickers = [{ ticker: "SPY" }];
  feed.lastUpdated = 500;

  await feed.onAction({
    type: actionTypes.DISCOVERY_STREAM_DEV_EXPIRE_CACHE,
  });

  Assert.ok(setSpy.calledWith("stocks", {}), "clears the saved snapshot");
  Assert.equal(fetchStub.callCount, 1, "refetches after expiring the cache");
  const [update] = feed.store.dispatch.getCalls().at(-1).args;
  Assert.equal(update.data.error, true, "a failing refetch shows the error");
  Assert.deepEqual(update.data.tickers, [], "old tickers are cleared");
  sandbox.restore();
});

add_task(
  async function test_expire_cache_clears_snapshot_while_disabled_without_fetch() {
    const sandbox = sinon.createSandbox();
    const fetchStub = stubFeed(sandbox, { fetchResult: [] });
    const feed = new StocksFeed();
    const setSpy = sandbox.spy(feed.cache, "set");
    feed.store = {
      dispatch: sinon.spy(),
      getState: () => ({
        Prefs: { values: { "widgets.stocks.enabled": false } },
      }),
    };
    feed.tickers = [{ ticker: "SPY" }];

    await feed.onAction({
      type: actionTypes.DISCOVERY_STREAM_DEV_EXPIRE_CACHE,
    });

    Assert.ok(setSpy.calledWith("stocks", {}), "still clears the snapshot");
    Assert.equal(feed.tickers.length, 0, "still clears in-memory tickers");
    Assert.ok(!fetchStub.called, "does not fetch while disabled");
    sandbox.restore();
  }
);

add_task(async function test_success_cancels_pending_retry() {
  const sandbox = sinon.createSandbox();
  const feed = new StocksFeed();
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values: {} } }),
  };
  const fetchStub = sandbox.stub();
  fetchStub.onCall(0).rejects(new Error("network"));
  fetchStub.onCall(1).resolves([
    {
      custom_details: {
        polygon: {
          values: [
            {
              ticker: "SPY",
              name: "SPDR S&P 500 ETF Trust",
              last_price: "$559.44 USD",
              todays_change_perc: "+0.20",
            },
          ],
        },
      },
    },
  ]);
  feed.merino = { fetch: fetchStub };
  sandbox.stub(feed, "restartFetchTimer");
  sandbox.stub(feed.cache, "set").resolves();
  const clearStub = sandbox.stub(feed, "clearTimeout");
  sandbox.stub(feed, "setTimeout").returns(99);

  // A failure schedules a retry.
  await feed.fetch();
  Assert.equal(feed.retryTimer, 99, "a retry is pending after the failure");

  // An independent successful fetch cancels that pending retry.
  await feed.fetch();
  Assert.ok(
    clearStub.calledWith(99),
    "the later success cancels the pending retry"
  );
  Assert.equal(feed.retryTimer, null, "the retry timer is reset after success");
  sandbox.restore();
});
