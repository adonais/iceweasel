/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests for the fallback behavior during error resolution.
 *
 * These tests verify four scenarios:
 * 1. A registered SSL error uses its own config via selectErrorId.
 * 2. An unregistered error falls back to the general gErrorCode config
 *    when gErrorCode is "nssFailure2".
 * 3. An unregistered error does not fall back when gErrorCode is a
 *    registered error other than "nssFailure2".
 * 4. The deniedPortAccess error shows the correct intro text.
 */

const TLS10_PAGE = "https://tls1.example.com/";

async function openErrorTab(url) {
  let browser;
  let tab;
  let pageLoaded;
  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, url);
      browser = gBrowser.selectedBrowser;
      tab = gBrowser.selectedTab;
      pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    },
    false
  );
  await pageLoaded;
  return { browser, tab };
}

// Verify that selectErrorId prefers the registered error
// (SSL_ERROR_RX_RECORD_TOO_LONG) over the nssFailure2 fallback.
add_task(async function test_registered_ssl_error() {
  info(
    "Testing that selectErrorId prefers SSL_ERROR_RX_RECORD_TOO_LONG over nssFailure2 fallback"
  );

  Services.prefs.setIntPref("security.tls.version.min", 3);
  Services.prefs.setIntPref("security.tls.version.max", 4);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("security.tls.version.min");
    Services.prefs.clearUserPref("security.tls.version.max");
  });

  const { browser, tab } = await openErrorTab(TLS10_PAGE);
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  await SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    Assert.ok(
      doc.documentURI.startsWith("about:neterror"),
      "Should be on the error page"
    );

    const netErrorCard = await ContentTaskUtils.waitForCondition(
      () => doc.querySelector("net-error-card")?.wrappedJSObject,
      "net-error-card should be present"
    );
    await netErrorCard.getUpdateComplete();

    const selectedId = netErrorCard.constructor.selectErrorId(
      "SSL_ERROR_RX_RECORD_TOO_LONG"
    );
    Assert.equal(
      selectedId,
      "SSL_ERROR_RX_RECORD_TOO_LONG",
      "Should select the registered error, not fall back to nssFailure2"
    );
  });

  BrowserTestUtils.removeTab(tab);
  Services.prefs.clearUserPref("security.tls.version.min");
  Services.prefs.clearUserPref("security.tls.version.max");
});

// Verify that selectErrorId falls back to nssFailure2 when the
// error code is not registered and gErrorCode is "nssFailure2".
add_task(async function test_fallback_to_general_nss_error() {
  info(
    "Testing fallback from unregistered NSS error to general nssFailure2 config"
  );

  Services.prefs.setIntPref("security.tls.version.min", 3);
  Services.prefs.setIntPref("security.tls.version.max", 4);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("security.tls.version.min");
    Services.prefs.clearUserPref("security.tls.version.max");
  });

  const { browser, tab } = await openErrorTab(TLS10_PAGE);
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  await SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    const netErrorCard = await ContentTaskUtils.waitForCondition(
      () => doc.querySelector("net-error-card")?.wrappedJSObject,
      "net-error-card should be present"
    );
    await netErrorCard.getUpdateComplete();

    const selectedId = netErrorCard.constructor.selectErrorId(
      "SSL_ERROR_UNREGISTERED_FAKE_ERROR"
    );
    Assert.equal(
      selectedId,
      "nssFailure2",
      "Should fall back to nssFailure2 for unregistered error codes"
    );
  });

  BrowserTestUtils.removeTab(tab);
  Services.prefs.clearUserPref("security.tls.version.min");
  Services.prefs.clearUserPref("security.tls.version.max");
});

add_task(async function test_no_fallback_for_non_nssFailure2_gErrorCode() {
  info(
    "Testing that an unregistered errorCodeString that's not nssFailure2 does not trigger the fallback"
  );
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.security.https_first", false],
      ["network.security.ports.banned.override", ""],
    ],
  });
  registerCleanupFunction(() => SpecialPowers.popPrefEnv());

  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const { browser, tab } = await openErrorTab("http://example.com:25");
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  await SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    const netErrorCard = await ContentTaskUtils.waitForCondition(
      () => doc.querySelector("net-error-card")?.wrappedJSObject,
      "net-error-card should be present for deniedPortAccess"
    );
    await netErrorCard.getUpdateComplete();

    const selectedId =
      netErrorCard.constructor.selectErrorId("UNREGISTERED_ERROR");
    Assert.equal(
      selectedId,
      null,
      "selectErrorId should return null when errorCodeString is unregistered and gErrorCode is not nssFailure2"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_denied_port_access_intro_text() {
  info("Testing deniedPortAccess shows correct intro text with felt privacy");
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.security.https_first", false],
      ["network.security.ports.banned.override", ""],
    ],
  });
  registerCleanupFunction(() => SpecialPowers.popPrefEnv());

  // Port 25 (SMTP) is on Firefox's blocked port list.
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const { browser, tab } = await openErrorTab("http://example.com:25");
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  await SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    Assert.ok(
      doc.documentURI.startsWith("about:neterror"),
      "Should be on the error page"
    );
    Assert.ok(
      doc.documentURI.includes("deniedPortAccess"),
      "Error code should be deniedPortAccess"
    );

    const netErrorCard = await ContentTaskUtils.waitForCondition(
      () => doc.querySelector("net-error-card")?.wrappedJSObject,
      "net-error-card should be present for deniedPortAccess"
    );
    await netErrorCard.getUpdateComplete();

    const introEl = netErrorCard.errorIntro;
    Assert.ok(introEl, "Intro element should exist");
    Assert.equal(
      introEl.dataset.l10nId,
      "fp-neterror-denied-port-access",
      "Should show the denied port access intro, not the offline intro"
    );
  });

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
