/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

const ENTRY_POINT = "remote-tabs-app-menu-history";
const VARIANTS = {
  signin: {
    heading: "appmenu-sync-promo-signin",
    cta: "appmenu-sync-promo-signin-cta",
    image: "chrome://browser/skin/fxa/sync-promo-signin.svg",
    pref: "browser.promo.syncPromo.history.signin.dismissed",
  },
  turnonsync: {
    heading: "appmenu-sync-promo-turnonsync",
    cta: "appmenu-sync-promo-turnonsync-cta",
    image: "chrome://browser/skin/fxa/sync-promo-turnonsync.svg",
    pref: "browser.promo.syncPromo.history.turnonsync.dismissed",
  },
  connectdevice: {
    heading: "appmenu-sync-promo-connectdevice",
    cta: "appmenu-sync-promo-connectdevice-cta",
    image: "chrome://browser/skin/fxa/sync-promo-connectdevice.svg",
    pref: "browser.promo.syncPromo.history.connectdevice.dismissed",
  },
};

function synthesizeClick(el) {
  el.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(el, {}, el.ownerGlobal);
}

async function openHistoryView() {
  await gCUITestUtils.openMainMenu();
  let historyView = PanelMultiView.getViewNode(document, "PanelUI-history");
  synthesizeClick(document.getElementById("appMenu-history-button"));
  await BrowserTestUtils.waitForEvent(historyView, "ViewShown");
  return historyView;
}

async function getPromo(historyView) {
  let promo = historyView.querySelector("#PanelUI-history-sync-promo");
  await customElements.whenDefined("sync-promo");
  await customElements.whenDefined("moz-promo");
  await customElements.whenDefined("moz-button");
  await promo.updateComplete;
  return promo;
}

function clearDismissals() {
  for (let { pref } of Object.values(VARIANTS)) {
    Services.prefs.clearUserPref(pref);
  }
}

registerCleanupFunction(clearDismissals);

add_task(async function test_variants() {
  let sandbox = sinon.createSandbox();
  let promoState = sandbox.stub(gSync, "getSyncPromoState");
  let handleAction = sandbox.stub(gSync, "handleSyncPromoAction");

  for (let [state, expected] of Object.entries(VARIANTS)) {
    clearDismissals();
    promoState.returns(state);

    let historyView = await openHistoryView();
    let promo = await getPromo(historyView);
    let manageHistory = historyView.querySelector("#PanelUI-historyMore");
    let mozPromo = promo.shadowRoot.querySelector("moz-promo");
    let cta = promo.shadowRoot.querySelector("a[slot='support-link']");
    await mozPromo.updateComplete;

    ok(!promo.hidden, `${state}: promo is shown`);
    Assert.deepEqual(
      promoState.lastCall.args,
      [],
      `${state}: eligibility is not gated on any individual engine`
    );
    is(
      manageHistory.nextElementSibling,
      promo,
      `${state}: promo is below Manage history`
    );
    is(
      mozPromo.getAttribute("data-l10n-id"),
      expected.heading,
      `${state}: heading matches variant`
    );
    is(
      cta.getAttribute("data-l10n-id"),
      expected.cta,
      `${state}: CTA matches variant`
    );
    is(
      mozPromo.getAttribute("imagesrc"),
      expected.image,
      `${state}: illustration matches variant`
    );

    handleAction.resetHistory();
    let popupHidden = BrowserTestUtils.waitForEvent(
      document.getElementById("appMenu-popup"),
      "popuphidden"
    );
    synthesizeClick(cta);
    ok(handleAction.calledOnce, `${state}: CTA triggers the promo action`);
    Assert.deepEqual(
      handleAction.firstCall.args,
      [state, ENTRY_POINT],
      `${state}: action receives the variant and app menu entry point`
    );
    ok(
      !Services.prefs.getBoolPref(expected.pref, false),
      `${state}: CTA does not dismiss the promo`
    );
    await popupHidden;
  }

  sandbox.restore();
  clearDismissals();
});

