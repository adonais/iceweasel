/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PROMO_DISMISSED_PREF = "browser.aboutpdf.promo.dismissed";
const { PdfJsFeaturesNotification } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsFeaturesNotification.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(PROMO_DISMISSED_PREF);
  resetPdfNotificationPrefs();
});

add_task(async function test_features_view_shown_at_hash() {
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const mainView = content.document.getElementById("main-view");
    const featuresView = content.document.getElementById("features-view");
    const back = content.document.getElementById("features-back");
    ok(featuresView.checkVisibility(), "features view is shown at #features");
    ok(!mainView.checkVisibility(), "main view is hidden at #features");
    ok(back.checkVisibility(), "Back button is shown at #features");
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_main_view_by_default() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const mainView = content.document.getElementById("main-view");
    const featuresView = content.document.getElementById("features-view");
    const back = content.document.getElementById("features-back");
    ok(mainView.checkVisibility(), "main view is shown by default");
    ok(!featuresView.checkVisibility(), "features view is hidden by default");
    ok(!back.checkVisibility(), "Back button is hidden by default");
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_features_cta_opens_features_view() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const cta = content.document.getElementById("features-cta");
    ok(cta.checkVisibility(), "the features call to action is shown");
    await ContentTaskUtils.waitForCondition(
      () => cta.getAttribute("label"),
      "the call to action is localized"
    );
  });
  await clickInAboutPDF(tab, "#features-cta");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const mainView = content.document.getElementById("main-view");
    const featuresView = content.document.getElementById("features-view");
    await ContentTaskUtils.waitForCondition(
      () => featuresView.checkVisibility() && !mainView.checkVisibility(),
      "the call to action swaps to the features view"
    );
    is(content.location.hash, "#features", "the call to action sets the hash");
  });
  BrowserTestUtils.removeTab(tab);
});

// With no previous history entry, Back switches views in place.
add_task(async function test_back_returns_to_main_view() {
  const tab = await openAboutPDF("#features");
  ok(!tab.linkedBrowser.canGoBack, "nothing to go back to in a new tab");
  await clickInAboutPDF(tab, "#features-back");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const mainView = content.document.getElementById("main-view");
    const featuresView = content.document.getElementById("features-view");
    await ContentTaskUtils.waitForCondition(
      () => mainView.checkVisibility() && !featuresView.checkVisibility(),
      "Back returns to the main view"
    );
    is(content.location.hash, "", "Back clears the #features fragment");
  });
  ok(!tab.linkedBrowser.canGoBack, "the in-place fallback adds no history");
  BrowserTestUtils.removeTab(tab);
});

// Back returns to the previous history entry without adding one.
add_task(async function test_back_walks_session_history() {
  const tab = await openAboutPDF();
  const browser = tab.linkedBrowser;
  await SpecialPowers.spawn(browser, [], async () => {
    content.location.hash = "features";
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("features-view").checkVisibility(),
      "features view is shown"
    );
  });
  ok(browser.canGoBack, "entering the features view is a navigation");

  const backNavigated = BrowserTestUtils.waitForLocationChange(
    gBrowser,
    "about:pdf"
  );
  await clickInAboutPDF(tab, "#features-back");
  await backNavigated;
  is(browser.currentURI.spec, "about:pdf", "Back drops the #features fragment");
  ok(browser.canGoForward, "Back went back in session history");
  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("main-view").checkVisibility(),
      "main view is shown again"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_all_features_localized() {
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const intro = content.document.getElementById("features-intro");
    ok(intro.checkVisibility(), "the intro is shown below the heading");
    const grid = content.document.getElementById("feature-grid");
    is(grid.localName, "ul", "the feature grid is a list");
    const features = grid.querySelectorAll(":scope > .feature");
    ok(features.length, "the grid has features");
    ok(
      [...features].every(feature => feature.localName === "li"),
      "each feature is a list item"
    );
    const headings = content.document.querySelectorAll(
      "#feature-grid .feature-text h2"
    );
    const descriptions = content.document.querySelectorAll(
      "#feature-grid .feature-text p"
    );
    is(headings.length, features.length, "every feature has a heading");
    is(descriptions.length, features.length, "every feature has a description");
    await ContentTaskUtils.waitForCondition(
      () =>
        intro.textContent.trim() &&
        [...headings].every(h => h.textContent.trim()),
      "the intro and the feature headings are localized"
    );
    for (const p of descriptions) {
      ok(p.textContent.trim(), "feature description is localized");
    }
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_features_contrast_styles() {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.useAccessibilityTheme", 1]],
  });
  const tab = await openAboutPDF("#features");
  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
      ok(
        content.matchMedia("(prefers-contrast)").matches,
        "the accessibility theme enables increased contrast"
      );

      const cardStyle = content.getComputedStyle(
        content.document.getElementById("feature-card")
      );
      const iconStyle = content.getComputedStyle(
        content.document.querySelector(".feature-icon")
      );
      is(cardStyle.borderTopStyle, "solid", "the card gains a border");
      Assert.greater(
        parseFloat(cardStyle.borderTopWidth),
        0,
        "the contrast border is visible"
      );
      isnot(
        cardStyle.borderTopColor,
        "rgba(0, 0, 0, 0)",
        "the contrast border is not transparent"
      );

      // Check icon borders when forced colors are active.
      if (content.matchMedia("(forced-colors: active)").matches) {
        is(iconStyle.borderTopStyle, "solid", "HCM outlines each icon");
        isnot(
          iconStyle.borderTopColor,
          "rgba(0, 0, 0, 0)",
          "the HCM icon border is not transparent"
        );
      }
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_arrow_icons_flip_in_rtl() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    const icon = id => doc.getElementById(id).shadowRoot?.querySelector("img");
    // The RTL override replaces the image through the content property.
    const iconUrl = id => content.getComputedStyle(icon(id)).content;
    await ContentTaskUtils.waitForCondition(
      () => icon("features-cta") && icon("features-back"),
      "the arrow icons are rendered"
    );
    Assert.stringContains(
      icon("features-cta").src,
      "shaft-arrow-right.svg",
      "the call to action points forward in LTR"
    );
    Assert.stringContains(
      icon("features-back").src,
      "arrow-left.svg",
      "Back points backward in LTR"
    );
    is(iconUrl("features-cta"), "normal", "no override applies in LTR");

    doc.documentElement.dir = "rtl";
    await ContentTaskUtils.waitForCondition(
      () => iconUrl("features-cta").includes("shaft-arrow-left.svg"),
      "the call to action points forward in RTL"
    );
    Assert.stringContains(
      iconUrl("features-back"),
      "arrow-right.svg",
      "Back points backward in RTL"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_promo_shown_and_dismissable_in_features_view() {
  Services.prefs.clearUserPref(PROMO_DISMISSED_PREF);
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const promo = content.document.getElementById("promo");
    const featuresView = content.document.getElementById("features-view");
    ok(featuresView.checkVisibility(), "features view is shown");
    // Decouple this test from the default-handler state.
    promo.hidden = false;
    ok(promo.checkVisibility(), "promo is visible in the features view");
  });
  await clickInAboutPDF(tab, "#dismiss-promo");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("promo").hidden,
      "promo is hidden after dismiss in the features view"
    );
  });
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(PROMO_DISMISSED_PREF, false) === true,
    "dismissed pref persisted from the features view"
  );
  BrowserTestUtils.removeTab(tab);
  Services.prefs.clearUserPref(PROMO_DISMISSED_PREF);
});

