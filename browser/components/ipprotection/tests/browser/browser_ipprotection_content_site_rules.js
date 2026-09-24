/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const MOCK_SITE_NAME = "https://example.com";

const INCLUSIONS_PREF = "browser.ipProtection.features.siteInclusions";

const MANAGE_RULES_L10N_ID = "site-rules-manage-rules-link-text";

const STATUS_HEADING_L10N_ID = "site-rules-status-heading";
const EXCLUSION_DESCRIPTION_L10N_ID = "site-rules-description-exclusion";
const INCLUSION_DESCRIPTION_L10N_ID = "site-rules-description-inclusion";

const VPN_ON_ICON =
  "chrome://browser/content/ipprotection/assets/states/ipprotection-on.svg";
const VPN_OFF_ICON =
  "chrome://browser/content/ipprotection/assets/states/ipprotection-off.svg";

const SETTINGS_PANE = "privacy-vpnsiterules";

/**
 * The feature pref is re-read from the pref on every panel open (see
 * IPProtectionPanel.updateComponentState), so it cannot be injected as panel
 * state - it has to be pushed as a real pref.
 *
 * @param {boolean} enabled
 *  Whether site inclusions should be enabled.
 */
async function pushInclusionsPref(enabled) {
  await SpecialPowers.pushPrefEnv({
    set: [[INCLUSIONS_PREF, enabled]],
  });
}

/**
 * @param {IPProtectionContentElement} content
 *  The panel content element.
 * @returns {Element|null}
 *  The site rule status card, if any.
 */
function getSiteRuleStatus(content) {
  return content.shadowRoot.querySelector("#site-rule-status-container");
}

/**
 * @param {IPProtectionContentElement} content
 *  The panel content element.
 * @returns {Element|null}
 *  The icon of the site rule status card, if any.
 */
function getSiteRuleStatusIcon(content) {
  return content.shadowRoot.querySelector("#site-rule-status-container img");
}

/**
 * openPanel() applies its state before showing(), which then recomputes
 * siteData from the loaded tab - and #getSiteData currently hardcodes
 * isInclusion to false (Bug 2066802). Re-apply the state once the panel is up
 * so the injected siteData survives.
 *
 * @param {object} state
 *  The panel state to apply.
 * @returns {Promise<IPProtectionContentElement>}
 *  The panel content element.
 */
async function openPanelWithSiteData(state) {
  let content = await openPanel(state);
  await setPanelState(state);

  return content;
}

/**
 * Asserts the status card shows the given rule description and icon, and that
 * both strings actually resolve, which guards against the Fluent messages
 * being renamed or removed.
 *
 * @param {IPProtectionContentElement} content
 *  The panel content element.
 * @param {string} descriptionL10nId
 *  The expected description string ID.
 * @param {string} iconSrc
 *  The expected icon URL.
 */
async function checkSiteRuleStatus(content, descriptionL10nId, iconSrc) {
  let statusEl = getSiteRuleStatus(content);
  Assert.ok(statusEl, "Site rule status card should be present");
  Assert.ok(
    BrowserTestUtils.isVisible(statusEl),
    "Site rule status card should be visible"
  );

  let headingEl = statusEl.querySelector("#site-rule-heading");
  Assert.ok(headingEl, "Site rule status card should have a heading");
  Assert.equal(
    headingEl.getAttribute("data-l10n-id"),
    STATUS_HEADING_L10N_ID,
    "Site rule status heading should use the status heading string"
  );
  Assert.ok(
    headingEl.classList.contains("text-deemphasized"),
    "Site rule status heading should be deemphasized"
  );

  let descriptionEl = statusEl.querySelector("#site-rule-description");
  Assert.ok(descriptionEl, "Site rule status card should have a description");
  Assert.equal(
    descriptionEl.getAttribute("data-l10n-id"),
    descriptionL10nId,
    `Site rule status description should use ${descriptionL10nId}`
  );

  Assert.equal(
    getSiteRuleStatusIcon(content)?.getAttribute("src"),
    iconSrc,
    `Site rule status card should show ${iconSrc}`
  );

  await TestUtils.waitForCondition(
    () => headingEl.textContent.trim() && descriptionEl.textContent.trim(),
    "Waiting for the site rule status card to be localized"
  );
}

/**
 * Tests that the site rules link is not shown when the feature pref is
 * disabled, and that the exclusion toggle is shown in its place.
 */
