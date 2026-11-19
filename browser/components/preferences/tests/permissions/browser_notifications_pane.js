/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SECTION_PREF = "browser.preferences.notifications-section.enabled";
const CLOSED_DELIVERY_PREF = "app.backgroundNotifications.helper.available";

// The www. prefix is stripped for display, so these sort alpha, beta, gamma.
const SITES = [
  ["https://beta.example.com", Services.perms.ALLOW_ACTION],
  ["https://www.alpha.example.com", Services.perms.DENY_ACTION],
  ["https://gamma.example.org", Services.perms.ALLOW_ACTION],
];
const ORIGINS = SITES.map(([origin]) => origin);
const SORTED_HOSTS = [
  "alpha.example.com",
  "beta.example.com",
  "gamma.example.org",
];

function addPermission(origin, capability) {
  PermissionTestUtils.add(origin, "desktop-notification", capability);
}

function removePermission(origin) {
  PermissionTestUtils.remove(origin, "desktop-notification");
}

function getRows(control) {
  return [...control.querySelectorAll("moz-box-item:not([slot='header'])")];
}

function getTestRows(control) {
  return getRows(control).filter(row =>
    ORIGINS.includes(row.getAttribute("value"))
  );
}

function getStateL10nIds(rows) {
  return rows.map(row =>
    row.querySelector("[slot='actions']")?.getAttribute("data-l10n-id")
  );
}

async function openNotificationsPane() {
  let tab = await openPrefsTab("notifications");
  let win = tab.linkedBrowser.contentWindow;
  let control = await settingControlRenders("notification-sites-list", win);
  await control.controlEl.updateComplete;
  return { tab, win, control };
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [[SECTION_PREF, true]] });

  for (let [origin, capability] of SITES) {
    addPermission(origin, capability);
  }
  registerCleanupFunction(() => {
    for (let origin of ORIGINS) {
      removePermission(origin);
    }
  });
});

