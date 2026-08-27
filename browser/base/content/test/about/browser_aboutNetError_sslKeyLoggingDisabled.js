/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// SSLKEYLOGFILE is unset for this manifest. The counterpart test with the
// variable set lives in sslkeylogging/browser.toml, which runs in its own
// browser instance.

// A host that should reliably fail to connect and produce about:neterror.
const UNREACHABLE_URL = "https://example.invalid.test/";

add_task(async function warning_hidden_when_sslkeylogfile_unset() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const browser = tab.linkedBrowser;

  try {
    const pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    BrowserTestUtils.startLoadingURIString(browser, UNREACHABLE_URL);
    await pageLoaded;

    const visible = await SpecialPowers.spawn(browser, [], async () => {
      const warning = content.document.getElementById("sslKeyLoggingWarning");
      return !!warning && ContentTaskUtils.isVisible(warning);
    });
    ok(!visible, "SSLKEYLOGFILE warning is not visible when env var is unset");
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});
