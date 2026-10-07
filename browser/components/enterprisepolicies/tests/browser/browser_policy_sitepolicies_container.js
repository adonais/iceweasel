/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { EphemeralContainerWatcher } = ChromeUtils.importESModule(
  "resource:///modules/policies/EphemeralContainerWatcher.sys.mjs"
);

add_task(async function test_container_switch_on_navigation() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "work" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "banking" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let work = policyContainers.find(c => c.policyId == "work");
  let banking = policyContainers.find(c => c.policyId == "banking");
  ok(work, "Work container was created");
  ok(banking, "Banking container was created");

  let sourceTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    sourceTab.linkedBrowser,
    "https://example.com/"
  );
  let containerTab = await newTabPromise;

  is(
    containerTab.getAttribute("usercontextid"),
    String(work.userContextId),
    "Tab should be in the work container"
  );

  // Navigate from the work container tab to a site in a different container.
  let secondTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    containerTab.linkedBrowser,
    "https://example.org/"
  );
  let bankingTab = await secondTabPromise;

  is(
    bankingTab.getAttribute("usercontextid"),
    String(banking.userContextId),
    "Tab should switch to the banking container"
  );

  for (let tab of [sourceTab, containerTab, bankingTab]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_no_switch_for_unmatched_site() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.net/"
  );
  ok(
    !tab.hasAttribute("usercontextid") ||
      tab.getAttribute("usercontextid") == "0",
    "Non-matching site should not be in a container"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_no_switch_for_excepted_site() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com", "*.example.org"],
          Exceptions: ["*.example.org"],
          Policies: { Container: { id: "restricted" } },
        },
      ],
    },
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.org/"
  );
  ok(
    !tab.hasAttribute("usercontextid") ||
      tab.getAttribute("usercontextid") == "0",
    "Excepted site should not be in a container"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_policy_containers_not_in_public_identities() {
  let containers = ContextualIdentityService.getPublicIdentities();
  ok(
    !containers.some(c => c.policy),
    "Policy containers should not appear in public identities (used by menus)"
  );
});

add_task(async function test_containers_cleaned_up_when_no_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "temp-work" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "temp-banking" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  is(policyContainers.length, 2, "Two policy containers were created");

  await setupPolicyEngineWithJson("");

  policyContainers = ContextualIdentityService.getPolicyIdentities();
  is(
    policyContainers.length,
    0,
    "Policy containers are removed when policy service is inactive"
  );
});

add_task(async function test_containers_cleaned_up_when_policy_absent() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "temp-work" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "temp-banking" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  is(policyContainers.length, 2, "Two policy containers were created");

  await setupPolicyEngineWithJson({
    policies: {
      DisableTelemetry: true,
    },
  });

  policyContainers = ContextualIdentityService.getPolicyIdentities();
  is(
    policyContainers.length,
    0,
    "Policy containers are removed when SitePolicies policy is absent"
  );
});