add_task(async function test_back_button_keyboard_activation() {
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const back = content.document.getElementById("features-back");
    back.focus();
    is(content.document.activeElement, back, "Back button is focused");
  });
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, tab.linkedBrowser);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const mainView = content.document.getElementById("main-view");
    await ContentTaskUtils.waitForCondition(
      () => mainView.checkVisibility(),
      "Enter on the Back button returns to the main view"
    );
    is(content.location.hash, "", "keyboard activation clears the fragment");
    is(
      content.document.activeElement.id,
      "main-heading",
      "focus returns to the main heading after Back"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_hashchange_moves_focus_to_features_heading() {
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    content.location.hash = "features";
    await ContentTaskUtils.waitForCondition(
      () => content.document.activeElement.id === "features-heading",
      "hashchange moves focus to the features heading"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_notification_consumed_by_features_view() {
  resetPdfNotificationPrefs();
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    ok(
      !content.document.getElementById("pdf-notification"),
      "notification is not in the page at #features"
    );
  });
  // Leaving the promoted view must not restore the notification.
  await clickInAboutPDF(tab, "#features-back");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("main-view").checkVisibility(),
      "Back returns to the main view"
    );
    ok(
      !content.document.getElementById("pdf-notification"),
      "the notification does not come back once consumed"
    );
  });
  await TestUtils.waitForCondition(
    () => PdfJsFeaturesNotification.isConsumed(),
    "reaching the features view spends the notification budget"
  );
  BrowserTestUtils.removeTab(tab);
  resetPdfNotificationPrefs();
});

add_task(async function test_notification_dropped_on_hash_change() {
  resetPdfNotificationPrefs();
  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const notification = content.document.getElementById("pdf-notification");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden,
      "notification starts visible on the main view"
    );
    content.location.hash = "features";
    await ContentTaskUtils.waitForCondition(
      () => !notification.isConnected,
      "notification is dropped when the features view opens"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_dismissed_notification_stays_gone_after_back() {
  PdfJsFeaturesNotification.consume();
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
  });
  await clickInAboutPDF(tab, "#features-back");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.getElementById("main-view").checkVisibility(),
      "Back returns to the main view"
    );
    ok(
      !content.document.getElementById("pdf-notification"),
      "a dismissed notification stays out of the page"
    );
  });
  BrowserTestUtils.removeTab(tab);
  resetPdfNotificationPrefs();
});

add_task(async function test_deep_link_does_not_steal_focus() {
  const tab = await openAboutPDF("#features");
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.document.l10n.ready;
    const featuresHeading = content.document.getElementById("features-heading");
    isnot(
      content.document.activeElement,
      featuresHeading,
      "a direct #features load does not steal focus to the heading"
    );
  });
  BrowserTestUtils.removeTab(tab);
});
