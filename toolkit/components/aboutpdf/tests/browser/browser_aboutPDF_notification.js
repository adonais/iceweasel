/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const IMPRESSION_COUNT_PREF = "pdfjs.featuresNotificationImpressionCount";
const { PdfJsFeaturesNotification } = ChromeUtils.importESModule(
  "resource://pdf.js/PdfJsFeaturesNotification.sys.mjs"
);

registerCleanupFunction(() => {
  resetPdfNotificationPrefs();
});

add_task(async function testNotificationShownByDefault() {
  resetPdfNotificationPrefs();

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const notification = content.document.getElementById("pdf-notification");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden,
      "notification is shown by default"
    );
    is(notification.localName, "moz-message-bar", "the shared bar is used");

    const message = notification.querySelector("[slot=message]");
    const cta = notification.querySelector("a");
    // Inspect the rendered DOM without waiving Xrays.
    const closeButton = () =>
      notification.shadowRoot
        ?.querySelector("moz-button.close")
        ?.shadowRoot?.querySelector("button");
    await ContentTaskUtils.waitForCondition(
      () =>
        notification.getAttribute("heading") &&
        notification.getAttribute("aria-label") &&
        cta.textContent.trim() &&
        closeButton()?.title,
      "notification content and accessible names are localized"
    );
    is(notification.getAttribute("role"), "region", "bar is a named region");
    is(
      notification.getAttribute("aria-live"),
      "polite",
      "bar is a polite live region"
    );
    is(
      message.dataset.l10nId,
      "pdf-features-notification-message",
      "message has one localization identifier"
    );
    is(
      cta.dataset.l10nName,
      "features-link",
      "CTA is the named localization element of the message"
    );
    ok(!cta.hasAttribute("data-l10n-id"), "CTA has no separate localization");
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testNotificationContrastStyles() {
  resetPdfNotificationPrefs();
  await SpecialPowers.pushPrefEnv({
    set: [["ui.useAccessibilityTheme", 1]],
  });

  const tab = await openAboutPDF();
  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      const notification = content.document.getElementById("pdf-notification");
      await ContentTaskUtils.waitForCondition(
        () => !notification.hidden,
        "notification is shown"
      );
      ok(
        content.matchMedia("(prefers-contrast)").matches,
        "the accessibility theme enables increased contrast"
      );
      // Wait for the shadow-root stylesheet to apply.
      const style = content.getComputedStyle(notification);
      await ContentTaskUtils.waitForCondition(
        () => parseFloat(style.borderBottomWidth) > 0,
        "the bar keeps a bottom boundary"
      );
      isnot(
        style.borderBottomColor,
        "rgba(0, 0, 0, 0)",
        "the bar boundary is not transparent"
      );
    });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
    resetPdfNotificationPrefs();
  }
});

add_task(async function testCtaTargetsFeaturesAndMovesFocus() {
  resetPdfNotificationPrefs();

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    const notification = doc.getElementById("pdf-notification");
    const cta = notification.querySelector("a");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden && cta.textContent.trim(),
      "notification CTA is ready"
    );

    const heading = doc.getElementById("features-heading");
    is(heading.localName, "h1", "features target is a semantic heading");
    is(cta.href, "about:pdf#features", "CTA has a real destination");
    cta.focus();
    ContentTaskUtils.getEventUtils(content).synthesizeKey(
      "KEY_Enter",
      {},
      content
    );
    await ContentTaskUtils.waitForCondition(
      () => content.location.hash === "#features",
      "CTA navigates to the features target"
    );
    ok(
      doc.getElementById("features-view").checkVisibility(),
      "the features view is shown"
    );
    is(doc.activeElement, heading, "focus moves to the features content");
    ok(
      !notification.isConnected,
      "the notification is dropped in the features view"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testNotificationStaysVisibleWhileScrolling() {
  resetPdfNotificationPrefs();

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    const notification = doc.getElementById("pdf-notification");
    const scrollContainer = doc.getElementById("scroll-container");
    const container = doc.getElementById("container");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden,
      "notification is shown"
    );

    container.replaceChildren();
    await new Promise(resolve => content.requestAnimationFrame(resolve));

    is(
      doc.scrollingElement.scrollHeight,
      doc.scrollingElement.clientHeight,
      "notification does not add document overflow when content fits"
    );
    is(
      scrollContainer.getBoundingClientRect().top,
      notification.getBoundingClientRect().bottom,
      "content scrollbar starts below the notification"
    );

    container.style.minHeight = "200vh";
    await ContentTaskUtils.waitForCondition(
      () => scrollContainer.scrollHeight > scrollContainer.clientHeight,
      "page has enough content to scroll"
    );

    const notificationTop = notification.getBoundingClientRect().top;
    scrollContainer.scrollTop = 100;
    await ContentTaskUtils.waitForCondition(
      () => scrollContainer.scrollTop === 100,
      "page scrolled"
    );
    is(
      notification.getBoundingClientRect().top,
      notificationTop,
      "notification stays at the top while the page scrolls"
    );
  });
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testNotificationDroppedWhenDismissed() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [IMPRESSION_COUNT_PREF, PdfJsFeaturesNotification.impressionLimit + 1],
    ],
  });

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const notification = content.document.getElementById("pdf-notification");
    await ContentTaskUtils.waitForCondition(
      () => !notification?.isConnected,
      "notification is dropped once it was dismissed"
    );
    ok(
      !content.document.getElementById("pdf-notification"),
      "the notification is gone from the page once it was dismissed"
    );
  });
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testObserverRegistrationRechecksDismissalPref() {
  resetPdfNotificationPrefs();

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const notification = content.document.getElementById("pdf-notification");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden,
      "notification is initially shown"
    );
  });

  const actor =
    tab.linkedBrowser.browsingContext.currentWindowGlobal.getActor("AboutPDF");
  actor.didDestroy();
  PdfJsFeaturesNotification.consume();

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    const notification = content.document.getElementById("pdf-notification");
    ok(
      !notification.hidden,
      "preference change is missed while the observer is unregistered"
    );
  });

  actor.receiveMessage({ name: "AboutPDF:ObserveNotificationPref" });
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => !content.document.getElementById("pdf-notification"),
      "registration rechecks the preference and drops the notification"
    );
  });

  BrowserTestUtils.removeTab(tab);
  resetPdfNotificationPrefs();
});

