/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

const ENTRY_POINT = "bookmarks-app-menu";
const IMAGE = "chrome://browser/skin/fxa/sync-promo-bookmarks.svg";
const VARIANTS = {
  signin: {
    heading: "appmenu-sync-promo-signin",
    cta: "appmenu-sync-promo-signin-cta",
    pref: "browser.promo.syncPromo.bookmarks.signin.dismissed",
  },
  turnonsync: {
    heading: "appmenu-bookmarks-sync-promo-turnonsync",
    cta: "appmenu-sync-promo-turnonsync-cta",
    pref: "browser.promo.syncPromo.bookmarks.turnonsync.dismissed",
  },
  connectdevice: {
    heading: "appmenu-bookmarks-sync-promo-connectdevice",
    cta: "appmenu-sync-promo-connectdevice-cta",
    pref: "browser.promo.syncPromo.bookmarks.connectdevice.dismissed",
  },
};

function synthesizeClick(el) {
  el.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(el, {}, el.ownerGlobal);
}

async function openBookmarksView() {
  await gCUITestUtils.openMainMenu();
  let bookmarksView = PanelMultiView.getViewNode(document, "PanelUI-bookmarks");
  synthesizeClick(document.getElementById("appMenu-bookmarks-button"));
  await BrowserTestUtils.waitForEvent(bookmarksView, "ViewShown");
  return bookmarksView;
}

async function getPromo(bookmarksView) {
  let promo = bookmarksView.querySelector("#PanelUI-bookmarks-sync-promo");
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

    let bookmarksView = await openBookmarksView();
    let promo = await getPromo(bookmarksView);
    let manageBookmarks = bookmarksView.querySelector(
      "#panelMenu_showAllBookmarks"
    );
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
      manageBookmarks.nextElementSibling,
      promo,
      `${state}: promo is below Manage bookmarks`
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
      IMAGE,
      `${state}: every variant shares the bookmarks illustration`
    );

    handleAction.resetHistory();
    // The CTA closes the containing panel.
    let popupHidden = BrowserTestUtils.waitForEvent(
      document.getElementById("appMenu-popup"),
      "popuphidden"
    );
    cta.click();
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
  let bookmarksView = await openBookmarksView();
  let promo = await getPromo(bookmarksView);
  let mozPromo = promo.shadowRoot.querySelector("moz-promo");
  synthesizeClick(mozPromo.closeButton);
  await promo.updateComplete;

  ok(promo.hidden, "Dismissing hides the promo");
  ok(
    Services.prefs.getBoolPref(VARIANTS.signin.pref, false),
    "Dismissal is persisted for the signin variant"
  );
  is(
    document.getElementById("appMenu-popup").state,
    "open",
    "Dismissing the promo leaves the panel open"
  );
  await gCUITestUtils.hideMainMenu();

  bookmarksView = await openBookmarksView();
  promo = await getPromo(bookmarksView);
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
  let bookmarksView = await openBookmarksView();
  let promo = await getPromo(bookmarksView);
  ok(!promo.hidden, "Promo shown for eligible user");

  promoState.returns("turnonsync");
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  is(
    promo.shadowRoot.querySelector("moz-promo").getAttribute("data-l10n-id"),
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

add_task(async function test_sync_eligibility_ignores_engine() {
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
    set: [["services.sync.engine.bookmarks", false]],
  });

  let bookmarksView = await openBookmarksView();
  let promo = await getPromo(bookmarksView);
  ok(promo.hidden, "Promo hidden when only Bookmarks syncing is disabled");

  syncEnabled = false;
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  ok(!promo.hidden, "Promo shown while Sync is disabled");
  is(
    promo.shadowRoot.querySelector("moz-promo").getAttribute("data-l10n-id"),
    VARIANTS.turnonsync.heading,
    "Disabled Sync shows the turnonsync variant"
  );

  syncEnabled = true;
  Services.obs.notifyObservers(null, "sync-ui-state:update");
  await promo.updateComplete;
  ok(promo.hidden, "Promo removed once Sync is enabled");

  await SpecialPowers.popPrefEnv();
  await gCUITestUtils.hideMainMenu();
  sandbox.restore();
  clearDismissals();
});

add_task(async function test_menubar_action_dispatch() {
  let sandbox = sinon.createSandbox();
  let handleAction = sandbox.stub(gSync, "handleSyncPromoAction");
  let promo = document.getElementById("bookmarksRemoteTabsPromo");
  promo.dataset.action = "signin";

  try {
    promo.dispatchEvent(new CustomEvent("command", { bubbles: true }));
    ok(
      handleAction.calledOnceWith("signin", "bookmarks-top-menu"),
      "The menu-bar promo dispatches its action with the menu-bar entry point"
    );
  } finally {
    delete promo.dataset.action;
    sandbox.restore();
  }
});
