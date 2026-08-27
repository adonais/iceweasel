/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  SectionsLayoutFeed: "resource://newtab/lib/SectionsLayoutFeed.sys.mjs",
  maskLayoutAds: "resource://newtab/lib/SectionsLayoutFeed.sys.mjs",
});

const PREF_SECTIONS_ORDERING = "discoverystream.sections.ordering";
const PREF_TOPSTORIES_ENABLED = "feeds.section.topstories";

const LAYOUTS_COLLECTION = "newtab-section-layouts";

const VALID_LAYOUT = {
  name: "7-double-row-2-ad",
  responsiveLayouts: [
    { columnCount: 1, tiles: [] },
    { columnCount: 2, tiles: [] },
    { columnCount: 3, tiles: [] },
    { columnCount: 4, tiles: [] },
  ],
};

const VALID_ORDERING = {
  name: "default",
  sectionLayouts: ["7-double-row-2-ad", "6-small-medium-1-ad"],
};

function getFeedForTest({
  orderingKey = "default",
  topStoriesEnabled = true,
  trainhopConfig,
} = {}) {
  let feed = new SectionsLayoutFeed();

  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({
      Prefs: {
        values: {
          [PREF_SECTIONS_ORDERING]: orderingKey,
          [PREF_TOPSTORIES_ENABLED]: topStoriesEnabled,
          ...(trainhopConfig ? { trainhopConfig } : {}),
        },
      },
    }),
  };

  return feed;
}

// Stub feed.RemoteSettings so each collection returns its own records, and
// return the sync subscription spies for assertions.
function stubClients(sandbox, feed, { layoutRecords, orderingRecords } = {}) {
  const on = sinon.spy();
  const off = sinon.spy();
  sandbox.stub(feed, "RemoteSettings").callsFake(collection => ({
    get: async () =>
      collection === LAYOUTS_COLLECTION ? layoutRecords : orderingRecords,
    on,
    off,
  }));
  return { on, off };
}

function getLayoutUpdate(feed) {
  return feed.store.dispatch
    .getCalls()
    .find(call => call.args[0].type === actionTypes.SECTIONS_LAYOUT_UPDATE);
}

add_task(async function test_construction() {
  let feed = new SectionsLayoutFeed();

  info("SectionsLayoutFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a SectionsLayoutFeed");
  Assert.strictEqual(
    feed._layoutsClient,
    null,
    "_layoutsClient is initialized as null"
  );
  Assert.strictEqual(
    feed._orderingClient,
    null,
    "_orderingClient is initialized as null"
  );
});

add_task(async function test_onAction_INIT() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();
  stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING],
  });

  info(
    "SectionsLayoutFeed.onAction INIT should fetch both collections and dispatch SECTIONS_LAYOUT_UPDATE"
  );

  await feed.onAction({ type: actionTypes.INIT });

  const matchingCall = getLayoutUpdate(feed);
  Assert.ok(matchingCall, "Expected a SECTIONS_LAYOUT_UPDATE dispatch call");
  Assert.deepEqual(
    matchingCall.args[0],
    actionCreators.BroadcastToContent({
      type: actionTypes.SECTIONS_LAYOUT_UPDATE,
      data: {
        configs: { "7-double-row-2-ad": VALID_LAYOUT },
        orderings: { default: VALID_ORDERING.sectionLayouts },
      },
      meta: { isStartup: true },
    })
  );

  sandbox.restore();
});

add_task(async function test_onAction_INIT_invalid_layout() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();

  const invalidLayout = {
    name: "incomplete-layout",
    responsiveLayouts: [{ columnCount: 1, tiles: [] }],
  };
  stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT, invalidLayout],
    orderingRecords: [],
  });

  info(
    "SectionsLayoutFeed should only include layouts with all 4 column counts"
  );

  await feed.onAction({ type: actionTypes.INIT });

  const { configs } = getLayoutUpdate(feed).args[0].data;
  Assert.ok("7-double-row-2-ad" in configs, "Valid layout should be included");
  Assert.ok(
    !("incomplete-layout" in configs),
    "Invalid layout should be excluded"
  );

  sandbox.restore();
});

add_task(async function test_onAction_INIT_invalid_ordering() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();

  const emptyOrdering = { name: "empty-ordering", sectionLayouts: [] };
  const namelessOrdering = { sectionLayouts: ["7-double-row-2-ad"] };
  stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING, emptyOrdering, namelessOrdering],
  });

  info(
    "SectionsLayoutFeed should exclude orderings without a name or with an empty layout list"
  );

  await feed.onAction({ type: actionTypes.INIT });

  const { orderings } = getLayoutUpdate(feed).args[0].data;
  Assert.deepEqual(
    Object.keys(orderings),
    ["default"],
    "Only the valid ordering should be included"
  );

  sandbox.restore();
});

add_task(async function test_onAction_INIT_no_ordering_key() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest({ orderingKey: "" });
  const { on } = stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING],
  });

  info("SectionsLayoutFeed should not sync when no ordering key is selected");

  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(!feed.RemoteSettings.called, "RemoteSettings should not be called");
  Assert.ok(!on.called, "No sync subscription should be created");
  Assert.ok(!feed.store.dispatch.called, "dispatch should not be called");

  sandbox.restore();
});

add_task(async function test_onAction_INIT_topstories_disabled() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest({ topStoriesEnabled: false });
  stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING],
  });

  info("SectionsLayoutFeed should not sync when topstories is disabled");

  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(!feed.RemoteSettings.called, "RemoteSettings should not be called");
  Assert.ok(!feed.store.dispatch.called, "dispatch should not be called");

  sandbox.restore();
});