add_task(async function test_site_rules_feature_pref_disabled() {
  await pushInclusionsPref(false);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    !content.siteRulesEl,
    "Site rules link should not be present when the feature pref is disabled"
  );
  Assert.ok(
    content.siteExclusionControlEl,
    "Site exclusion control should still be present when inclusions are off"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that enabling site inclusions swaps the exclusion toggle for the
 * site rules link.
 */
add_task(async function test_site_rules_replaces_exclusion_toggle() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(
    content.siteRulesEl,
    "Site rules link should be present when the feature pref is enabled"
  );
  Assert.ok(
    !content.siteExclusionControlEl,
    "Site exclusion control should not be present when inclusions are on"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that we don't show the site rules link if siteData is invalid.
 */
add_task(async function test_site_rules_requires_siteData() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: true,
  });

  // showing() recomputes siteData from the currently loaded tab on every open,
  // so it has to be cleared once the panel is up rather than via openPanel.
  await setPanelState({
    isProtectionEnabled: true,
    siteData: null,
  });

  Assert.ok(
    !content.siteRulesEl,
    "Site rules link should not be present without siteData"
  );

  let siteRulesVisiblePromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.siteRulesEl
  );

  await setPanelState({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  await Promise.all([content.updateComplete, siteRulesVisiblePromise]);

  Assert.ok(
    content.siteRulesEl,
    "Site rules link should appear once siteData is available"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that we don't show the site rules link when the panel is in an
 * error state.
 */
add_task(async function test_site_rules_hidden_on_error() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: true,
    error: "generic",
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  // showing() recomputes siteData from the currently loaded tab on every open,
  // so it has to be cleared once the panel is up rather than via openPanel.
  await setPanelState({
    isProtectionEnabled: true,
    error: "generic",
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(
    !content.siteRulesEl,
    "Site rules link should not be present in an error state"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that the site rules link is shown regardless of whether the VPN is
 * currently connected
 */
add_task(async function test_site_rules_visible_with_vpn_off() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: false,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  // showing() recomputes siteData from the currently loaded tab on every open,
  // so it has to be cleared once the panel is up rather than via openPanel.
  await setPanelState({
    isProtectionEnabled: false,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(
    content.siteRulesEl,
    "Site rules link should be present with the VPN off"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests the content of the manage site rules section
 */
add_task(async function test_site_rules_manage_rules_content() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanel({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  // showing() recomputes siteData from the currently loaded tab on every open,
  // so it has to be cleared once the panel is up rather than via openPanel.
  await setPanelState({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  let siteRulesEl = content.siteRulesEl;
  Assert.ok(siteRulesEl, "Site rules control should be present");

  Assert.equal(
    siteRulesEl.localName,
    "moz-button",
    "Site rules control should be a moz-button"
  );
  Assert.equal(
    siteRulesEl.getAttribute("type"),
    "ghost",
    "Site rules control should be a ghost button"
  );
  Assert.equal(
    siteRulesEl.getAttribute("iconsrc"),
    "chrome://browser/skin/permissions.svg",
    "Site rules control should show the permissions icon"
  );
  Assert.equal(
    siteRulesEl.getAttribute("data-l10n-id"),
    MANAGE_RULES_L10N_ID,
    "Site rules control should use the manage rules string"
  );
  // Guards against the Fluent message being renamed or removed.
  await TestUtils.waitForCondition(
    () => siteRulesEl.textContent.trim(),
    "Waiting for the site rules control to be localized"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that activating the site rules link closes the panel and opens the
 * site rules settings sub-pane
 */
add_task(async function test_site_rules_link_opens_settings() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    MOCK_SITE_NAME
  );

  let content = await openPanel({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  // showing() recomputes siteData from the currently loaded tab on every open,
  // so it has to be cleared once the panel is up rather than via openPanel.
  await setPanelState({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(content.siteRulesEl, "Site rules link should be present");

  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  const openPreferencesStub = sinon.stub(window, "openPreferences");

  content.siteRulesEl.click();

  await panelHiddenPromise;

  let panelView = PanelMultiView.getViewNode(
    document,
    IPProtectionWidget.PANEL_ID
  );
  Assert.ok(!BrowserTestUtils.isVisible(panelView), "Panel should be closed");

  Assert.ok(
    openPreferencesStub.calledWith(SETTINGS_PANE),
    "openPreferences should be called with the site rules pane"
  );
  Assert.equal(
    gBrowser.selectedTab,
    tab,
    "Clicking the site rules link should not have navigated the current tab"
  );

  openPreferencesStub.restore();
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests the site rules status card shown for a site the user has excluded while the VPN
 * is on, where the rule turns the VPN off for that site.
 */
add_task(async function test_site_rule_status_exclusion() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  await checkSiteRuleStatus(
    content,
    EXCLUSION_DESCRIPTION_L10N_ID,
    VPN_OFF_ICON
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests the site rules status card shown for a site the user has included while the VPN
 * is off, where the rule turns the VPN on for that site.
 */
add_task(async function test_site_rule_status_inclusion() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: false,
    siteData: {
      isExclusion: false,
      isInclusion: true,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    content.hasSiteInclusion,
    "Content element should report a site inclusion"
  );

  await checkSiteRuleStatus(
    content,
    INCLUSION_DESCRIPTION_L10N_ID,
    VPN_ON_ICON
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests the structure of the status card: the heading and description are
 * grouped in the text container, and the icon sits alongside that container
 * rather than inside it.
 */
add_task(async function test_site_rule_status_structure() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  let statusEl = getSiteRuleStatus(content);
  Assert.ok(statusEl, "Site rule status card should be present");

  let textContainerEl = statusEl.querySelector(
    "#site-rule-status-text-container"
  );
  Assert.ok(
    textContainerEl,
    "Site rule status card should have a text container"
  );
  Assert.equal(
    textContainerEl.parentElement,
    statusEl,
    "Text container should be a direct child of the status card"
  );

  Assert.deepEqual(
    Array.from(textContainerEl.children).map(child => child.id),
    ["site-rule-heading", "site-rule-description"],
    "Text container should hold the heading followed by the description"
  );

  Assert.equal(
    getSiteRuleStatusIcon(content).parentElement,
    statusEl,
    "Icon should be a direct child of the status card, not of the text container"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * The site rules status card describes a rule that is currently changing the VPN's
 * behaviour for this site. A rule that agrees with the global VPN state is a
 * no-op, so there is nothing to report.
 */
add_task(async function test_site_rule_status_hidden_when_rule_is_a_noop() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      isInclusion: true,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should be hidden for an inclusion while the VPN is already on"
  );

  await setPanelState({
    isProtectionEnabled: false,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should be hidden for an exclusion while the VPN is already off"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * A site can be excluded from the proxy without the user having set a rule for
 * it (eg. the VPN's own infrastructure origins). There is no rule of the
 * user's to report, so the status card stays hidden even though the VPN is
 * effectively off for the site.
 */
add_task(async function test_site_rule_status_requires_user_rule() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: false,
    },
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should be hidden when the user has no rule for the site"
  );
  Assert.ok(
    content.siteRulesEl,
    "Site rules link should still be present without a user rule"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that the status card is gated on the feature pref, and that no part of
 * it leaks into the exclusion toggle layout.
 */
add_task(async function test_site_rule_status_feature_pref_disabled() {
  await pushInclusionsPref(false);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should not be present when the feature pref is disabled"
  );
  Assert.ok(
    content.siteExclusionControlEl,
    "Site exclusion control should be shown in its place"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that we don't show the status card when the panel is in an error
 * state, since the reported rule would not reflect what the VPN is doing.
 */
add_task(async function test_site_rule_status_hidden_on_error() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    error: "generic",
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should not be present in an error state"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that the status card appears and disappears as the global VPN state
 * changes under a fixed exclusion rule.
 */
add_task(async function test_site_rule_status_follows_protection_state() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  const siteData = {
    isExclusion: true,
    isInclusion: false,
    hasSiteRule: true,
  };

  let content = await openPanelWithSiteData({
    isProtectionEnabled: false,
    siteData,
  });

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should start hidden with the VPN off"
  );

  let statusShownPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => getSiteRuleStatus(content)
  );

  await setPanelState({
    isProtectionEnabled: true,
    siteData,
  });
  await Promise.all([content.updateComplete, statusShownPromise]);

  await checkSiteRuleStatus(
    content,
    EXCLUSION_DESCRIPTION_L10N_ID,
    VPN_OFF_ICON
  );

  let statusHiddenPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => !getSiteRuleStatus(content)
  );

  await setPanelState({
    isProtectionEnabled: false,
    siteData,
  });
  await Promise.all([content.updateComplete, statusHiddenPromise]);

  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should be removed once the rule no longer changes anything"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that the status card and the site rules link are shown together, with
 * the card above the link, and that the link offers to manage rules.
 */
add_task(async function test_site_rule_status_precedes_settings_link() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: true,
      isInclusion: false,
      hasSiteRule: true,
    },
  });

  let statusEl = getSiteRuleStatus(content);
  let siteRulesEl = content.siteRulesEl;

  Assert.ok(statusEl, "Status card should be present");
  Assert.ok(siteRulesEl, "Site rules link should be present alongside it");
  Assert.ok(
    statusEl.compareDocumentPosition(siteRulesEl) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    "Status card should come before the site rules link"
  );
  Assert.equal(
    siteRulesEl.getAttribute("data-l10n-id"),
    MANAGE_RULES_L10N_ID,
    "Site rules link should offer to manage rules when a rule is reported"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests that siteData predating inclusions support (no isInclusion field) is
 * treated as having no inclusion rather than throwing.
 */
add_task(async function test_has_site_inclusion_defaults_to_false() {
  await pushInclusionsPref(true);

  setupService({
    isReady: true,
  });

  let content = await openPanelWithSiteData({
    isProtectionEnabled: true,
    siteData: {
      isExclusion: false,
      hasSiteRule: true,
    },
  });

  Assert.ok(
    !content.hasSiteInclusion,
    "hasSiteInclusion should be false when siteData omits isInclusion"
  );
  Assert.ok(
    !getSiteRuleStatus(content),
    "Site rule status card should be hidden when neither rule type applies"
  );

  await closePanel();
  await SpecialPowers.popPrefEnv();
});
