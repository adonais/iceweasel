/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const SUPPORT_FILES_PATH =
  "browser/browser/components/enterprisepolicies/tests/browser";

const API_STATUS_ID = "api-status";
const INTERCEPT_STATUS_ID = "intercept-status";

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

async function waitForFrames(browser, count) {
  await TestUtils.waitForCondition(() => {
    let children = browser.browsingContext.children;
    if (children.length != count) {
      return false;
    }
    return children.every(child => child.currentURI.spec != "about:blank");
  }, `Waiting for ${count} frame(s) to load`);
}

async function waitForStatus(bc, swExpected, description) {
  let apiExpected = swExpected ? "sw-available" : "sw-not-supported";
  let interceptExpected = swExpected ? "sw-intercepted" : "sw-not-intercepted";
  await TestUtils.waitForCondition(
    () =>
      SpecialPowers.spawn(bc, [], () => {
        let apiEl = content.document.getElementById("api-status");
        let interceptEl = content.document.getElementById("intercept-status");
        return (
          apiEl &&
          apiEl.textContent != "pending" &&
          interceptEl &&
          interceptEl.textContent != "pending"
        );
      }),
    `Waiting for elements to be updated in test page`
  );

  let [apiStatus, interceptStatus] = await SpecialPowers.spawn(bc, [], () => {
    return [
      content.document.getElementById("api-status").textContent,
      content.document.getElementById("intercept-status").textContent,
    ];
  });

  Assert.equal(apiStatus, apiExpected, `${description} (api-status)`);
  Assert.equal(
    interceptStatus,
    interceptExpected,
    `${description} (intercept-status)`
  );
}

async function goBack(browser) {
  let pageShown = BrowserTestUtils.waitForContentEvent(browser, "pageshow");
  browser.browsingContext.goBack();
  await pageShown;
}

add_task(async function test_serviceworker_api_hidden_on_blocked_site() {
  // Pre-register SWs for both origins before applying policy.
  await setupPolicyEngineWithJson({ policies: {} });

  await BrowserTestUtils.withNewTab(
    `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "SW registered for example.org"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false for example.org with no policy"
      );
    }
  );

  await BrowserTestUtils.withNewTab(
    `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "SW registered for example.com"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false for example.com with no policy"
      );
    }
  );

  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { DisableServiceWorkers: true },
        },
      ],
    },
  });

  // Tab starting at a blocked site: verify status across two forward
  // navigations, then verify both prior entries are in the BFCache and that
  // back-navigations restore the correct state.
  await BrowserTestUtils.withNewTab(
    `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        false,
        "navigator.serviceWorker should be hidden on blocked top-level site"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true for blocked site"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForStatus(
        browser.browsingContext,
        true,
        "navigator.serviceWorker should work on non-blocked top-level site"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false for non-blocked site"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForStatus(
        browser.browsingContext,
        false,
        "navigator.serviceWorker should be hidden on blocked top-level site after navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true for blocked site after navigation"
      );

      let sh = browser.browsingContext.sessionHistory;
      Assert.ok(
        sh.getEntryAtIndex(sh.index - 1).isInBFCache,
        "example.org entry is in BFCache"
      );
      Assert.ok(
        sh.getEntryAtIndex(sh.index - 2).isInBFCache,
        "first example.com entry is in BFCache"
      );

      await goBack(browser);
      await waitForStatus(
        browser.browsingContext,
        true,
        "navigator.serviceWorker should work on non-blocked site after back navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false after back navigation to non-blocked site"
      );

      await goBack(browser);
      await waitForStatus(
        browser.browsingContext,
        false,
        "navigator.serviceWorker should be hidden on blocked site after second back navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true after second back navigation to blocked site"
      );
    }
  );

  // Tab starting at a non-blocked site: same checks in the other direction.
  await BrowserTestUtils.withNewTab(
    `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "navigator.serviceWorker should work on non-blocked top-level site"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false for non-blocked site"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForStatus(
        browser.browsingContext,
        false,
        "navigator.serviceWorker should be hidden on blocked top-level site"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true for blocked site"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForStatus(
        browser.browsingContext,
        true,
        "navigator.serviceWorker should work on non-blocked top-level site after navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false for non-blocked site after navigation"
      );

      let sh = browser.browsingContext.sessionHistory;
      Assert.ok(
        sh.getEntryAtIndex(sh.index - 1).isInBFCache,
        "example.com entry is in BFCache"
      );
      Assert.ok(
        sh.getEntryAtIndex(sh.index - 2).isInBFCache,
        "first example.org entry is in BFCache"
      );

      await goBack(browser);
      await waitForStatus(
        browser.browsingContext,
        false,
        "navigator.serviceWorker should be hidden on blocked site after back navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true after back navigation to blocked site"
      );

      await goBack(browser);
      await waitForStatus(
        browser.browsingContext,
        true,
        "navigator.serviceWorker should work on non-blocked site after second back navigation"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false after second back navigation to non-blocked site"
      );
    }
  );

  await unregisterAllServiceWorkers();
});

