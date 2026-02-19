/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

add_task(async function pip_urlbar_shows_readonly_opener_url() {
  const [tab, chromePiP] = await newTabWithPiP();

  // correct URL at the beginning
  const expectedURL = UrlbarTestUtils.trimURL(
    tab.linkedBrowser.currentURI.spec
  );
  is(chromePiP.gURLBar.value, expectedURL, "PiP urlbar shows opener url");
  ok(chromePiP.gURLBar.readOnly, "Location bar is read-only in PiP");

  // correct URL after PiP location change
  const onLocationChange = BrowserTestUtils.waitForLocationChange(
    chromePiP.gBrowser,
    "about:blank#0"
  );
  await SpecialPowers.spawn(chromePiP.gBrowser.selectedBrowser, [], () => {
    content.location.href = "about:blank#0";
  });
  await onLocationChange;
  is(chromePiP.gURLBar.value, expectedURL, "PiP urlbar shows opener url");

  // Cleanup.
  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function pip_alwaysontop_chromeFlag() {
  const [tab, chromePiP] = await newTabWithPiP();

  // Currently, we cannot check the widget is actually alwaysontop. But we can check
  // that the respective chromeFlag is set.
  const chromeFlags = chromePiP.docShell.treeOwner
    .QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsIAppWindow).chromeFlags;
  ok(
    chromeFlags & Ci.nsIWebBrowserChrome.CHROME_ALWAYS_ON_TOP,
    "PiP has alwaysontop chrome flag"
  );

  // Cleanup.
  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
});
