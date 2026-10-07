/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const EXAMPLE_COM_URI =
  "https://example.com/document-builder.sjs?html=example.com";
const EXAMPLE_ORG_URI =
  "https://example.org/document-builder.sjs?headers=Cross-Origin-Opener-Policy:same-origin&html=example.org";

/**
 * Test that watchedByDevTools is properly propagated during cross
 * site navigations, and properly restored when navigating with bfcache.
 */
add_task(async function () {
  const tab = await addTab(EXAMPLE_COM_URI);
  const browser = tab.linkedBrowser;
  const bcCom = browser.browsingContext;

  const toolbox = await openToolboxForTab(tab, "webconsole");
  ok(bcCom.watchedByDevTools, "example.com browsing context is watched");

  await navigateTo(EXAMPLE_ORG_URI);
  const bcOrg = browser.browsingContext;
  isnot(bcCom, bcOrg, "Cross-group navigation replaced the BrowsingContext");
  ok(bcOrg.watchedByDevTools, "example.org browsing context is watched");

  info("Close devtools before navigating using bfcache");
  await toolbox.destroy();

  info("Wait for watchByDevTools to be updated");
  await waitFor(() => !bcOrg.watchedByDevTools);
  ok(!bcOrg.watchedByDevTools, "example.org browsing context is not watched");

  ok(!ChromeUtils.isDevToolsOpened(), "DevTools are closed");

  info("Go back from example.org to example.com");
  let onLocationChange = BrowserTestUtils.waitForLocationChange(
    gBrowser,
    EXAMPLE_COM_URI
  );
  browser.goBack();
  await onLocationChange;

  is(browser.browsingContext, bcCom, "Back restored example.com from bfcache");
  ok(!bcCom.watchedByDevTools, "example.com browsing context is not watched");

  // This step used to lead to a crash (Bug 2073442).
  info("Go forward from example.com to example.org");
  onLocationChange = BrowserTestUtils.waitForLocationChange(
    gBrowser,
    EXAMPLE_ORG_URI
  );
  browser.goForward();
  await onLocationChange;
  is(
    browser.browsingContext,
    bcOrg,
    "Forward restored example.org from bfcache"
  );
  ok(!bcOrg.watchedByDevTools, "example.org browsing context is not watched");

  gBrowser.removeTab(tab);
});
