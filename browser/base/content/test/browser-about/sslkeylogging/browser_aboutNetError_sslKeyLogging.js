/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// SSLKEYLOGFILE is set by the harness for this manifest only, see browser.toml.

// A host that should reliably fail to connect and produce about:neterror.
const UNREACHABLE_URL = "https://example.invalid.test/";

add_task(async function warning_shown_when_sslkeylogfile_set() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const browser = tab.linkedBrowser;

  try {
    const pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    BrowserTestUtils.startLoadingURIString(browser, UNREACHABLE_URL);
    await pageLoaded;

    const result = await SpecialPowers.spawn(browser, [], async () => {
      const doc = content.document;
      ok(
        doc.documentURI.startsWith("about:neterror"),
        "Should be showing about:neterror"
      );

      const warning = doc.getElementById("sslKeyLoggingWarning");
      if (!warning) {
        return { present: false, visible: false };
      }

      const supportLink = warning.shadowRoot.querySelector(
        "a[is='moz-support-link']"
      );

      return {
        present: true,
        visible: ContentTaskUtils.isVisible(warning),
        l10nId: warning.getAttribute("data-l10n-id"),
        hasSupportLink: !!supportLink,
        supportPage: supportLink?.getAttribute("support-page"),
      };
    });

    ok(result.present, "SSLKEYLOGFILE warning is present in the DOM");
    ok(result.visible, "SSLKEYLOGFILE warning is visible to the user");
    is(
      result.l10nId,
      "neterror-sslkeylogging-warning",
      "Warning has the expected localized title"
    );
    ok(result.hasSupportLink, "Warning has a Learn more link");
    is(
      result.supportPage,
      "sslkeylogfile-warning",
      "Support link points to the correct page"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});