add_task(async function test_onAction_INIT_no_records() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();
  stubClients(sandbox, feed, { layoutRecords: [], orderingRecords: [] });

  info(
    "SectionsLayoutFeed should not dispatch when both collections are empty"
  );

  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(!feed.store.dispatch.called, "dispatch should not be called");

  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();

  sandbox.stub(feed, "init");

  info(
    "SectionsLayoutFeed.onAction PREF_CHANGED should call init for the ordering and topstories prefs"
  );

  for (const name of [PREF_SECTIONS_ORDERING, PREF_TOPSTORIES_ENABLED]) {
    await feed.onAction({ type: actionTypes.PREF_CHANGED, data: { name } });
  }

  Assert.equal(feed.init.callCount, 2, "init should be called for each pref");
  Assert.ok(
    feed.init.alwaysCalledWith(false),
    "init should always be called with isStartup=false"
  );

  sandbox.restore();
});

add_task(async function test_onAction_PREF_CHANGED_trainhopConfig() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();

  sandbox.stub(feed, "init");

  info(
    "A trainhopConfig change should call init only when it carries sections.ordering"
  );

  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: {
      name: "trainhopConfig",
      value: { sections: { ordering: "default" } },
    },
  });
  Assert.ok(
    feed.init.calledOnce,
    "init called when sections.ordering is present"
  );

  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "trainhopConfig", value: { somethingElse: true } },
  });
  Assert.ok(
    feed.init.calledOnce,
    "init not called again when sections.ordering is absent"
  );

  sandbox.restore();
});

add_task(async function test_uninit() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();
  const { off } = stubClients(sandbox, feed, {
    layoutRecords: [],
    orderingRecords: [],
  });

  info("SectionsLayoutFeed.uninit should unsubscribe and drop both clients");

  await feed.init(true);
  feed.uninit();

  Assert.ok(off.calledWith("sync"), "off should be called for the sync event");
  Assert.strictEqual(feed._layoutsClient, null, "_layoutsClient is cleared");
  Assert.strictEqual(feed._orderingClient, null, "_orderingClient is cleared");

  sandbox.restore();
});

add_task(async function test_init_disconnects_when_disabled() {
  let sandbox = sinon.createSandbox();
  let feed = new SectionsLayoutFeed();
  const values = {
    [PREF_SECTIONS_ORDERING]: "default",
    [PREF_TOPSTORIES_ENABLED]: true,
  };
  feed.store = {
    dispatch: sinon.spy(),
    getState: () => ({ Prefs: { values } }),
  };
  const { off } = stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING],
  });

  info("init should disconnect RS listeners when the ordering is turned off");

  await feed.init(true);
  values[PREF_SECTIONS_ORDERING] = "";
  await feed.init(false);

  Assert.ok(off.calledWith("sync"), "listeners removed when disabled");
  Assert.strictEqual(feed._layoutsClient, null, "clients are cleared");

  sandbox.restore();
});

add_task(async function test_onSync_refetches() {
  let sandbox = sinon.createSandbox();
  let feed = getFeedForTest();
  const { on } = stubClients(sandbox, feed, {
    layoutRecords: [VALID_LAYOUT],
    orderingRecords: [VALID_ORDERING],
  });

  info("A Remote Settings sync should refetch and dispatch a fresh update");

  await feed.init(true);
  feed.store.dispatch.resetHistory();

  const [, syncHandler] = on
    .getCalls()
    .find(call => call.args[0] === "sync").args;
  await syncHandler();

  const call = getLayoutUpdate(feed);
  Assert.ok(call, "sync should dispatch a fresh SECTIONS_LAYOUT_UPDATE");
  Assert.equal(
    call.args[0].meta.isStartup,
    false,
    "a sync-triggered dispatch is not a startup"
  );

  sandbox.restore();
});

const ALLOWED_RANKS = new Set([0, 1, 2]);

function makeAdLayout() {
  return {
    name: "layout",
    responsiveLayouts: [
      {
        columnCount: 1,
        tiles: [
          { position: 0, hasAd: true },
          { position: 1, hasAd: false },
        ],
      },
    ],
  };
}

add_task(async function test_maskLayoutAds_keeps_ads_for_allowed_rank() {
  info("maskLayoutAds should return the same layout when the rank allows ads");

  const layout = makeAdLayout();
  Assert.strictEqual(
    maskLayoutAds(layout, { receivedRank: 0, allowAds: true }, ALLOWED_RANKS),
    layout,
    "The layout is returned unchanged"
  );
});

add_task(async function test_maskLayoutAds_masks_disallowed_rank() {
  info("maskLayoutAds should return a masked copy when the rank disallows ads");

  const layout = makeAdLayout();
  const result = maskLayoutAds(
    layout,
    { receivedRank: 3, allowAds: true },
    ALLOWED_RANKS
  );

  Assert.notStrictEqual(result, layout, "A copy is returned");
  Assert.equal(
    result.responsiveLayouts[0].tiles[0].hasAd,
    false,
    "hasAd is cleared on the copy"
  );
  Assert.equal(
    layout.responsiveLayouts[0].tiles[0].hasAd,
    true,
    "The original layout is left untouched"
  );
});

add_task(async function test_maskLayoutAds_masks_when_allowAds_false() {
  info(
    "maskLayoutAds should mask ads when allowAds is false on an allowed rank"
  );

  const result = maskLayoutAds(
    makeAdLayout(),
    { receivedRank: 0, allowAds: false },
    ALLOWED_RANKS
  );

  Assert.equal(
    result.responsiveLayouts[0].tiles[0].hasAd,
    false,
    "hasAd is cleared"
  );
});