add_task(async function test_no_colored_tab_indicator() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "invisible" } },
        },
      ],
    },
  });

  let sourceTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    sourceTab.linkedBrowser,
    "https://example.com/"
  );
  let containerTab = await newTabPromise;

  ok(
    containerTab.hasAttribute("usercontextid"),
    "Tab has a usercontextid attribute"
  );

  let contextLine = containerTab.querySelector(".tab-context-line");
  let style = getComputedStyle(contextLine);
  is(
    style.backgroundColor,
    "rgba(0, 0, 0, 0)",
    "Tab context line should be transparent for policy containers"
  );

  let identity = ContextualIdentityService.getPublicIdentityFromId(
    containerTab.getAttribute("usercontextid")
  );
  ok(
    !identity,
    "getPublicIdentityFromId returns nothing for policy containers"
  );

  for (let tab of [sourceTab, containerTab]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(
  async function test_ephemeral_container_clears_data_on_last_tab_close() {
    await setupPolicyEngineWithJson({
      policies: {
        SitePolicies: [
          {
            Match: ["*.example.com"],
            Policies: { Container: { id: "ephemeral", ephemeral: true } },
          },
        ],
      },
    });

    let policyContainers = ContextualIdentityService.getPolicyIdentities();
    let ephemeral = policyContainers.find(c => c.policyId == "ephemeral");
    ok(ephemeral, "Ephemeral container was created");

    ok(
      EphemeralContainerWatcher._initialized,
      "Watcher was initialized by policy engine"
    );
    ok(
      EphemeralContainerWatcher._ephemeralIds.has(ephemeral.userContextId),
      "Watcher tracks the ephemeral container's userContextId"
    );

    let sourceTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:blank"
    );

    let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
    BrowserTestUtils.startLoadingURIString(
      sourceTab.linkedBrowser,
      "https://example.com/"
    );
    let containerTab = await newTabPromise;

    is(
      containerTab.getAttribute("usercontextid"),
      String(ephemeral.userContextId),
      "Tab is in the ephemeral container"
    );

    // Set a cookie in the ephemeral container.
    await SpecialPowers.spawn(containerTab.linkedBrowser, [], () => {
      content.document.cookie = "ephtest=value; SameSite=Lax";
    });

    let cookies = Services.cookies.getCookiesFromHost("example.com", {
      userContextId: ephemeral.userContextId,
    });
    Assert.greater(
      cookies.length,
      0,
      "Cookie was set in the ephemeral container"
    );

    BrowserTestUtils.removeTab(containerTab);

    // Wait for the tab to be fully removed from the DOM before flushing.
    await TestUtils.waitForCondition(
      () =>
        ContextualIdentityService.countContainerTabs(ephemeral.userContextId) ==
        0,
      "Container tab count should reach 0"
    );
    await EphemeralContainerWatcher.flushPendingChecks();

    cookies = Services.cookies.getCookiesFromHost("example.com", {
      userContextId: ephemeral.userContextId,
    });
    is(cookies.length, 0, "Cookie was cleared after last ephemeral tab closed");

    // Verify the container identity still exists.
    let stillExists = ContextualIdentityService.getPolicyIdentities().find(
      c => c.policyId == "ephemeral"
    );
    ok(
      stillExists,
      "Ephemeral container identity persists after data clearing"
    );

    BrowserTestUtils.removeTab(sourceTab);
  }
);

add_task(
  async function test_non_ephemeral_container_does_not_clear_on_tab_close() {
    await setupPolicyEngineWithJson({
      policies: {
        SitePolicies: [
          {
            Match: ["*.example.com"],
            Policies: { Container: { id: "persistent" } },
          },
        ],
      },
    });

    let policyContainers = ContextualIdentityService.getPolicyIdentities();
    let persistent = policyContainers.find(c => c.policyId == "persistent");
    ok(persistent, "Persistent container was created");

    let sourceTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "about:blank"
    );

    let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
    BrowserTestUtils.startLoadingURIString(
      sourceTab.linkedBrowser,
      "https://example.com/"
    );
    let containerTab = await newTabPromise;

    await SpecialPowers.spawn(containerTab.linkedBrowser, [], () => {
      content.document.cookie = "perstest=value; SameSite=Lax";
    });

    BrowserTestUtils.removeTab(containerTab);

    // Wait a bit to make sure no clearing happens.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 2000));

    let cookies = Services.cookies.getCookiesFromHost("example.com", {
      userContextId: persistent.userContextId,
    });
    Assert.greater(
      cookies.length,
      0,
      "Cookie persists after closing non-ephemeral container tab"
    );

    BrowserTestUtils.removeTab(sourceTab);
  }
);

