/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PAGE =
  "https://example.com/browser/docshell/test/navigation/file_reload_subframe_history.html";

// Same as PAGE, except served with Cache-Control: no-cache, so the entry
// created for it is marked expired once it commits.
const PAGE_EXPIRED =
  "https://example.com/browser/docshell/test/navigation/file_reload_subframe_history_expired.html";

function frameURI(browser) {
  return SpecialPowers.spawn(
    browser,
    [],
    () => content.frames[0].location.href
  );
}

async function withNavigatedSubframe(task, page = PAGE) {
  await BrowserTestUtils.withNewTab(page, async browser => {
    const shistory = browser.browsingContext.sessionHistory;
    const srcURI = await frameURI(browser);

    is(shistory.count, 1, "one entry after the initial load");

    await SpecialPowers.spawn(browser, [], async () => {
      const frame = content.document.getElementById("testFrame");
      const loaded = new Promise(resolve =>
        frame.addEventListener("load", resolve, { once: true })
      );
      frame.contentWindow.location.href = "blank.html?navigated";
      await loaded;
    });

    const navigatedURI = await frameURI(browser);
    isnot(navigatedURI, srcURI, "subframe navigated away from its src");
    is(shistory.count, 2, "subframe navigation added an entry");
    is(shistory.index, 1, "index after the subframe navigation");

    await task({ browser, shistory, srcURI, navigatedURI, page });
  });
}

async function reloadFromUI(
  browser,
  flags = Ci.nsIWebNavigation.LOAD_FLAGS_NONE
) {
  gBrowser.reloadWithFlags(flags);
}

async function reloadFromContent(browser, forceReload = false) {
  await SpecialPowers.spawn(browser, [forceReload], force =>
    content.location.reload(force)
  );
}

// Reloading from browser UI goes through nsSHistory::Reload, which used to
// leave stale entries behind for force reload. See bug 2037346.

// Test force reload on a page with static subframe
async function checkForceReload(pref, reload, description) {
  await SpecialPowers.pushPrefEnv({
    set: [["docshell.shistory.restoreSubframesOnReload", pref]],
  });

  await withNavigatedSubframe(async ({ browser, shistory, srcURI }) => {
    const loaded = BrowserTestUtils.browserLoaded(browser, { wantLoad: PAGE });
    await reload(browser);
    await loaded;

    is(
      await frameURI(browser),
      srcURI,
      `${description}: subframe is loaded from its src again`
    );
    is(
      shistory.count,
      1,
      `${description}: the duplicate entry left behind by the reload is collapsed`
    );
    is(
      shistory.index,
      0,
      `${description}: index points at the sole remaining entry`
    );
    ok(!browser.canGoBack, `${description}: nothing to go back to`);
    ok(!browser.canGoForward, `${description}: nothing to go forward to`);
  });
}

const FORCE_RELOAD_FLAGS =
  Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE |
  Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY;

add_task(async function forceReloadFromUI() {
  await checkForceReload(
    false,
    browser => reloadFromUI(browser, FORCE_RELOAD_FLAGS),
    "force reload from UI"
  );
});

add_task(async function forceReloadFromUIWithPref() {
  await checkForceReload(
    true,
    browser => reloadFromUI(browser, FORCE_RELOAD_FLAGS),
    "force reload from UI with pref"
  );
});

add_task(async function forceReloadFromContent() {
  await checkForceReload(
    false,
    browser => reloadFromContent(browser, /* force */ true),
    "location.reload(true)"
  );
});

// location.reload() goes through CBC::NotifyOnHistoryReload, which used to
// leave stale entries behind if the cache expired. See bug 2037346.

// Test non-force reload on a page with a static subframe
async function checkNormalReload(
  pref,
  reload,
  description,
  expectRestored,
  expired = false
) {
  await SpecialPowers.pushPrefEnv({
    set: [["docshell.shistory.restoreSubframesOnReload", pref]],
  });

  await withNavigatedSubframe(
    async ({ browser, shistory, srcURI, navigatedURI }) => {
      const loaded = BrowserTestUtils.browserLoaded(browser, {
        wantLoad: expired ? PAGE_EXPIRED : PAGE,
      });
      await reload(browser);
      await loaded;

      is(
        await frameURI(browser),
        expectRestored ? navigatedURI : srcURI,
        `${description}: subframe ${
          expectRestored
            ? "was restored from history"
            : "is loaded from its src again"
        }`
      );
      is(
        shistory.count,
        2,
        `${description}: no entry is dropped by the reload`
      );
      is(shistory.index, 1, `${description}: index is unchanged by the reload`);
      ok(browser.canGoBack, `${description}: can still go back`);
      if (!expectRestored) {
        ok(!browser.canGoForward, `${description}: nothing to go forward to`);
      }
    },
    expired ? PAGE_EXPIRED : PAGE
  );
}

add_task(async function expiredReloadFromUI() {
  await checkNormalReload(
    false,
    browser => reloadFromUI(browser),
    "expired reload from UI",
    false,
    true
  );
});

add_task(async function expiredReloadFromContent() {
  await checkNormalReload(
    false,
    browser => reloadFromContent(browser),
    "expired location.reload()",
    false,
    true
  );
});

add_task(async function normalReloadFromUI() {
  await checkNormalReload(
    false,
    browser => reloadFromUI(browser, Ci.nsIWebNavigation.LOAD_FLAGS_NONE),
    "normal reload",
    false
  );
});

add_task(async function normalReloadFromUIWithPref() {
  await checkNormalReload(
    true,
    browser => reloadFromUI(browser, Ci.nsIWebNavigation.LOAD_FLAGS_NONE),
    "normal reload with pref",
    true
  );
});

add_task(async function normalReloadFromContent() {
  await checkNormalReload(
    false,
    browser => reloadFromContent(browser),
    "location.reload()",
    false
  );
});
