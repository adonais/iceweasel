/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_virtual_authenticator();

let expectSecurityError = expectError("Security");

async function test_webauthn_with_cert_override({
  aTestDomain,
  aExpectSecurityError = false,
  aFeltPrivacyV1 = false,
}) {
  let certOverrideService = Cc[
    "@mozilla.org/security/certoverride;1"
  ].getService(Ci.nsICertOverrideService);
  Services.prefs.setBoolPref(
    "security.certerrors.felt-privacy-v1",
    aFeltPrivacyV1
  );
  let testURL = "https://" + aTestDomain;
  let certErrorLoaded;
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, testURL);
      let browser = gBrowser.selectedBrowser;
      certErrorLoaded = BrowserTestUtils.waitForErrorPage(browser);
    },
    false
  );
  info("Waiting for cert error page.");
  await certErrorLoaded;

  let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  info("Adding certificate error override.");
  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [aFeltPrivacyV1],
    async function (aFeltPrivacyV1) {
      const doc = content.document;

      if (!aFeltPrivacyV1) {
        info("Using old cert error page flow.");
        let doc = content.document;
        let exceptionButton = doc.getElementById("exceptionDialogButton");
        exceptionButton.click();
      } else {
        info("Using felt-privacy-v1 cert error page flow.");
        const netErrorCard =
          doc.querySelector("net-error-card").wrappedJSObject;
        await netErrorCard.getUpdateComplete();
        await EventUtils.synthesizeMouseAtCenter(
          netErrorCard.advancedButton,
          {},
          content
        );
        await ContentTaskUtils.waitForCondition(() => {
          return (
            netErrorCard.exceptionButton &&
            !netErrorCard.exceptionButton.disabled
          );
        }, "Waiting for exception button");
        netErrorCard.exceptionButton.scrollIntoView();
        EventUtils.synthesizeMouseAtCenter(
          netErrorCard.exceptionButton,
          {},
          content
        );
      }
    }
  );

  info("Waiting for page load.");
  await loaded;

  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    let doc = content.document;
    ok(
      !doc.documentURI.startsWith("about:certerror"),
      "Exception has been added."
    );
  });

  if (!aFeltPrivacyV1) {
    let makeCredPromise = promiseWebAuthnMakeCredential(
      tab,
      "none",
      "preferred"
    );
    if (aExpectSecurityError) {
      await makeCredPromise.then(arrivingHereIsBad).catch(expectSecurityError);
      ok(
        true,
        "Calling navigator.credentials.create() results in a security error"
      );
    } else {
      await makeCredPromise.catch(arrivingHereIsBad);
      ok(true, "Calling navigator.credentials.create() is allowed");
    }
  }

  let getAssertionPromise = promiseWebAuthnGetAssertionDiscoverable(tab);
  if (aExpectSecurityError) {
    await getAssertionPromise
      .then(arrivingHereIsBad)
      .catch(expectSecurityError);
    ok(true, "Calling navigator.credentials.get() results in a security error");
  } else {
    await getAssertionPromise.catch(arrivingHereIsBad);
    ok(true, "Calling navigator.credentials.get() results in a security error");
  }

  certOverrideService.clearValidityOverride(aTestDomain, -1, {});

  loaded = BrowserTestUtils.waitForErrorPage(tab.linkedBrowser);
  BrowserCommands.reloadSkipCache();
  await loaded;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  Services.prefs.clearUserPref("security.certerrors.felt-privacy-v1");
}

add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "expired.example.com",
    aExpectSecurityError: false,
    aFeltPrivacyV1: false,
  })
);

add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "untrusted.example.com",
    aExpectSecurityError: true,
    aFeltPrivacyV1: false,
  })
);
add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "no-subject-alt-name.example.com",
    aExpectSecurityError: true,
    aFeltPrivacyV1: false,
  })
);

/* Testing for felt-privacy-v1 enabled reuses the same
 * webauthn certificates created in the first three tests. */
add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "expired.example.com",
    aExpectSecurityError: false,
    aFeltPrivacyV1: true,
  })
);
add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "untrusted.example.com",
    aExpectSecurityError: true,
    aFeltPrivacyV1: true,
  })
);
add_task(() =>
  test_webauthn_with_cert_override({
    aTestDomain: "no-subject-alt-name.example.com",
    aExpectSecurityError: true,
    aFeltPrivacyV1: false,
  })
);
