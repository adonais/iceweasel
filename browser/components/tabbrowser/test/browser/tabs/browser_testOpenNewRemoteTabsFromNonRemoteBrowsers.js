/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const OPEN_LOCATION_PREF = "browser.link.open_newwindow";
const NON_REMOTE_PAGE = "about:welcomeback";

requestLongerTimeout(2);

function insertAndClickAnchor(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    content.document.body.innerHTML = `
      <a href="http://example.com/" target="_blank" rel="opener" id="testAnchor">Open a window</a>
    `;

    let element = content.document.getElementById("testAnchor");
    element.click();
  });
}

/**
 * Takes some browser in some window, and forces that browser
 * to become non-remote, and then navigates it to a page that
 * we're not supposed to be displaying remotely. Returns a
 * Promise that resolves when the browser is no longer remote.
 */
function prepareNonRemoteBrowser(aWindow, browser) {
  BrowserTestUtils.startLoadingURIString(browser, NON_REMOTE_PAGE);
  return BrowserTestUtils.browserLoaded(browser);
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(OPEN_LOCATION_PREF);
});

/**
 * Opens a browser window and clicks a target="_blank" link in its non-remote
 * browser. Makes sure that the new tab becomes remote.
 *
 * @param {object} windowOptions
 *        Options for BrowserTestUtils.openNewBrowserWindow.
 */
async function checkNewTabBecomesRemote(windowOptions) {
  let testWindow = await BrowserTestUtils.openNewBrowserWindow(windowOptions);
  let testBrowser = testWindow.gBrowser.selectedBrowser;
  info("Preparing non-remote browser");
  await prepareNonRemoteBrowser(testWindow, testBrowser);
  info("Non-remote browser prepared");

  let tabOpenEventPromise = BrowserTestUtils.waitForEvent(
    testWindow.gBrowser.tabContainer,
    "TabOpen"
  );
  await insertAndClickAnchor(testBrowser);

  let newTab = (await tabOpenEventPromise).target;
  await BrowserTestUtils.browserLoaded(newTab.linkedBrowser);
  // insertAndClickAnchor causes an open to a web page which
  // means that the tab should eventually become remote.
  ok(
    newTab.linkedBrowser.isRemoteBrowser,
    "The opened browser never became remote."
  );

  await BrowserTestUtils.closeWindow(testWindow);
}

/**
 * Opens a browser window and clicks a target="_blank" link in its non-remote
 * browser. Makes sure that the link opens a second window with the same
 * private browsing state, and that its tab becomes remote.
 *
 * @param {object} windowOptions
 *        Options for BrowserTestUtils.openNewBrowserWindow.
 */
async function checkNewWindowBecomesRemote(windowOptions) {
  let testWindow = await BrowserTestUtils.openNewBrowserWindow(windowOptions);
  let testBrowser = testWindow.gBrowser.selectedBrowser;
  await prepareNonRemoteBrowser(testWindow, testBrowser);

  let newWindowPromise = TestUtils.topicObserved(
    "browser-delayed-startup-finished"
  );
  await insertAndClickAnchor(testBrowser);
  let [newWindow] = await newWindowPromise;

  is(
    PrivateBrowsingUtils.isWindowPrivate(testWindow),
    PrivateBrowsingUtils.isWindowPrivate(newWindow),
    "Private browsing state of new window does not match the original!"
  );

  let newTab = newWindow.gBrowser.selectedTab;

  await BrowserTestUtils.browserLoaded(newTab.linkedBrowser);
  // insertAndClickAnchor causes an open to a web page which
  // means that the tab should eventually become remote.
  ok(
    newTab.linkedBrowser.isRemoteBrowser,
    "The opened browser never became remote."
  );

  await BrowserTestUtils.closeWindow(newWindow);
  await BrowserTestUtils.closeWindow(testWindow);
}

/**
 * Test that if we open a new tab from a link in a non-remote
 * browser in an e10s window, that the new tab will load properly.
 */
add_task(async function test_new_tab() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.security.skip_html_fragment_assertion", true]],
  });

  await checkNewTabBecomesRemote({ remote: true });
  await checkNewTabBecomesRemote({ remote: true, private: true });
});

/**
 * Test that if we open a new window from a link in a non-remote
 * browser in an e10s window, that the new window is not an e10s
 * window. Also tests with a private browsing window.
 */
add_task(async function test_new_window() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.security.skip_html_fragment_assertion", true]],
  });

  // Fiddle with the prefs so that we open target="_blank" links
  // in new windows instead of new tabs.
  Services.prefs.setIntPref(
    OPEN_LOCATION_PREF,
    Ci.nsIBrowserDOMWindow.OPEN_NEWWINDOW
  );

  await checkNewWindowBecomesRemote({ remote: true });
  await checkNewWindowBecomesRemote({ remote: true, private: true });
});
