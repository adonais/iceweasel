/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const SUPPORT_FILES_PATH =
  "http://mochi.test:8888/browser/browser/components/enterprisepolicies/tests/browser/";
const BLOCKED_PAGE = "policy_websitefilter_block.html";
const EXCEPTION_PAGE = "policy_websitefilter_exception.html";
const SAVELINKAS_PAGE = "policy_websitefilter_savelink.html";

function unregisterAllServiceWorkers() {
  let swm = Cc["@mozilla.org/serviceworkers/manager;1"].getService(
    Ci.nsIServiceWorkerManager
  );
  let regs = swm.getAllRegistrations();
  let promises = [];
  for (let i = 0; i < regs.length; i++) {
    let reg = regs.queryElementAt(i, Ci.nsIServiceWorkerRegistrationInfo);
    let { promise, resolve, reject } = Promise.withResolvers();
    swm.unregister(
      reg.principal,
      { unregisterSucceeded: resolve, unregisterFailed: reject },
      reg.scope
    );
    promises.push(promise);
  }
  return Promise.all(promises);
}

async function clearWebsiteFilter() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: [],
        Exceptions: [],
      },
    },
  });
}

add_task(async function test_http() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://mochi.test/*policy_websitefilter_*"],
        Exceptions: ["*://mochi.test/*_websitefilter_exception*"],
      },
    },
  });

  await checkBlockedPage(SUPPORT_FILES_PATH + BLOCKED_PAGE, true);
  await checkBlockedPage(
    "view-source:" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(
    "about:reader?url=" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(
    "about:READER?url=" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(
    "about:reader?e=1&url=" +
      encodeURIComponent(SUPPORT_FILES_PATH + BLOCKED_PAGE),
    true
  );
  await checkBlockedPage(
    "about:reader?URL=" +
      encodeURIComponent(SUPPORT_FILES_PATH + EXCEPTION_PAGE) +
      "&url=" +
      encodeURIComponent(SUPPORT_FILES_PATH + BLOCKED_PAGE),
    true
  );
  await checkBlockedPage(SUPPORT_FILES_PATH + EXCEPTION_PAGE, false);

  await checkBlockedPage(SUPPORT_FILES_PATH + "301.sjs", true);

  await checkBlockedPage(SUPPORT_FILES_PATH + "302.sjs", true);

  await checkBlockedPage("view-source:" + SUPPORT_FILES_PATH + "301.sjs", true);

  await checkBlockedPage("view-source:" + SUPPORT_FILES_PATH + "302.sjs", true);

  // A redirect to an allowed destination must still complete.
  let tab = BrowserTestUtils.addTab(
    gBrowser,
    SUPPORT_FILES_PATH + "302exception.sjs"
  );
  await BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    SUPPORT_FILES_PATH + EXCEPTION_PAGE
  );
  ok(true, "Redirect to an allowed page was not blocked");
  BrowserTestUtils.removeTab(tab);

  await clearWebsiteFilter();
});

add_task(async function test_http_mixed_case() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://mochi.test/*policy_websitefilter_*"],
        Exceptions: ["*://mochi.test/*_websitefilter_exception*"],
      },
    },
  });

  await checkBlockedPage(SUPPORT_FILES_PATH + BLOCKED_PAGE.toUpperCase(), true);
  await checkBlockedPage(
    SUPPORT_FILES_PATH + EXCEPTION_PAGE.toUpperCase(),
    false
  );
  await clearWebsiteFilter();
});

add_task(async function test_object() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://mochi.test/*policy_websitefilter_*"],
        Exceptions: ["*://mochi.test/*_websitefilter_exception*"],
      },
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "http://mochi.test:8888/"
  );

  let cases = [
    [BLOCKED_PAGE, true],
    ["302.sjs", true],
    [EXCEPTION_PAGE, false],
  ];
  for (let [page, blocked] of cases) {
    let displayedType = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [SUPPORT_FILES_PATH + page],
      async url => {
        let el = content.document.createElement("object");
        el.data = url;
        content.document.body.appendChild(el);
        await ContentTaskUtils.waitForCondition(
          () => el.displayedType != Ci.nsIObjectLoadingContent.TYPE_LOADING,
          "Wait for the element to finish loading"
        );
        let type = el.displayedType;
        el.remove();
        return type;
      }
    );
    is(
      displayedType,
      blocked
        ? Ci.nsIObjectLoadingContent.TYPE_FALLBACK
        : Ci.nsIObjectLoadingContent.TYPE_DOCUMENT,
      `<object> loading ${page} should ${blocked ? "" : "not "}be blocked`
    );
  }

  BrowserTestUtils.removeTab(tab);
  await clearWebsiteFilter();
});