add_task(async function testImpressionCapStopsTheNotification() {
  resetPdfNotificationPrefs();

  const cap = PdfJsFeaturesNotification.impressionLimit;
  for (let impression = 1; impression <= cap; impression++) {
    const tab = await openAboutPDF();
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      const notification = content.document.getElementById("pdf-notification");
      await ContentTaskUtils.waitForCondition(
        () => !notification.hidden,
        "notification is shown while the impression budget lasts"
      );
    });
    BrowserTestUtils.removeTab(tab);
    is(
      Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
      impression,
      "showing the notification spends exactly one impression"
    );
  }

  const tab = await openAboutPDF();
  is(
    getAboutPDFActor(tab).receiveMessage({
      name: "AboutPDF:NotificationEligible",
    }),
    false,
    "the parent refuses to show the notification past the cap"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    await doc.l10n.ready;
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    ok(
      !doc.getElementById("pdf-notification"),
      "notification is not left in the page once the cap is reached"
    );
  });
  BrowserTestUtils.removeTab(tab);
  is(
    Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
    cap,
    "a capped load does not spend another impression"
  );

  resetPdfNotificationPrefs();
});

add_task(async function testImpressionLimitOfZeroTurnsTheNotificationOff() {
  resetPdfNotificationPrefs();
  await SpecialPowers.pushPrefEnv({
    set: [[PdfJsFeaturesNotification.IMPRESSION_LIMIT_PREF, 0]],
  });

  const tab = await openAboutPDF();
  is(
    getAboutPDFActor(tab).receiveMessage({
      name: "AboutPDF:NotificationEligible",
    }),
    false,
    "a zero impression limit refuses the notification"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const doc = content.document;
    await doc.l10n.ready;
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    ok(
      !doc.getElementById("pdf-notification"),
      "notification is not left in the page when the limit is zero"
    );
  });
  BrowserTestUtils.removeTab(tab);
  is(
    Services.prefs.getIntPref(IMPRESSION_COUNT_PREF, 0),
    0,
    "no impression is spent when the limit is zero"
  );

  await SpecialPowers.popPrefEnv();
  resetPdfNotificationPrefs();
});

add_task(async function testCloseButtonDismissesAndPersists() {
  resetPdfNotificationPrefs();

  const tab = await openAboutPDF();
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    const notification = content.document.getElementById("pdf-notification");
    const closeButton = () =>
      notification.shadowRoot?.querySelector("moz-button.close");
    await ContentTaskUtils.waitForCondition(
      () => !notification.hidden && closeButton(),
      "notification shown before dismissing"
    );

    const close = closeButton();
    close.focus();
    is(notification.shadowRoot.activeElement, close, "close button is focused");
    ContentTaskUtils.getEventUtils(content).synthesizeKey(
      "KEY_Enter",
      {},
      content
    );
    await ContentTaskUtils.waitForCondition(
      () => !notification.isConnected,
      "notification dropped after keyboard activation"
    );
    is(
      content.document.activeElement,
      content.document.getElementById("browse-files"),
      "focus moves to the next control"
    );
  });

  await TestUtils.waitForCondition(
    () => PdfJsFeaturesNotification.isConsumed(),
    "dismissal spent the shared budget, so both surfaces stop promoting"
  );

  BrowserTestUtils.removeTab(tab);
  resetPdfNotificationPrefs();
});
