/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const TEST_URL = TEST_PATH + "a_referrerpolicy.html";
const TARGET_URL = "https://example.com/dummy";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mathml.a.element.enabled", true],
      ["dom.event.contextmenu.enabled", true],
    ],
  });
});

async function testContextMenuReferrer(selector, expectedReferrer) {
  info(`Testing context menu referrer for selector: ${selector}`);

  let contextMenu = document.getElementById("contentAreaContextMenu");
  let popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  await BrowserTestUtils.synthesizeMouse(
    selector,
    0,
    0,
    { type: "contextmenu", button: 2, centered: true },
    gBrowser.selectedBrowser
  );
  await popupShown;

  let popupHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  let openInTabItem = contextMenu.querySelector("#context-openlinkintab");

  let referrerPromise = TestUtils.topicObserved(
    "http-on-opening-request",
    subject =>
      subject.QueryInterface(Ci.nsIHttpChannel).URI.spec.startsWith(TARGET_URL)
  ).then(([subject]) => {
    let channel = subject.QueryInterface(Ci.nsIHttpChannel);
    try {
      return channel.getRequestHeader("Referer");
    } catch (e) {
      if (e.result == Cr.NS_ERROR_NOT_AVAILABLE) {
        return "";
      }
      throw e;
    }
  });

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, false);

  contextMenu.activateItem(openInTabItem);
  await popupHidden;

  let [actualReferrer, newTab] = await Promise.all([
    referrerPromise,
    newTabPromise,
  ]);

  is(
    actualReferrer,
    expectedReferrer,
    `Referer header for ${selector} matches expected policy`
  );

  BrowserTestUtils.removeTab(newTab);
}

add_task(async function test_mathml_a_referrerpolicy_contextmenu() {
  let testTab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);

  try {
    await testContextMenuReferrer("#mathml-a-noreferrer", "");
    await testContextMenuReferrer("#mathml-a-unsafe-url", TEST_URL);
  } finally {
    BrowserTestUtils.removeTab(testTab);
  }
});
