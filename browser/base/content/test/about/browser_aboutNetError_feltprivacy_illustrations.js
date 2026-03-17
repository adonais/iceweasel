/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SERVER_ERROR_PAGE =
  "https://example.com/browser/browser/base/content/test/about/server_error.sjs";

add_setup(async function () {
  await setSecurityCertErrorsFeltPrivacyToTrue();
});

add_task(async function test_noConnection_illustration() {
  let browser, tab;
  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(
        gBrowser,
        SERVER_ERROR_PAGE
      );
      browser = gBrowser.selectedBrowser;
      tab = gBrowser.selectedTab;
    },
    false
  );
  await BrowserTestUtils.waitForErrorPage(browser);

  await SpecialPowers.spawn(browser, [], async () => {
    const netErrorCard = content.document.querySelector("net-error-card");
    await netErrorCard.wrappedJSObject.getUpdateComplete();
    const img = netErrorCard.shadowRoot.querySelector("img");
    Assert.ok(img, "illustration img element exists");
    Assert.equal(
      img.getAttribute("src"),
      "chrome://global/skin/illustrations/no-connection.svg",
      "noConnection illustration src is correct"
    );
    Assert.equal(
      img.getAttribute("data-l10n-id"),
      "fp-neterror-illustration-alt",
      "noConnection illustration data-l10n-id is correct"
    );
    Assert.equal(
      img.getAttribute("data-l10n-attrs"),
      "alt",
      "data-l10n-attrs is set to 'alt'"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_securityError_illustration() {
  const tab = await openErrorPage("https://expired.example.com/");
  const browser = tab.linkedBrowser;

  await SpecialPowers.spawn(browser, [], async () => {
    const netErrorCard = content.document.querySelector("net-error-card");
    await netErrorCard.wrappedJSObject.getUpdateComplete();
    const img = netErrorCard.shadowRoot.querySelector("img");
    Assert.ok(img, "illustration img element exists");
    Assert.equal(
      img.getAttribute("src"),
      "chrome://global/skin/illustrations/security-error.svg",
      "securityError illustration src is correct"
    );
    Assert.equal(
      img.getAttribute("data-l10n-id"),
      "fp-certerror-illustration-alt",
      "securityError illustration data-l10n-id is correct"
    );
    Assert.equal(
      img.getAttribute("data-l10n-attrs"),
      "alt",
      "data-l10n-attrs is set to 'alt'"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
