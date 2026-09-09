/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_smartwindow_promo_page.html";

/**
 * Opens the promo test page and waits for the custom element to be defined
 *
 * @param {string} pageUrl - The URL of the page to load
 * @returns {Promise<object>} - Object containing the tab and its browser
 */
async function openTestPage(pageUrl) {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, pageUrl);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.customElements.whenDefined("smartwindow-promo");
  });
  return { tab, browser: tab.linkedBrowser };
}

/**
 * Sets the resolved 'message' property on the promo element
 *
 * @param {Browser} browser - The browser element hosting the promo
 * @param {object} message - Resolved promo content
 * @returns {Promise<void>}
 */
async function setPromoMessage(browser, message) {
  await SpecialPowers.spawn(browser, [message], async msg => {
    const promo = content.document.getElementById("test-promo");
    promo.message = msg;
    await promo.updateComplete;

    await new Promise(resolve =>
      content.requestAnimationFrame(() =>
        content.requestAnimationFrame(resolve)
      )
    );
  });
}

add_task(async function test_dismiss_button_hidden_by_default() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setPromoMessage(browser, {
    heading: "Heading",
    message: "Body",
    secondaryActionText: "Not now",
    primaryActionText: "Try it",
  });

  await SpecialPowers.spawn(browser, [], async () => {
    const promo = content.document.getElementById("test-promo");
    const mozPromo = promo.shadowRoot.querySelector("moz-promo");
    await mozPromo.updateComplete;
    const closeButton = mozPromo.shadowRoot.querySelector("moz-button.close");
    Assert.ok(
      !closeButton,
      "moz-promo close (X) button is absent when dismissable is not set"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_dismiss_button_fires_dismiss_event() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setPromoMessage(browser, {
    heading: "Heading",
    message: "Body",
    secondaryActionText: "Not now",
    primaryActionText: "Try it",
    dismissable: true,
  });

  await SpecialPowers.spawn(browser, [], async () => {
    const promo = content.document.getElementById("test-promo");
    const mozPromo = promo.shadowRoot.querySelector("moz-promo");
    await mozPromo.updateComplete;
    const closeButton = mozPromo.shadowRoot.querySelector("moz-button.close");
    Assert.ok(
      closeButton,
      "moz-promo close (X) button is present when dismissable is true"
    );
    await closeButton.updateComplete;

    let dismissEvent = null;
    let closeEvent = null;
    promo.addEventListener(
      "SmartWindowPromo:Dismiss",
      e => (dismissEvent = e),
      { once: true }
    );
    promo.addEventListener("SmartWindowPromo:Close", e => (closeEvent = e), {
      once: true,
    });

    closeButton.click();

    Assert.ok(
      dismissEvent,
      "Clicking the X should fire SmartWindowPromo:Dismiss"
    );
    Assert.ok(
      !closeEvent,
      "Clicking the X should not fire SmartWindowPromo:Close"
    );
    Assert.ok(mozPromo.isConnected, "moz-promo stays mounted");
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_secondary_button_fires_close_event() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setPromoMessage(browser, {
    heading: "Heading",
    message: "Body",
    secondaryActionText: "Not now",
    primaryActionText: "Try it",
    dismissable: true,
  });

  await SpecialPowers.spawn(browser, [], async () => {
    const promo = content.document.getElementById("test-promo");
    const secondaryButton = promo.shadowRoot.querySelector(
      'moz-button[slot="actions"][type="ghost"]'
    );
    Assert.ok(secondaryButton, "Not now button should be present");
    await secondaryButton.updateComplete;

    let dismissEvent = null;
    let closeEvent = null;
    promo.addEventListener(
      "SmartWindowPromo:Dismiss",
      e => (dismissEvent = e),
      { once: true }
    );
    promo.addEventListener("SmartWindowPromo:Close", e => (closeEvent = e), {
      once: true,
    });

    secondaryButton.click();

    Assert.ok(
      closeEvent,
      "Clicking the secondary button should fire SmartWindowPromo:Close"
    );
    Assert.ok(
      !dismissEvent,
      "Clicking the secondary button should not fire SmartWindowPromo:Dismiss"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