add_task(async function test_file() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["file:///*"],
      },
    },
  });

  await checkBlockedPage("file:///this_should_be_blocked", true);
  await clearWebsiteFilter();
});

add_task(async function test_savelink() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://mochi.test/*policy_websitefilter_block*"],
      },
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    SUPPORT_FILES_PATH + SAVELINKAS_PAGE
  );

  let contextMenu = document.getElementById("contentAreaContextMenu");
  let promiseContextMenuOpen = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouse(
    "#savelink_blocked",
    0,
    0,
    {
      type: "contextmenu",
      button: 2,
      centered: true,
    },
    gBrowser.selectedBrowser
  );
  await promiseContextMenuOpen;

  let saveLink = document.getElementById("context-savelink");
  is(saveLink.disabled, true, "Save Link As should be disabled");

  let promiseContextMenuHidden = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  contextMenu.hidePopup();
  await promiseContextMenuHidden;

  promiseContextMenuOpen = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouse(
    "#savelink_notblocked",
    0,
    0,
    {
      type: "contextmenu",
      button: 2,
      centered: true,
    },
    gBrowser.selectedBrowser
  );
  await promiseContextMenuOpen;

  saveLink = document.getElementById("context-savelink");
  is(saveLink.disabled, false, "Save Link As should not be disabled");

  promiseContextMenuHidden = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  contextMenu.hidePopup();
  await promiseContextMenuHidden;

  BrowserTestUtils.removeTab(tab);
  await clearWebsiteFilter();
});

add_task(async function test_http_json_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: `{
        "Block": ["*://mochi.test/*policy_websitefilter_*"],
        "Exceptions": ["*://mochi.test/*_websitefilter_exception*"]
      }`,
    },
  });

  await checkBlockedPage(SUPPORT_FILES_PATH + BLOCKED_PAGE, true);
  await checkBlockedPage(
    "view-source:" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(
    "about:reader?url=" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(
    "about:READER?url=" + SUPPORT_FILES_PATH + BLOCKED_PAGE,
    true
  );
  await checkBlockedPage(SUPPORT_FILES_PATH + EXCEPTION_PAGE, false);

  await checkBlockedPage(SUPPORT_FILES_PATH + "301.sjs", true);

  await checkBlockedPage(SUPPORT_FILES_PATH + "302.sjs", true);
  await clearWebsiteFilter();
});

async function redirectHits() {
  let response = await fetch(SUPPORT_FILES_PATH + "cached301.sjs?hits");
  return parseInt(await response.text(), 10);
}

add_task(async function test_cached_redirect() {
  Services.cache2.clear();
  let hits = await redirectHits();

  // Prime the HTTP cache with the redirect while no filter is in effect.
  let tab = BrowserTestUtils.addTab(
    gBrowser,
    SUPPORT_FILES_PATH + "cached301.sjs"
  );
  await BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    SUPPORT_FILES_PATH + BLOCKED_PAGE
  );
  BrowserTestUtils.removeTab(tab);
  is(await redirectHits(), hits + 1, "Redirect was served from the network");

  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://mochi.test/*policy_websitefilter_*"],
      },
    },
  });

  await checkBlockedPage(SUPPORT_FILES_PATH + "cached301.sjs", true);
  is(await redirectHits(), hits + 1, "Redirect was served from the cache");

  await clearWebsiteFilter();
  Services.cache2.clear();
});

add_task(async function test_service_worker_redirect() {
  // Service workers need a secure context, so this one case runs over https.
  const HTTPS_PATH =
    "https://example.com/browser/browser/components/enterprisepolicies/tests/browser/";

  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://example.com/*policy_websitefilter_block*"],
      },
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    HTTPS_PATH + "websitefilter_sw.html"
  );
  let status = await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("status").textContent != "pending",
      "service worker registered"
    );
    return content.document.getElementById("status").textContent;
  });
  is(status, "ready", "Service worker is controlling the page");
  BrowserTestUtils.removeTab(tab);

  // The worker answers this navigation with a synthesized redirect.
  await checkBlockedPage(HTTPS_PATH + "sw-redirect", true);

  await unregisterAllServiceWorkers();
  await clearWebsiteFilter();
});