add_task(async function test_reinit_changes_ephemeral_state() {
  // Start with container A as ephemeral and container B as persistent.
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "alpha", ephemeral: true } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "bravo" } },
        },
      ],
    },
  });

  let policyContainers = ContextualIdentityService.getPolicyIdentities();
  let alpha = policyContainers.find(c => c.policyId == "alpha");
  let bravo = policyContainers.find(c => c.policyId == "bravo");
  ok(alpha, "Alpha container exists");
  ok(bravo, "Bravo container exists");
  ok(
    EphemeralContainerWatcher._ephemeralIds.has(alpha.userContextId),
    "Alpha is tracked as ephemeral"
  );
  ok(
    !EphemeralContainerWatcher._ephemeralIds.has(bravo.userContextId),
    "Bravo is not tracked as ephemeral"
  );

  // Reinitialise: flip alpha to persistent, bravo to ephemeral, add charlie
  // as ephemeral.
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "alpha" } },
        },
        {
          Match: ["*.example.org"],
          Policies: { Container: { id: "bravo", ephemeral: true } },
        },
        {
          Match: ["*.example.net"],
          Policies: { Container: { id: "charlie", ephemeral: true } },
        },
      ],
    },
  });

  policyContainers = ContextualIdentityService.getPolicyIdentities();
  alpha = policyContainers.find(c => c.policyId == "alpha");
  bravo = policyContainers.find(c => c.policyId == "bravo");
  let charlie = policyContainers.find(c => c.policyId == "charlie");
  ok(alpha, "Alpha container still exists");
  ok(bravo, "Bravo container still exists");
  ok(charlie, "Charlie container was created");

  ok(
    !EphemeralContainerWatcher._ephemeralIds.has(alpha.userContextId),
    "Alpha is no longer tracked as ephemeral"
  );
  ok(
    EphemeralContainerWatcher._ephemeralIds.has(bravo.userContextId),
    "Bravo is now tracked as ephemeral"
  );
  ok(
    EphemeralContainerWatcher._ephemeralIds.has(charlie.userContextId),
    "Charlie is tracked as ephemeral"
  );

  // Verify alpha (now persistent) retains data after tab close.
  let alphaSource = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    alphaSource.linkedBrowser,
    "https://example.com/"
  );
  let alphaTab = await newTabPromise;

  await SpecialPowers.spawn(alphaTab.linkedBrowser, [], () => {
    content.document.cookie = "alphatest=value; SameSite=Lax";
  });

  BrowserTestUtils.removeTab(alphaTab);
  await TestUtils.waitForCondition(
    () =>
      ContextualIdentityService.countContainerTabs(alpha.userContextId) == 0,
    "Alpha container tab count should reach 0"
  );
  await EphemeralContainerWatcher.flushPendingChecks();

  let alphaCookies = Services.cookies.getCookiesFromHost("example.com", {
    userContextId: alpha.userContextId,
  });
  Assert.greater(
    alphaCookies.length,
    0,
    "Alpha (now persistent) retains cookies after tab close"
  );

  for (let tab of [alphaSource]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }

  // Verify bravo (now ephemeral) clears data after tab close.
  let bravoSource = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    bravoSource.linkedBrowser,
    "https://example.org/"
  );
  let bravoTab = await newTabPromise;

  await SpecialPowers.spawn(bravoTab.linkedBrowser, [], () => {
    content.document.cookie = "bravotest=value; SameSite=Lax";
  });

  BrowserTestUtils.removeTab(bravoTab);
  await TestUtils.waitForCondition(
    () =>
      ContextualIdentityService.countContainerTabs(bravo.userContextId) == 0,
    "Bravo container tab count should reach 0"
  );
  await EphemeralContainerWatcher.flushPendingChecks();

  let bravoCookies = Services.cookies.getCookiesFromHost("example.org", {
    userContextId: bravo.userContextId,
  });
  is(
    bravoCookies.length,
    0,
    "Bravo (now ephemeral) clears cookies after tab close"
  );

  for (let tab of [bravoSource]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }

  // Verify charlie (new ephemeral) clears data after tab close.
  let charlieSource = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    charlieSource.linkedBrowser,
    "https://example.net/"
  );
  let charlieTab = await newTabPromise;

  await SpecialPowers.spawn(charlieTab.linkedBrowser, [], () => {
    content.document.cookie = "charlietest=value; SameSite=Lax";
  });

  BrowserTestUtils.removeTab(charlieTab);
  await TestUtils.waitForCondition(
    () =>
      ContextualIdentityService.countContainerTabs(charlie.userContextId) == 0,
    "Charlie container tab count should reach 0"
  );
  await EphemeralContainerWatcher.flushPendingChecks();

  let charlieCookies = Services.cookies.getCookiesFromHost("example.net", {
    userContextId: charlie.userContextId,
  });
  is(
    charlieCookies.length,
    0,
    "Charlie (new ephemeral) clears cookies after tab close"
  );

  for (let tab of [charlieSource]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_crash_recovery_clears_stale_ephemeral_data() {
  EphemeralContainerWatcher.destroy();

  let staleUserContextId = 99999;

  // Plant a cookie as if the stale container had been used before the crash.
  let cv = Services.cookies.add(
    ".example.com",
    "/",
    "staletest",
    "value",
    false,
    false,
    false,
    Date.now() + 24 * 60 * 60,
    { userContextId: staleUserContextId },
    Ci.nsICookie.SAMESITE_UNSET,
    Ci.nsICookie.SCHEME_HTTPS
  );
  Assert.equal(cv.result, Ci.nsICookieValidation.eOK, "Cookie was accepted");

  let cookies = Services.cookies.getCookiesFromHost("example.com", {
    userContextId: staleUserContextId,
  });
  Assert.greater(cookies.length, 0, "Stale container has a cookie before init");

  // Simulate a previous session's persisted pref that included the stale ID.
  Services.prefs.setStringPref(
    "browser.policies.ephemeralContainerIds",
    JSON.stringify([staleUserContextId])
  );

  // Initialise with an empty set so the stale ID is not in the current policy.
  EphemeralContainerWatcher.init(new Set());

  // _clearData is async (fires clearData.deleteDataFromOriginAttributesPattern
  // with a callback), so give it a tick to complete.
  await TestUtils.waitForCondition(() => {
    return !Services.cookies.getCookiesFromHost("example.com", {
      userContextId: staleUserContextId,
    }).length;
  }, "Stale ephemeral container cookie should be cleared on init");

  EphemeralContainerWatcher.destroy();
});

