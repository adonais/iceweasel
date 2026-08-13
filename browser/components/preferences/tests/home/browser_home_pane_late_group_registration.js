/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for bug 2051119: about:preferences#home renders all its Home
// groups even when the newtab feed registers them after the pane loads.
//
// The newtab AboutPreferences feed registers the Home pane's "homepage"/"home"
// groups only when it observes the pane-loaded notifications. After a
// session-restore restart, the #home tab can load before that observer is
// registered. The notifications are missed, so the groups never register and
// SettingPane.init() throws `Setting group "homepage" not found`. #home then
// stays partly rendered until the next restart.
//
// The test removes the feed observer before opening #home, then puts it back
// and notifies again to stand in for the feed registering after init.

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Setting group "homepage" not found/
);

ChromeUtils.defineESModuleGetters(this, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
});

const HOME_GROUP_IDS = [
  "defaultBrowserHome",
  "startupHome",
  "homepage",
  "home",
];
const HOME_PANE_OBSERVER_TOPICS = [
  "home-pane-loaded",
  "customHomepage-pane-loaded",
];

add_task(async function home_pane_recovers_when_newtab_observer_is_late() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });

  await AboutNewTab.activityStream.initialized;
  const feed = AboutNewTab.activityStream.store.feeds.get(
    "feeds.aboutpreferences"
  );
  ok(feed, "The aboutpreferences newtab feed is present");

  // Drop the feed observer to reproduce the missed startup notification.
  let observerRemoved = false;
  const removeHomeObservers = () => {
    if (observerRemoved) {
      return;
    }
    for (const topic of HOME_PANE_OBSERVER_TOPICS) {
      Services.obs.removeObserver(feed, topic);
    }
    observerRemoved = true;
  };
  const addHomeObservers = () => {
    if (!observerRemoved) {
      return;
    }
    for (const topic of HOME_PANE_OBSERVER_TOPICS) {
      Services.obs.addObserver(feed, topic);
    }
    observerRemoved = false;
  };

  removeHomeObservers();
  // The feed is shared across the run, so restore its observers even if opening
  // the tab fails.
  registerCleanupFunction(addHomeObservers);
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#home"
  );
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(tab);
  });

  const win = tab.linkedBrowser.contentWindow;
  const doc = tab.linkedBrowser.contentDocument;

  await TestUtils.waitForCondition(
    () =>
      doc.querySelector('setting-pane[data-category="paneHome"]')?.initialized,
    "Wait for the Home setting-pane to initialize"
  );
  const pane = doc.querySelector('setting-pane[data-category="paneHome"]');

  // Put the observers back and notify again so the real feed registers the
  // home groups.
  addHomeObservers();
  Services.obs.notifyObservers(win, "home-pane-loaded");

  for (const groupId of HOME_GROUP_IDS) {
    const group = pane.querySelector(`setting-group[groupid="${groupId}"]`);
    ok(group, `Home group "${groupId}" element exists`);
    await TestUtils.waitForCondition(
      () => group.config && group.querySelector("moz-fieldset"),
      `Home group "${groupId}" should render after the newtab feed registers late`
    );
    ok(group.config, `Home group "${groupId}" has its config registered`);
    ok(
      group.querySelector("moz-fieldset"),
      `Home group "${groupId}" rendered its content`
    );
  }
});
