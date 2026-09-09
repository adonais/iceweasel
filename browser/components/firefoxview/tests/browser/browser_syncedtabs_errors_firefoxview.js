/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { LoginTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/LoginTestUtils.sys.mjs"
);

// Different strings used for Nova UI.
let isNovaEnabled = Services.prefs.getBoolPref("browser.nova.enabled", false);
const OFFLINE_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-network-offline-header-2"
  : "firefoxview-tabpickup-network-offline-header";
const SYNC_ERROR_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-sync-error-header-2"
  : "firefoxview-tabpickup-sync-error-header";
const DISABLED_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-fxa-admin-disabled-header-2"
  : "firefoxview-tabpickup-fxa-admin-disabled-header";
const SIGN_IN_DESCRIPTION_L10N_ID = isNovaEnabled
  ? "firefoxview-syncedtabs-signin-description-3"
  : "firefoxview-syncedtabs-signin-description-2";
const SIGN_IN_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-syncedtabs-signin-header-3"
  : "firefoxview-syncedtabs-signin-header-2";
const DISCONNECTED_DESCRIPTION_L10N_ID = isNovaEnabled
  ? "firefoxview-syncedtabs-synctabs-description-2"
  : "firefoxview-tabpickup-sync-disconnected-description";
const DISCONNECTED_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-syncedtabs-synctabs-header-2"
  : "firefoxview-tabpickup-sync-disconnected-header";
const DISCONNECTED_BUTTON_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-synctabs-primarybutton-2"
  : "firefoxview-tabpickup-sync-disconnected-primarybutton";
const PASSWORD_LOCKED_DESCRIPTION_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-password-locked-description-2"
  : "firefoxview-tabpickup-password-locked-description";
const PASSWORD_LOCKED_HEADER_L10N_ID = isNovaEnabled
  ? "firefoxview-tabpickup-password-locked-header-2"
  : "firefoxview-tabpickup-password-locked-header";

async function setupWithDesktopDevices(state = UIState.STATUS_SIGNED_IN) {
  const sandbox = setupSyncFxAMocks({
    state,
    fxaDevices: [
      {
        id: 1,
        name: "This Device",
        isCurrentDevice: true,
        type: "desktop",
        tabs: [],
      },
      {
        id: 2,
        name: "Other Device",
        type: "desktop",
        tabs: [],
      },
    ],
  });
  return sandbox;
}

async function tearDown(sandbox) {
  sandbox?.restore();
  Services.prefs.clearUserPref("services.sync.lastTabFetch");
  Services.prefs.clearUserPref("identity.fxaccounts.enabled");
}

add_setup(async function () {
  // gSync.init() is called in a requestIdleCallback. Force its initialization.
  gSync.init();

  await SpecialPowers.pushPrefEnv({
    set: [
      ["services.sync.engine.tabs", true],
      ["identity.fxaccounts.enabled", true],
    ],
  });

  registerCleanupFunction(async function () {
    // reset internal state so it doesn't affect the next tests
    TabsSetupFlowManager.resetInternalState();
    await tearDown(gSandbox);
  });
});

add_task(async function test_network_offline() {
  const sandbox = await setupWithDesktopDevices();
  sandbox.spy(TabsSetupFlowManager, "tryToClearError");
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");

    Services.obs.notifyObservers(null, UIState.ON_UPDATE);
    Services.obs.notifyObservers(
      null,
      "network:offline-status-changed",
      "offline"
    );

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState,
      { attributeFilter: ["headerlabel"] },
      () =>
        syncedTabsComponent.emptyState.getAttribute("headerlabel") ===
        OFFLINE_HEADER_L10N_ID
    );

    const setupStateChanged = TestUtils.topicObserved(
      "firefox-view.setupstate.changed"
    );
    syncedTabsComponent.emptyState
      .querySelector("moz-button[data-action='network-offline']")
      .buttonEl.click();
    await setupStateChanged;

    ok(
      TabsSetupFlowManager.tryToClearError.calledOnce,
      "TabsSetupFlowManager.tryToClearError() was called once"
    );

    Assert.equal(
      syncedTabsComponent.emptyState.getAttribute("headerlabel"),
      OFFLINE_HEADER_L10N_ID,
      "Network offline message is still shown"
    );

    Services.obs.notifyObservers(
      null,
      "network:offline-status-changed",
      "online"
    );
  });
  await tearDown(sandbox);
});