add_task(async function test_clearAll_clears_data_and_persisted_ids() {
  EphemeralContainerWatcher.destroy();

  let userContextIdA = 99990;
  let userContextIdB = 99991;

  for (let ucid of [userContextIdA, userContextIdB]) {
    let cv = Services.cookies.add(
      ".example.com",
      "/",
      `clearalltest_${ucid}`,
      "value",
      false,
      false,
      false,
      Date.now() + 24000 * 60 * 60,
      { userContextId: ucid },
      Ci.nsICookie.SAMESITE_UNSET,
      Ci.nsICookie.SCHEME_HTTPS
    );
    Assert.equal(cv.result, Ci.nsICookieValidation.eOK, "Cookie was accepted");
  }

  let ephemeralIds = new Set([userContextIdA, userContextIdB]);
  EphemeralContainerWatcher.init(ephemeralIds);

  ok(
    Services.prefs.prefHasUserValue("browser.policies.ephemeralContainerIds"),
    "Ephemeral IDs pref is set after init"
  );

  await EphemeralContainerWatcher.clearAll();

  for (let ucid of [userContextIdA, userContextIdB]) {
    let cookies = Services.cookies.getCookiesFromHost("example.com", {
      userContextId: ucid,
    });
    is(cookies.length, 0, `Cookies cleared for container ${ucid}`);
  }

  is(
    Services.prefs.getStringPref(
      "browser.policies.ephemeralContainerIds",
      "[]"
    ),
    "[]",
    "Ephemeral IDs pref is empty after clearAll"
  );
});

add_task(async function test_no_container_indicator_in_urlbar() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { Container: { id: "hidden" } },
        },
      ],
    },
  });

  let sourceTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  BrowserTestUtils.startLoadingURIString(
    sourceTab.linkedBrowser,
    "https://example.com/"
  );
  let containerTab = await newTabPromise;
  gBrowser.selectedTab = containerTab;

  // Wait for the UI to update after tab selection.
  await new Promise(resolve => requestAnimationFrame(resolve));

  let indicator = document.getElementById("userContext-indicator");
  let label = document.getElementById("userContext-label");
  ok(
    !indicator ||
      indicator.hidden ||
      !indicator.hasAttribute("data-identity-color"),
    "URL bar container indicator should be hidden for policy containers"
  );
  ok(
    !label || label.hidden || label.value === "",
    "URL bar container label should be hidden for policy containers"
  );

  for (let tab of [sourceTab, containerTab]) {
    if (gBrowser.tabs.includes(tab) && !tab.closing) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});
