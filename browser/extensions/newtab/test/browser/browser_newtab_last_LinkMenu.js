/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function setupPrefs() {
  sinon
    .stub(DiscoveryStreamFeed.prototype, "generateFeedUrl")
    .returns(
      "https://example.com/browser/browser/extensions/newtab/test/browser/topstories.json"
    );
  await setDefaultTopSites();
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.newtabpage.activity-stream.discoverystream.config",
        JSON.stringify({
          collapsible: true,
          enabled: true,
          personalized: false,
        }),
      ],
      [
        "browser.newtabpage.activity-stream.discoverystream.endpoints",
        "https://example.com",
      ],
    ],
  });
}

async function resetPrefs() {
  // We set 5 prefs in setupPrefs, so we should reset 5 prefs.
  // 1 popPrefEnv from pushPrefEnv
  // and 4 popPrefEnv happen internally in setDefaultTopSites.
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
}

let initialHeight;
let initialWidth;
// Sizes the content area rather than the outer window: the window decoration
// in between varies by OS and pixel density, so a fixed outer size gives a
// different viewport per platform. setPrimaryContentSize takes device pixels.
function setSize(width, height) {
  initialHeight = window.innerHeight;
  initialWidth = window.innerWidth;
  let resizePromise = BrowserTestUtils.waitForEvent(window, "resize", false);
  const dpr = window.devicePixelRatio;
  window.docShell.treeOwner
    .QueryInterface(Ci.nsIDocShellTreeOwner)
    .setPrimaryContentSize(Math.round(width * dpr), Math.round(height * dpr));
  return resizePromise;
}

function resetSize() {
  let resizePromise = BrowserTestUtils.waitForEvent(window, "resize", false);
  window.resizeTo(initialWidth, initialHeight);
  return resizePromise;
}

add_task(async function test_newtab_last_LinkMenu() {
  await setupPrefs();

  // Open about:newtab without using the default load listener
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab",
    false
  );

  // Specially wait for potentially preloaded browsers
  let browser = tab.linkedBrowser;
  await waitForPreloaded(browser);

  // Wait for React to render something
  await TestUtils.waitForCondition(
    () =>
      SpecialPowers.spawn(
        browser,
        [],
        () => content.document.getElementById("root")?.children.length
      ),
    "Should render activity stream content"
  );

  // @nova-cleanup(remove-conditional): Remove novaEnabled; use 900, 740 and
  // "6n" unconditionally.
  const novaEnabled = Services.prefs.getBoolPref(
    "browser.newtabpage.activity-stream.nova.enabled",
    false
  );
  // Top sites and stories sit at different places in the layout, so each needs
  // its own width to put its menu at the edge. Top sites must also clear
  // $break-point-large (866px) for open-left to match the rendered columns.
  const topSitesWidth = novaEnabled ? 900 : 600;
  const storiesWidth = novaEnabled ? 740 : 600;
  const topSiteNthChild = novaEnabled ? "6n" : "2n";

  await setSize(topSitesWidth, 450);

  // Test context menu position for topsites.
  await SpecialPowers.spawn(browser, [topSiteNthChild], async nthChild => {
    // Topsites might not be ready, so wait for the button.
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          `.top-site-outer:nth-child(${nthChild}) .context-menu-button`
        ),
      "Wait for the topsite card and button"
    );
    const topsiteOuter = content.document.querySelector(
      `.top-site-outer:nth-child(${nthChild})`
    );
    const topsiteContextMenuButton = topsiteOuter.querySelector(
      ".context-menu-button"
    );

    topsiteContextMenuButton.click();

    await ContentTaskUtils.waitForCondition(
      () => topsiteOuter.classList.contains("active"),
      "Wait for the topsite menu to be active"
    );

    is(
      content.window.scrollMaxX,
      0,
      "there should be no horizontal scroll bar"
    );

    // Close it so it cannot overflow at the narrower stories width.
    topsiteContextMenuButton.click();
    await ContentTaskUtils.waitForCondition(
      () => !topsiteOuter.classList.contains("active"),
      "Wait for the topsite menu to close"
    );
  });

  if (storiesWidth !== topSitesWidth) {
    await setSize(storiesWidth, 450);
  }

  // Test context menu position for topstories.
  await SpecialPowers.spawn(browser, [], async () => {
    // Pocket section might take a bit more time to load,
    // so wait for the button to be ready.
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector(
          ".ds-card:nth-child(1n) .context-menu-button"
        ),
      "Wait for the story card and button"
    );

    const dsCard = content.document.querySelector(".ds-card:nth-child(1n)");
    const dsCarContextMenuButton = dsCard.querySelector(".context-menu-button");

    dsCarContextMenuButton.click();

    await ContentTaskUtils.waitForCondition(
      () => dsCard.classList.contains("active"),
      "Wait for the story menu to be active"
    );

    is(
      content.window.scrollMaxX,
      0,
      "there should be no horizontal scroll bar"
    );
  });

  // Resetting the window size to what it was.
  await resetSize();
  // Resetting prefs we set for this test.
  await resetPrefs();
  BrowserTestUtils.removeTab(tab);
  sinon.restore();
});
