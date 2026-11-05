/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const UNPROTECTED_SITE = "https://example.com";
const INCLUDED_SITE = "https://example.org";
const INCLUDED_SITE_2 = "https://example.net";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.features.siteInclusions", true]],
  });
});

function stubInclusionRules(sandbox, { state, mode }) {
  if (state) {
    sandbox.stub(IPPProxyManager, "state").value(state);
  }
  sandbox.stub(IPPProxyManager, "mode").value(mode);
  sandbox.stub(IPPSiteRuleManager, "getRule").callsFake(principal => {
    return principal?.origin === INCLUDED_SITE ||
      principal?.origin === INCLUDED_SITE_2
      ? IPPPrincipalRules.INCLUDED
      : IPPPrincipalRules.DEFAULT;
  });
}

function resetVPNSession(sandbox) {
  // sandbox.restore() unstubs IPPProxyManager.state back to NOT_READY,
  // Dispatch IPPProxyManager:StateChanged so that #visitedIncludedSites can be cleared.
  sandbox.restore();
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );
}

async function loadInTab(tab, url) {
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
}

/**
 * Tests that confirmation hints aren't shown for included sites if the site
 * inclusions feature is disabled.
 */
add_task(async function test_inclusion_hint_prefs_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.features.siteInclusions", false]],
  });

  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_INCLUSION,
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  await loadInTab(tab, INCLUDED_SITE);
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called when the feature is disabled"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that confirmation hints aren't shown for included sites when the VPN
 * is on for all sites.
 */