add_task(async function test_hidden_without_pref() {
  await SpecialPowers.pushPrefEnv({ set: [[SECTION_PREF, false]] });
  let tab = await openPrefsTab("permissionsData");
  let win = tab.linkedBrowser.contentWindow;

  let entry = await settingControlRenders("notificationSettingsEntry", win);
  ok(entry.hidden, "Entry row is hidden while the section pref is off");
  ok(
    entry.closest("setting-group").hasAttribute("data-hidden-by-setting-group"),
    "Its card is hidden too, so the shipped page is unchanged"
  );

  BrowserTestUtils.removeTab(tab);

  info("The sub-page is not reachable by URL either");
  tab = await openPrefsTab("notifications");
  win = tab.linkedBrowser.contentWindow;
  ok(
    !win.document.querySelector('[data-category="paneNotifications"]'),
    "No Notifications pane was registered"
  );
  isnot(
    win.history.state?.category,
    "notifications",
    "Deep linking falls back to the default pane"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_entry_card_and_deep_link() {
  addPermission("https://prompt.example.com", Services.perms.PROMPT_ACTION);
  let tab = await openPrefsTab("permissionsData");
  let win = tab.linkedBrowser.contentWindow;

  let entry = await settingControlRenders("notificationSettingsEntry", win);
  await entry.controlEl.updateComplete;

  ok(!entry.hidden, "Entry row is shown while the section pref is on");
  is(
    entry.controlEl.label,
    "Manage notification settings",
    "The entry row is labelled for managing existing settings"
  );
  is(
    entry.controlEl.description,
    "3 websites",
    "Subtitle counts only origins with an allowed or blocked decision"
  );
  ok(
    !getSettingControl("notificationSettingsButton", win).hidden,
    "The legacy row stays until bug 2073605, so permissions can still be removed"
  );

  let paneShown = waitForPaneChange("notifications", win);
  synthesizeClick(entry.controlEl);
  await paneShown;

  BrowserTestUtils.removeTab(tab);

  info("about:preferences#notifications reaches the sub-page directly");
  let { tab: deepLinkTab } = await openNotificationsPane();
  BrowserTestUtils.removeTab(deepLinkTab);
  removePermission("https://prompt.example.com");
});

add_task(async function test_site_list() {
  let { tab, win, control } = await openNotificationsPane();

  Assert.deepEqual(
    getTestRows(control).map(row => row.label),
    SORTED_HOSTS,
    "Every origin with a stored decision is listed, sorted by display host"
  );
  Assert.deepEqual(
    getStateL10nIds(getTestRows(control)),
    [
      "notifications-state-never",
      "notifications-state-allow",
      "notifications-state-allow",
    ],
    "Blocked sites appear inline, showing their stored state in the state column"
  );
  let header = control.querySelector("moz-box-item[slot='header']");
  is(
    header.getAttribute("data-l10n-id"),
    "notifications-list-header",
    "The website column is headed in the singular while there are rows"
  );
  let stateHeading = header.querySelector(
    "[data-l10n-id='notifications-list-header-state']"
  );
  ok(
    stateHeading,
    "The header row labels the state column while there are rows to state"
  );
  // The state heading is slotted, so it misses the class that weights the
  // item's own label and has to be weighted separately.
  is(
    win.getComputedStyle(stateHeading).fontWeight,
    win.getComputedStyle(header.shadowRoot.querySelector(".label")).fontWeight,
    "Both column headings are weighted the same"
  );

  info("The list excludes the same permissions the dialog excludes");
  // Granted in a private window, so it never persists.
  let privatePrincipal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://private.example.com"),
    { privateBrowsingId: 1 }
  );
  PermissionTestUtils.add(
    privatePrincipal,
    "desktop-notification",
    Services.perms.ALLOW_ACTION
  );
  // Neither allowed nor blocked, so there is no decision to state.
  addPermission("https://prompt.example.com", Services.perms.PROMPT_ACTION);
  // A permission that does belong in the list, so the assertion below runs
  // against a refreshed list rather than one that has not caught up.
  addPermission("https://zeta.example.com", Services.perms.ALLOW_ACTION);
  await BrowserTestUtils.waitForMutationCondition(
    control,
    { childList: true, subtree: true },
    () =>
      getRows(control).some(
        row => row.getAttribute("value") == "https://zeta.example.com"
      )
  );

  Assert.deepEqual(
    getRows(control).map(row => row.label),
    [...SORTED_HOSTS, "zeta.example.com"],
    "Neither the private grant nor the prompt permission is listed"
  );

  PermissionTestUtils.remove(privatePrincipal, "desktop-notification");
  removePermission("https://prompt.example.com");
  removePermission("https://zeta.example.com");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_live_refresh() {
  let { tab, control } = await openNotificationsPane();
  let hasDelta = () =>
    getRows(control).some(
      row => row.getAttribute("value") == "https://delta.example.com"
    );

  info("A permission granted elsewhere appears without a reload");
  addPermission("https://delta.example.com", Services.perms.ALLOW_ACTION);
  await BrowserTestUtils.waitForMutationCondition(
    control,
    { childList: true, subtree: true },
    hasDelta
  );

  removePermission("https://delta.example.com");
  await BrowserTestUtils.waitForMutationCondition(
    control,
    { childList: true, subtree: true },
    () => !hasDelta()
  );
  ok(true, "Revoking it removes the row again");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_search() {
  let { tab, win, control } = await openNotificationsPane();
  let filter = win.document.getElementById("notificationsFilter");

  async function search(query, predicate) {
    filter.focus();
    filter.inputEl.select();
    EventUtils.sendString(query, win);
    await BrowserTestUtils.waitForMutationCondition(
      control,
      { childList: true, subtree: true },
      predicate
    );
  }

  await search("beta", () => getTestRows(control).length == 1);
  Assert.deepEqual(
    getTestRows(control).map(row => row.label),
    ["beta.example.com"],
    "Typing filters the list to matching hosts"
  );

  await search("ëxample", () => getTestRows(control).length == 3);
  ok(true, "Matching ignores diacritics as well as case");

  await search("nothinghere", () =>
    control.querySelector("#notifications-no-results")
  );
  is(getTestRows(control).length, 0, "No rows are left when nothing matches");
  is(
    control
      .querySelector("moz-box-item[slot='header']")
      .getAttribute("data-l10n-id"),
    "notifications-list-header-empty",
    "The header over no results is the one used over an empty list"
  );
  let noResults = control.querySelector("#notifications-no-results");
  await win.document.l10n.translateElements([noResults]);
  await noResults.updateComplete;
  is(
    noResults.label,
    "No website notifications match your search.",
    "The no-results message describes a search without matching websites"
  );

  filter.clear();
  await BrowserTestUtils.waitForMutationCondition(
    control,
    { childList: true, subtree: true },
    () => getTestRows(control).length == 3
  );
  ok(true, "Clearing the search restores the full list");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_empty_state() {
  for (let origin of ORIGINS) {
    removePermission(origin);
  }

  let { tab, win, control } = await openNotificationsPane();

  ok(
    control.querySelector("#notifications-empty"),
    "The card shows an empty state rather than a blank list"
  );
  let empty = control.querySelector("#notifications-empty");
  await win.document.l10n.translateElements([empty]);
  await empty.updateComplete;
  is(
    empty.label,
    "No website notifications added.",
    "The empty-list message describes having no stored website notifications"
  );
  is(
    control
      .querySelector("moz-box-item[slot='header']")
      ?.getAttribute("data-l10n-id"),
    "notifications-list-header-empty",
    "The header row stays over the empty state, headed in the plural"
  );
  ok(
    !control.querySelector("[data-l10n-id='notifications-list-header-state']"),
    "But the state column is not labelled, having nothing to state"
  );
  ok(
    win.document.getElementById("notificationsFilter"),
    "The search box is still shown over an empty list"
  );

  let paneShown = waitForPaneChange("permissionsData", win);
  win.location.hash = "permissionsData";
  await paneShown;

  let entry = await settingControlRenders("notificationSettingsEntry", win);
  await entry.controlEl.updateComplete;
  is(
    entry.controlEl.label,
    "Manage website notification settings",
    "The entry row keeps its empty-state label"
  );
  ok(
    !entry.controlEl.description,
    "The entry row drops its subtitle rather than showing a count of zero"
  );

  BrowserTestUtils.removeTab(tab);

  for (let [origin, capability] of SITES) {
    addPermission(origin, capability);
  }
});

add_task(async function test_state_label_with_closed_delivery() {
  await SpecialPowers.pushPrefEnv({ set: [[CLOSED_DELIVERY_PREF, true]] });

  let { tab, control } = await openNotificationsPane();

  Assert.deepEqual(
    getStateL10nIds(getTestRows(control)),
    [
      "notifications-state-never",
      "notifications-state-always",
      "notifications-state-always",
    ],
    "Allowed sites read Always where closed-browser delivery is available"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Last, because the permission manager refuses to remove EXPIRE_POLICY
// permissions, so this task has to clear the whole store to clean up.
add_task(async function test_policy_duplicate_excluded() {
  for (let origin of [
    "https://policy.example.com",
    "https://policy.example.com.",
  ]) {
    PermissionTestUtils.add(
      origin,
      "desktop-notification",
      Services.perms.ALLOW_ACTION,
      Services.perms.EXPIRE_POLICY,
      0
    );
  }

  let { tab, control } = await openNotificationsPane();

  Assert.deepEqual(
    getRows(control).map(row => row.label),
    [...SORTED_HOSTS, "policy.example.com"],
    "A policy permission repeated for the trailing dot host is listed once"
  );

  BrowserTestUtils.removeTab(tab);
  Services.perms.removeAll();
});
