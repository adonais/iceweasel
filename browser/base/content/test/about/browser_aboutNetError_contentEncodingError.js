/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_contentEncodingError_error_page_elements() {
  const url =
    "about:neterror?e=contentEncodingError&u=http%3A%2F%2Fexample.com%2F";
  let browser, tab;
  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
      browser = gBrowser.selectedBrowser;
      tab = gBrowser.selectedTab;
    },
    false
  );
  const pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
  SpecialPowers.spawn(browser, [url], errorUrl => {
    content.location = errorUrl;
  });
  await pageLoaded;

  await SpecialPowers.spawn(browser, [], async function () {
    await ContentTaskUtils.waitForCondition(
      () => content?.document?.querySelector("net-error-card"),
      "Wait for net-error-card to render"
    );
    const doc = content.document;
    const netErrorCard = doc.querySelector("net-error-card").wrappedJSObject;
    await netErrorCard.getUpdateComplete();

    Assert.equal(
      netErrorCard.errorTitle.dataset.l10nId,
      "contentEncodingError-title",
      "Using the contentEncodingError title"
    );
    Assert.equal(
      netErrorCard.errorIntro.dataset.l10nId,
      "fp-neterror-content-encoding-intro",
      "Using the contentEncodingError intro"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
});