add_task(async function test_per_variant_dismissal() {
  let sandbox = sinon.createSandbox();
  let promoState = sandbox.stub(gSync, "getSyncPromoState");
  sandbox.stub(gSync, "handleSyncPromoAction");
  clearDismissals();

  promoState.returns("signin");
  let historyView = await openHistoryView();
  let promo = await getPromo(historyView);
  let mozPromo = promo.shadowRoot.querySelector("moz-promo");
  synthesizeClick(mozPromo.closeButton);
  await promo.updateComplete;

  ok(promo.hidden, "Dismissing hides the promo");
  ok(
    Services.prefs.getBoolPref(VARIANTS.signin.pref, false),
    "Dismissal is persisted for the signin variant"
  );
  await gCUITestUtils.hideMainMenu();

  historyView = await openHistoryView();
  promo = await getPromo(historyView);
  ok(promo.hidden, "Dismissed signin variant stays hidden");

  promoState.returns("connectdevice");
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  mozPromo = promo.shadowRoot.querySelector("moz-promo");
  ok(!promo.hidden, "A different variant is not suppressed by the dismissal");
  is(
    mozPromo.getAttribute("data-l10n-id"),
    VARIANTS.connectdevice.heading,
    "The connectdevice variant is shown after dismissing signin"
  );
  await gCUITestUtils.hideMainMenu();

  sandbox.restore();
  clearDismissals();
});

add_task(async function test_state_transitions() {
  let sandbox = sinon.createSandbox();
  let promoState = sandbox.stub(gSync, "getSyncPromoState");
  sandbox.stub(gSync, "handleSyncPromoAction");
  clearDismissals();

  promoState.returns("signin");
  let historyView = await openHistoryView();
  let promo = await getPromo(historyView);
  ok(!promo.hidden, "Promo shown for eligible user");

  promoState.returns("turnonsync");
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  let mozPromo = promo.shadowRoot.querySelector("moz-promo");
  is(
    mozPromo.getAttribute("data-l10n-id"),
    VARIANTS.turnonsync.heading,
    "Promo updates to the new eligible variant"
  );

  promoState.returns(null);
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  ok(promo.hidden, "Promo disappears when the user becomes ineligible");

  await gCUITestUtils.hideMainMenu();
  sandbox.restore();
  clearDismissals();
});

add_task(async function test_sync_eligibility_ignores_engines() {
  let sandbox = sinon.createSandbox();
  let syncEnabled = true;
  sandbox.stub(UIState, "get").callsFake(() => ({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled,
  }));
  sandbox
    .stub(fxAccounts.device, "recentDeviceList")
    .get(() => [{ isCurrentDevice: true }, { isCurrentDevice: false }]);
  // Stub this to prevent error spam on tests trying to fetch attached clients
  sandbox.stub(gSync, "updateAllUI");
  clearDismissals();

  await SpecialPowers.pushPrefEnv({
    set: [
      ["services.sync.engine.tabs", false],
      ["services.sync.engine.history", false],
    ],
  });

  let historyView = await openHistoryView();
  let promo = await getPromo(historyView);
  ok(promo.hidden, "Promo hidden when only its engines are disabled");

  syncEnabled = false;
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  ok(!promo.hidden, "Promo shown while Sync is disabled on this installation");
  is(
    promo.shadowRoot.querySelector("moz-promo").getAttribute("data-l10n-id"),
    VARIANTS.turnonsync.heading,
    "Disabled Sync shows the turnonsync variant"
  );

  syncEnabled = true;
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  ok(promo.hidden, "Promo removed once Sync is enabled on this installation");

  await SpecialPowers.popPrefEnv();
  await gCUITestUtils.hideMainMenu();
  sandbox.restore();
  clearDismissals();
});

