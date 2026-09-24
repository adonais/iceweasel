/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const HOST = "example.org";

function addCookie(name, expiryInMSec) {
  Services.cookies.add(
    HOST,
    "/",
    name,
    "value",
    false,
    false,
    false,
    expiryInMSec,
    {},
    Ci.nsICookie.SAMESITE_UNSET,
    Ci.nsICookie.SCHEME_HTTPS
  );
}

function cookieNames() {
  return Services.cookies.cookies.map(cookie => cookie.name).sort();
}

function waitForBatchDeleted() {
  return new Promise(resolve => {
    Services.obs.addObserver(function observer(subject) {
      const notification = subject.QueryInterface(Ci.nsICookieNotification);
      if (
        notification.action != Ci.nsICookieNotification.COOKIES_BATCH_DELETED
      ) {
        return;
      }
      Services.obs.removeObserver(observer, "cookie-changed");
      resolve(notification.batchDeletedCookies);
    }, "cookie-changed");
  });
}

add_task(async function test_purge_expired_on_idle_daily() {
  do_get_profile();

  Services.prefs.setBoolPref(
    "network.cookieJarSettings.unblocked_for_testing",
    true
  );

  const nowInMSec = Date.now();
  const expiryInMSec = nowInMSec + 2000;
  addCookie("live", nowInMSec + 24 * 60 * 60 * 1000);
  addCookie("expiring", expiryInMSec);

  Assert.deepEqual(cookieNames(), ["expiring", "live"], "Both cookies stored");

  await TestUtils.waitForCondition(
    () => Date.now() > expiryInMSec,
    "the cookie reached its expiry time"
  );

  // The size-based purge in AddCookie() only runs once we are well over the
  // cookie limit, so until idle-daily the expired cookie is still in the jar.
  Assert.deepEqual(
    cookieNames(),
    ["expiring", "live"],
    "The expired cookie has not been purged yet"
  );

  const batchDeleted = waitForBatchDeleted();
  Services.obs.notifyObservers(null, "idle-daily");
  const deleted = await batchDeleted;

  Assert.equal(deleted.length, 1, "One cookie was purged");
  Assert.equal(
    deleted.queryElementAt(0, Ci.nsICookie).name,
    "expiring",
    "The expired cookie was purged"
  );
  Assert.deepEqual(cookieNames(), ["live"], "The live cookie survived");

  Services.cookies.removeAll();
});

add_task(async function test_idle_daily_does_not_evict_live_cookies() {
  do_get_profile();

  Services.prefs.setBoolPref(
    "network.cookieJarSettings.unblocked_for_testing",
    true
  );

  const nowInMSec = Date.now();
  addCookie("live1", nowInMSec + 24 * 60 * 60 * 1000);
  addCookie("live2", nowInMSec + 24 * 60 * 60 * 1000);

  Assert.deepEqual(cookieNames(), ["live1", "live2"], "Both cookies stored");

  // Only now put every live cookie over both the size and the age limit, so
  // that a full purge would evict them. Setting these before the add() calls
  // would let AddCookie() evict them on insertion instead.
  Services.prefs.setIntPref("network.cookie.maxNumber", 1);
  Services.prefs.setIntPref("network.cookie.purgeAge", 0);

  Services.obs.notifyObservers(null, "idle-daily");

  Assert.deepEqual(
    cookieNames(),
    ["live1", "live2"],
    "idle-daily did not evict any live cookie"
  );

  Services.prefs.clearUserPref("network.cookie.maxNumber");
  Services.prefs.clearUserPref("network.cookie.purgeAge");
  Services.cookies.removeAll();
});