add_task(async function test_sync_error() {
  const sandbox = await setupWithDesktopDevices();
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");

    Services.obs.notifyObservers(null, UIState.ON_UPDATE);
    Services.obs.notifyObservers(null, "weave:service:sync:error");

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState,
      { attributeFilter: ["headerlabel"] },
      () =>
        syncedTabsComponent.emptyState.getAttribute("headerlabel") ===
        SYNC_ERROR_HEADER_L10N_ID
    );

    // Clear the error.
    Services.obs.notifyObservers(null, "weave:service:sync:finish");
  });
  await tearDown(sandbox);
});

// test for sync admin disabled
add_task(async function test_sync_admin_disabled() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").callsFake(() => {
    return {
      status: UIState.STATUS_NOT_CONFIGURED,
      syncEnabled: false,
    };
  });

  Services.prefs.lockPref("identity.fxaccounts.enabled");

  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");

    Services.obs.notifyObservers(null, UIState.ON_UPDATE);

    is(
      Services.prefs.getBoolPref("identity.fxaccounts.enabled"),
      true,
      "Expected identity.fxaccounts.enabled pref to be true"
    );
    is(
      Services.prefs.prefIsLocked("identity.fxaccounts.enabled"),
      true,
      "Expected identity.fxaccounts.enabled pref to be locked"
    );

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState,
      { attributeFilter: ["headerlabel"] },
      () =>
        syncedTabsComponent.emptyState.getAttribute("headerlabel") ===
        DISABLED_HEADER_L10N_ID
    );
  });

  Services.prefs.unlockPref("identity.fxaccounts.enabled");
  await tearDown(sandbox);
});

add_task(async function test_sync_disabled_by_policy() {
  await SpecialPowers.pushPrefEnv({
    set: [["identity.fxaccounts.enabled", false]],
  });
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    const recentBrowsingSyncedTabs = document.querySelector(
      "view-syncedtabs[slot=syncedtabs]"
    );
    const syncedtabsPageNavButton = document.querySelector(
      "moz-page-nav-button[view='syncedtabs']"
    );

    ok(
      BrowserTestUtils.isHidden(recentBrowsingSyncedTabs),
      "Synced tabs should not be visible from recent browsing."
    );
    ok(
      BrowserTestUtils.isHidden(syncedtabsPageNavButton),
      "Synced tabs nav button should not be visible."
    );

    document.location.assign(`${getFirefoxViewURL()}#syncedtabs`);
    await TestUtils.waitForTick();
    is(
      document.querySelector("moz-page-nav").currentView,
      "recentbrowsing",
      "Should not be able to navigate to synced tabs."
    );
  });
  await tearDown();
});

add_task(async function test_sync_error_signed_out() {
  // sync error should not show if user is not signed in
  let sandbox = await setupWithDesktopDevices(UIState.STATUS_NOT_CONFIGURED);
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);
    Services.obs.notifyObservers(null, "weave:service:sync:error");

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState.shadowRoot,
      { childList: true, subtree: true },
      () =>
        document.l10n.getAttributes(
          syncedTabsComponent.emptyState.descriptionEls[0]
        ).id === SIGN_IN_DESCRIPTION_L10N_ID
    );

    Assert.equal(
      syncedTabsComponent.emptyState.getAttribute("headerlabel"),
      SIGN_IN_HEADER_L10N_ID,
      "Sign in message is shown"
    );
  });
  await tearDown(sandbox);
});