add_task(async function test_action_dispatch() {
  let sandbox = sinon.createSandbox();
  let signin = sandbox.stub(gSync, "openFxAEmailFirstPage");
  let turnon = sandbox.stub(gSync, "openSyncSetupForEntryPoint");
  let connect = sandbox.stub(gSync, "openConnectAnotherDevice");

  gSync.handleSyncPromoAction("signin", "entry");
  ok(signin.calledOnceWith("entry"), "signin opens the email-first page");

  gSync.handleSyncPromoAction("turnonsync", "entry");
  ok(turnon.calledOnceWith("entry"), "turnonsync opens the sync setup flow");

  gSync.handleSyncPromoAction("connectdevice", "entry");
  ok(
    connect.calledOnceWith("entry"),
    "connectdevice opens connect-another-device"
  );

  sandbox.restore();
});

add_task(async function test_menubar_action_dispatch() {
  let sandbox = sinon.createSandbox();
  let handleAction = sandbox.stub(gSync, "handleSyncPromoAction");
  let promo = document.getElementById("historyRemoteTabsPromo");
  let historyMenu = document.getElementById("history-menu");
  let placesView = historyMenu._placesView;
  historyMenu._placesView = { _onCommand() {} };
  promo.dataset.action = "signin";

  try {
    promo.dispatchEvent(new CustomEvent("command", { bubbles: true }));
    ok(
      handleAction.calledOnceWith("signin", "remote-tabs-top-menu-history"),
      "The menu-bar promo dispatches its action with the menu-bar entry point"
    );
  } finally {
    historyMenu._placesView = placesView;
    sandbox.restore();
  }
});

// The History view is also shown in a standalone panel when its widget lives on
// the toolbar, so the CTA must close whichever panel it is actually in.
add_task(async function test_cta_closes_standalone_panel() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(gSync, "getSyncPromoState").returns("signin");
  sandbox.stub(gSync, "handleSyncPromoAction");
  clearDismissals();

  CustomizableUI.addWidgetToArea(
    "history-panelmenu",
    CustomizableUI.AREA_NAVBAR
  );
  let button = document.getElementById("history-panelmenu");
  let historyView = PanelMultiView.getViewNode(document, "PanelUI-history");
  let shown = BrowserTestUtils.waitForEvent(historyView, "ViewShown");
  // Same call CustomizableUI makes for a view widget anchored in the toolbar.
  PanelUI.showSubView("PanelUI-history", button);
  await shown;

  let promo = await getPromo(historyView);
  let panel = promo.closest("panel");
  isnot(
    panel.id,
    "appMenu-popup",
    "History view is shown outside the app menu panel"
  );

  let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  synthesizeClick(promo.shadowRoot.querySelector("a[slot='support-link']"));
  await hidden;
  ok(true, "Activating the CTA closes the containing panel");

  CustomizableUI.reset();
  sandbox.restore();
  clearDismissals();
});

// Closing a window tears its document down without running
// disconnectedCallback, so the promo has to drop its observers on unload or the
// observer service keeps the whole window alive until shutdown.
add_task(async function test_observers_removed_when_window_closes() {
  let countObservers = () =>
    [...Services.obs.enumerateObservers("sync-ui-state:update")].length;
  let before = countObservers();

  let win = await BrowserTestUtils.openNewBrowserWindow();
  await new CustomizableUITestUtils(win).openMainMenu();
  let historyView = PanelMultiView.getViewNode(win.document, "PanelUI-history");
  let shown = BrowserTestUtils.waitForEvent(historyView, "ViewShown");
  win.document.getElementById("appMenu-history-button").click();
  await shown;
  let promo = historyView.querySelector("#PanelUI-history-sync-promo");
  await promo.updateComplete;
  Assert.greater(
    countObservers(),
    before,
    "The promo in the new window registered its observers"
  );

  await BrowserTestUtils.closeWindow(win);
  is(
    countObservers(),
    before,
    "Closing the window removed the promo's observers"
  );
});
