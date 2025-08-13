/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  ListsFeed: "resource://newtab/lib/Widgets/ListsFeed.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const PREF_LISTS_ENABLED = "widgets.lists.enabled";
const PREF_SYSTEM_LISTS_ENABLED = "widgets.system.lists.enabled";

add_task(async function test_construction() {
  let feed = new ListsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: {
      Prefs: {
        values: {
          [PREF_SYSTEM_LISTS_ENABLED]: false,
        },
      },
    },
  };

  info("ListsFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a ListsFeed");
  Assert.ok(!feed.loaded, "ListsFeed is not loaded");
  Assert.ok(!feed.enabled);
});

add_task(async function test_onAction_INIT() {
  let feed = new ListsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: {
      Prefs: {
        values: {
          [PREF_LISTS_ENABLED]: true,
          [PREF_SYSTEM_LISTS_ENABLED]: true,
        },
      },
    },
  };

  info("ListsFeed.onAction INIT should set initialized");

  await feed.onAction({
    type: actionTypes.INIT,
  });

  Assert.ok(feed.initialized);
});

add_task(async function test_isEnabled() {
  let feed = new ListsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: {
      Prefs: {
        values: {
          [PREF_LISTS_ENABLED]: true,
          [PREF_SYSTEM_LISTS_ENABLED]: true,
        },
      },
    },
  };

  info("ListsFeed should be enabled");
  Assert.ok(feed.enabled);
});
