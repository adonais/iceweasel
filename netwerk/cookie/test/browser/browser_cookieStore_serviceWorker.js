/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.serviceWorkers.enabled", true],
      ["dom.serviceWorkers.testing.enabled", true],
    ],
  });

  Services.cookies.removeAll();
});

function registerSW(browser) {
  return SpecialPowers.spawn(browser, [], async _ => {
    let reg =
      await content.navigator.serviceWorker.register("serviceWorker.js");

    await ContentTaskUtils.waitForCondition(() => {
      return reg.active && reg.active.state === "activated";
    }, "The service worker is activated");

    ok(
      content.navigator.serviceWorker.controller,
      "The service worker controls the document successfully."
    );
  });
}

function unregisterSW(browser) {
  return SpecialPowers.spawn(browser, [], async _ => {
    const regs = await content.navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
    }
  });
}

function cookieStoreFromSW(browser) {
  return SpecialPowers.spawn(browser, [], async _ => {
    return new content.Promise(resolve => {
      content.navigator.serviceWorker.addEventListener("message", event => {
        resolve(event.data.content);
      });

      content.navigator.serviceWorker.controller.postMessage({
        action: "cookieStore",
      });
    });
  });
}

function comCookies() {
  let out = new Map();
  for (let cookie of Services.cookies.getCookiesWithOriginAttributes(
    JSON.stringify({}),
    "example.com"
  )) {
    out.set(cookie.name, cookie.value);
  }
  return out;
}

/**
 * cookieStore must work in a service worker running in a content process of
 * its own, which has never loaded a channel for this cookie key.
 */
add_task(async function testCookieStoreFromServiceWorker() {
  // Added from the parent, so no content process learns about this cookie.
  Services.cookies.add(
    "example.com",
    "/",
    "existing",
    "fromParent",
    true /* secure */,
    false /* httpOnly */,
    false /* session */,
    Date.now() + 24 * 60 * 60 * 1000,
    {},
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_TOP_PAGE
  );

  await registerSW(tab.linkedBrowser);
  let report = await cookieStoreFromSW(tab.linkedBrowser);

  let procInfo = await ChromeUtils.requestProcInfo();
  info(
    "Content processes: " +
      procInfo.children.map(c => `${c.pid}:${c.origin || c.type}`).join(" ")
  );

  is(report.error, undefined, "cookieStore threw nothing in the worker");
  is(
    report.get,
    "fromParent",
    "The worker read the cookie added by the parent"
  );
  ok(
    report.getAll.includes("existing"),
    `getAll() returned the cookie (${report.getAll})`
  );

  is(report.afterSet, "written", "The worker read back what it wrote");
  is(
    comCookies().get("fromSW"),
    "written",
    "The cookie written by the worker reached the cookie jar"
  );

  is(report.afterDelete, null, "The worker no longer reads the deleted cookie");
  ok(
    !comCookies().has("existing"),
    "The cookie deleted by the worker left the cookie jar"
  );

  await unregisterSW(tab.linkedBrowser);
  BrowserTestUtils.removeTab(tab);
  Services.cookies.removeAll();
});