add_task(async function test_inclusion_hint_full_mode() {
  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_FULL,
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  await loadInTab(tab, INCLUDED_SITE);
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called when the VPN is on for all sites"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that confirmation hints aren't shown for included sites when the
 * proxy isn't connected.
 */
add_task(async function test_inclusion_hint_proxy_inactive() {
  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.READY,
    mode: null,
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  await loadInTab(tab, INCLUDED_SITE);
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called when the proxy is not active"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that we don't show confirmation hints for included sites on reloads.
 */
add_task(async function test_inclusion_hint_page_reloads() {
  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_INCLUSION,
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    INCLUDED_SITE
  );
  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  await BrowserTestUtils.reloadTab(tab);
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called on reload"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests confirmation hint visibility between unprotected and included sites
 * within a single tab, and that the hint is shown once per included site
 * during a VPN session.
 *
 * Test cases:
 * 1. initial unprotected: do not show
 * 2. unprotected --> included: show (+1)
 * 3. included --> included: do not show
 * 4. included --> unprotected: do not show
 * 5. unprotected --> included (same site): do not show
 * 6. included --> unprotected --> included (different site): show (+2)
 */
add_task(async function test_inclusion_hint_visibility_same_tab() {
  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_INCLUSION,
  });

  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  Assert.equal(
    showConfirmationHintSpy.callCount,
    0,
    "ConfirmationHint.show() should have callCount == 0 after initial unprotected site"
  );

  await loadInTab(tab, INCLUDED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should have callCount == 1 after unprotected --> included navigation"
  );
  Assert.equal(
    showConfirmationHintSpy.lastCall.args[1],
    "confirmation-hint-ipprotection-navigated-to-included-site",
    "The included site message should be shown"
  );
  Assert.ok(
    !showConfirmationHintSpy.lastCall.args[2].hideCheckmark,
    "The checkmark should be shown for included sites"
  );

  await loadInTab(tab, INCLUDED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should still have callCount == 1 after included --> included navigation"
  );

  await loadInTab(tab, UNPROTECTED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should still have callCount == 1 after included --> unprotected navigation"
  );

  await loadInTab(tab, INCLUDED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should still have callCount == 1 after returning to an already visited included site"
  );

  await loadInTab(tab, UNPROTECTED_SITE);
  await loadInTab(tab, INCLUDED_SITE_2);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    2,
    "ConfirmationHint.show() should have callCount == 2 after unprotected --> included (different site) navigation"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that the confirmation hint is shown again for an included site in a
 * new VPN session.
 */
add_task(async function test_inclusion_hint_new_vpn_session() {
  const sandbox = sinon.createSandbox();
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_INCLUSION,
  });

  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  await loadInTab(tab, INCLUDED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "Hint should be shown on first visit to the included site"
  );
  await loadInTab(tab, UNPROTECTED_SITE);

  resetVPNSession(sandbox);
  stubInclusionRules(sandbox, {
    state: IPPProxyStates.ACTIVE,
    mode: IPPMode.MODE_INCLUSION,
  });
  showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  await loadInTab(tab, INCLUDED_SITE);
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "Hint should be shown again for the included site in a new VPN session"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that the confirmation hint for an included site navigated to while
 * the proxy is activating is shown once the connection is active.
 */
add_task(async function test_inclusion_hint_deferred_until_active() {
  const sandbox = sinon.createSandbox();
  let proxyState = IPPProxyStates.ACTIVATING;
  stubInclusionRules(sandbox, { mode: IPPMode.MODE_INCLUSION });
  sandbox.stub(IPPProxyManager, "state").get(() => proxyState);

  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  await loadInTab(tab, INCLUDED_SITE);
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called while the proxy is activating"
  );

  proxyState = IPPProxyStates.ACTIVE;
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should be called once the proxy is active"
  );
  Assert.equal(
    showConfirmationHintSpy.lastCall.args[1],
    "confirmation-hint-ipprotection-navigated-to-included-site",
    "The included site message should be shown"
  );
  Assert.ok(
    !showConfirmationHintSpy.lastCall.args[2].hideCheckmark,
    "The checkmark should be shown for included sites"
  );

  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );
  Assert.equal(
    showConfirmationHintSpy.callCount,
    1,
    "ConfirmationHint.show() should not be called again for the same site"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that a deferred confirmation hint is dropped if the user navigates
 * away from the included site before the connection is active.
 */
add_task(async function test_inclusion_hint_deferred_navigated_away() {
  const sandbox = sinon.createSandbox();
  let proxyState = IPPProxyStates.ACTIVATING;
  stubInclusionRules(sandbox, { mode: IPPMode.MODE_INCLUSION });
  sandbox.stub(IPPProxyManager, "state").get(() => proxyState);

  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    UNPROTECTED_SITE
  );
  await loadInTab(tab, INCLUDED_SITE);
  await loadInTab(tab, UNPROTECTED_SITE);

  proxyState = IPPProxyStates.ACTIVE;
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );
  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called after navigating away from the included site"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});

/**
 * Tests that including the current site doesn't show a confirmation hint,
 * even if the proxy starts activating before the rule change is handled.
 */
add_task(async function test_inclusion_hint_rule_added_on_current_site() {
  const sandbox = sinon.createSandbox();
  let proxyState = IPPProxyStates.READY;
  let isIncluded = false;
  sandbox.stub(IPPProxyManager, "state").get(() => proxyState);
  sandbox.stub(IPPProxyManager, "mode").value(IPPMode.MODE_INCLUSION);
  sandbox
    .stub(IPPSiteRuleManager, "getRule")
    .callsFake(principal =>
      isIncluded && principal?.origin === INCLUDED_SITE
        ? IPPPrincipalRules.INCLUDED
        : IPPPrincipalRules.DEFAULT
    );

  let showConfirmationHintSpy = sandbox.spy(window.ConfirmationHint, "show");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    INCLUDED_SITE
  );

  // Auto-activation handles the rule change first and starts the proxy.
  isIncluded = true;
  proxyState = IPPProxyStates.ACTIVATING;
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );
  IPPSiteRuleManager.dispatchEvent(
    new CustomEvent("SiteRuleManager:RuleChanged")
  );
  proxyState = IPPProxyStates.ACTIVE;
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged")
  );

  Assert.ok(
    !showConfirmationHintSpy.called,
    "ConfirmationHint.show() should not be called when including the current site"
  );

  BrowserTestUtils.removeTab(tab);
  resetVPNSession(sandbox);
});