add_task(async function test_sync_disconnected_error() {
  // it's possible for fxa to be enabled but sync not enabled.
  const sandbox = setupSyncFxAMocks({
    state: UIState.STATUS_SIGNED_IN,
    syncEnabled: false,
  });
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");

    // triggered when user disconnects sync in about:preferences
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    info("Waiting for the synced tabs error step to be visible");
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState.shadowRoot,
      { childList: true, subtree: true },
      () =>
        document.l10n.getAttributes(
          syncedTabsComponent.emptyState.descriptionEls[0]
        ).id === DISCONNECTED_DESCRIPTION_L10N_ID
    );

    info(
      "Waiting for a mutation condition to ensure the right syncing error message"
    );
    Assert.equal(
      syncedTabsComponent.emptyState.getAttribute("headerlabel"),
      DISCONNECTED_HEADER_L10N_ID,
      "Correct message should show when sync's been disconnected error"
    );

    let preferencesTabPromise = BrowserTestUtils.waitForNewTab(
      browser.getTabBrowser(),
      "about:preferences?action=choose-what-to-sync#sync",
      true
    );
    let emptyStateButton = syncedTabsComponent.emptyState.querySelector(
      "moz-button[data-action='sync-disconnected']"
    );
    Assert.equal(
      document.l10n.getAttributes(emptyStateButton).id,
      DISCONNECTED_BUTTON_L10N_ID,
      "Call-to-action button has correct text when sync's been disconnected."
    );
    EventUtils.synthesizeMouseAtCenter(emptyStateButton.buttonEl, {}, content);
    let preferencesTab = await preferencesTabPromise;
    await BrowserTestUtils.removeTab(preferencesTab);
  });
  await tearDown(sandbox);
});

add_task(async function test_password_change_disconnect_error() {
  // When the user changes their password on another device, we get into a state
  // where the user is signed out but sync is still enabled.
  const sandbox = setupSyncFxAMocks({
    state: UIState.STATUS_LOGIN_FAILED,
    syncEnabled: true,
  });
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");

    // triggered by the user changing fxa password on another device
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState.shadowRoot,
      { childList: true, subtree: true },
      () =>
        document.l10n.getAttributes(
          syncedTabsComponent.emptyState.descriptionEls[0]
        ).id === SIGN_IN_DESCRIPTION_L10N_ID
    );

    Assert.equal(
      syncedTabsComponent.emptyState.getAttribute("headerlabel"),
      SIGN_IN_HEADER_L10N_ID,
      "Sign in message is shown"
    );
  });
  await tearDown(sandbox);
});

add_task(async function test_multiple_errors() {
  let sandbox = await setupWithDesktopDevices();
  await withFirefoxView({}, async browser => {
    const { document } = browser.contentWindow;
    await navigateToViewAndWait(document, "syncedtabs");
    // Simulate conditions in which both the locked password and sync error
    // messages could be shown
    await LoginTestUtils.primaryPassword.enable();
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);
    Services.obs.notifyObservers(null, "weave:service:sync:error");

    let syncedTabsComponent = document.querySelector(
      "view-syncedtabs:not([slot=syncedtabs])"
    );
    await syncedTabsComponent.updateComplete;
    info("Waiting for the primary password error message to be shown");
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState.shadowRoot,
      { childList: true, subtree: true },
      () =>
        document.l10n.getAttributes(
          syncedTabsComponent.emptyState.descriptionEls[0]
        ).id === PASSWORD_LOCKED_DESCRIPTION_L10N_ID
    );

    Assert.equal(
      syncedTabsComponent.emptyState.getAttribute("headerlabel"),
      PASSWORD_LOCKED_HEADER_L10N_ID,
      "Password locked message is shown"
    );

    const errorLink = syncedTabsComponent.emptyState.shadowRoot.querySelector(
      "a[data-l10n-name=syncedtab-password-locked-link]"
    );
    if (!isNovaEnabled) {
      ok(
        errorLink && BrowserTestUtils.isVisible(errorLink),
        "Error link is visible"
      );
    }

    // Clear the primary password error message
    await LoginTestUtils.primaryPassword.disable();
    Services.obs.notifyObservers(null, UIState.ON_UPDATE);

    info("Waiting for the sync error message to be shown");
    await syncedTabsComponent.updateComplete;
    await BrowserTestUtils.waitForMutationCondition(
      syncedTabsComponent.emptyState,
      { attributeFilter: ["headerlabel"] },
      () =>
        syncedTabsComponent.emptyState.getAttribute("headerlabel") ===
        SYNC_ERROR_HEADER_L10N_ID
    );

    if (!isNovaEnabled) {
      ok(
        errorLink && BrowserTestUtils.isHidden(errorLink),
        "Error link is now hidden"
      );
    }

    // Clear the sync error
    Services.obs.notifyObservers(null, "weave:service:sync:finish");
  });
  await tearDown(sandbox);
});