// When a blocked site is the top-level, SW should be hidden in all frames
// regardless of frame origin. When a non-blocked site is the top-level, SW
// should work in all frames even if the frame's own origin is blocked.
add_task(async function test_serviceworker_subframe_semantics() {
  // Pre-register SWs for both origins before applying policy.
  await setupPolicyEngineWithJson({ policies: {} });

  await BrowserTestUtils.withNewTab(
    `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "SW registered for example.org"
      );
    }
  );

  await BrowserTestUtils.withNewTab(
    `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "SW registered for example.com"
      );
    }
  );

  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { DisableServiceWorkers: true },
        },
      ],
    },
  });

  await BrowserTestUtils.withNewTab(
    `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_framed.html`,
    async browser => {
      await waitForFrames(browser, 2);

      await waitForStatus(
        browser.browsingContext.children[0],
        true,
        "SW should work in example.com frame when top-level is not blocked"
      );
      await waitForStatus(
        browser.browsingContext.children[1],
        true,
        "SW should work in example.org frame when top-level is not blocked"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false when top-level is not blocked"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_framed.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForFrames(browser, 2);

      await waitForStatus(
        browser.browsingContext.children[0],
        false,
        "SW should be hidden in example.com frame when top-level is blocked"
      );
      await waitForStatus(
        browser.browsingContext.children[1],
        false,
        "SW should be hidden in example.org frame when top-level is blocked"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        true,
        "BrowsingContext flag is true when top-level is blocked"
      );

      BrowserTestUtils.startLoadingURIString(
        browser,
        `https://example.org/${SUPPORT_FILES_PATH}/sitepolicies_sw_framed.html`
      );
      await BrowserTestUtils.browserLoaded(browser);
      await waitForFrames(browser, 2);

      await waitForStatus(
        browser.browsingContext.children[0],
        true,
        "SW should work in example.com frame after navigating back to unblocked top-level"
      );
      await waitForStatus(
        browser.browsingContext.children[1],
        true,
        "SW should work in example.org frame after navigating back to unblocked top-level"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false after navigating back to non-blocked top-level"
      );
    }
  );

  await unregisterAllServiceWorkers();
});

add_task(async function test_serviceworker_registration_survives_policy() {
  // Register a service worker on example.com with no policy active.
  await setupPolicyEngineWithJson({ policies: {} });

  await BrowserTestUtils.withNewTab(
    `https://example.com/${SUPPORT_FILES_PATH}/sitepolicies_sw_fetch.html`,
    async browser => {
      await waitForStatus(
        browser.browsingContext,
        true,
        "SW registered for example.com"
      );
      Assert.equal(
        browser.browsingContext.serviceWorkersDisabledByPolicy,
        false,
        "BrowsingContext flag is false before policy is applied"
      );
    }
  );

  let swm = Cc["@mozilla.org/serviceworkers/manager;1"].getService(
    Ci.nsIServiceWorkerManager
  );
  Assert.greater(
    swm.getAllRegistrations().length,
    0,
    "Service worker should be registered"
  );

  // Apply a policy that disables service workers for example.com.
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { DisableServiceWorkers: true },
        },
      ],
    },
  });

  // The registration should still exist — the policy blocks the API and
  // interception based on the top-level site, not the registration itself.
  let regsAfterPolicy = swm.getAllRegistrations();
  let exampleComRegs = [];
  for (let i = 0; i < regsAfterPolicy.length; i++) {
    let reg = regsAfterPolicy.queryElementAt(
      i,
      Ci.nsIServiceWorkerRegistrationInfo
    );
    if (reg.principal.host.endsWith("example.com")) {
      exampleComRegs.push(reg);
    }
  }
  Assert.greater(
    exampleComRegs.length,
    0,
    "Service worker registration for example.com should survive policy application"
  );

  await unregisterAllServiceWorkers();
});
