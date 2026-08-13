/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A host that should reliably fail to connect and produce about:neterror.
const UNREACHABLE_URL = "https://example.invalid.test/";

const PROCESS_SCRIPT_URL =
  getRootDirectory(gTestPath) + "sslKeyLogging_processScript.js";

let gProcessScriptLoaded = false;

function ensureProcessScript() {
  if (gProcessScriptLoaded) {
    return;
  }
  Services.ppmm.loadProcessScript(PROCESS_SCRIPT_URL, true);
  gProcessScriptLoaded = true;
}

function setSSLKeyLogFileEverywhere(value) {
  ensureProcessScript();
  Services.env.set("SSLKEYLOGFILE", value);
  Services.ppmm.broadcastAsyncMessage("Test:SetSSLKeyLogFile", { value });
}

registerCleanupFunction(() => {
  setSSLKeyLogFileEverywhere("");
  if (gProcessScriptLoaded) {
    Services.ppmm.removeDelayedProcessScript(PROCESS_SCRIPT_URL);
    gProcessScriptLoaded = false;
  }
});

async function withSSLKeyLogging(enabled, callback) {
  const tmpFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tmpFile.append("sslkeylog-test.log");
  setSSLKeyLogFileEverywhere(enabled ? tmpFile.path : "");

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const browser = tab.linkedBrowser;

  // Wait for the env var setting message to reach the tab's content process
  // before navigating to the failing URL.
  await SpecialPowers.spawn(browser, [enabled], async expected => {
    await ContentTaskUtils.waitForCondition(() => {
      const env = Services.env;
      const set =
        env.exists("SSLKEYLOGFILE") && env.get("SSLKEYLOGFILE") !== "";
      return set === expected;
    }, "Waiting for SSLKEYLOGFILE env var to propagate");
  });

  try {
    const pageLoaded = BrowserTestUtils.waitForErrorPage(browser);
    BrowserTestUtils.startLoadingURIString(browser, UNREACHABLE_URL);
    await pageLoaded;
    await callback(browser);
  } finally {
    BrowserTestUtils.removeTab(tab);
    setSSLKeyLogFileEverywhere("");
  }
}

async function getWarning(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    ok(
      doc.documentURI.startsWith("about:neterror"),
      "Should be showing about:neterror"
    );

    const warning = doc.getElementById("sslKeyLoggingWarning");

    if (!warning) {
      return { present: false, visible: false, l10nId: undefined };
    }

    const visible = ContentTaskUtils.isVisible(warning);

    const supportLink = warning.shadowRoot.querySelector(
      "a[is='moz-support-link']"
    );

    return {
      present: true,
      visible,
      l10nId: warning.getAttribute("data-l10n-id"),
      hasSupportLink: !!supportLink,
      supportPage: supportLink?.getAttribute("support-page"),
    };
  });
}

add_task(async function warning_shown_when_sslkeylogfile_set() {
  await withSSLKeyLogging(true, async browser => {
    const result = await getWarning(browser);
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
  });
});

add_task(async function warning_hidden_when_sslkeylogfile_unset() {
  await withSSLKeyLogging(false, async browser => {
    const result = await getWarning(browser);
    ok(
      !result.visible,
      "SSLKEYLOGFILE warning is not visible when env var is unset"
    );
  });
});
