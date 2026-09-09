/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AIWindowUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs"
);

async function navigateAndWait(win, url) {
  await BrowserTestUtils.loadURIString({
    browser: win.gBrowser.selectedTab.linkedBrowser,
    uriString: url,
  });
  await TestUtils.waitForCondition(
    () => win.gBrowser.selectedBrowser.currentURI.spec === url,
    `Should navigate to ${url}`
  );
}

function assertSidebarHidden(win, context) {
  const box = win.document.getElementById(AIWindowUI.BOX_ID);
  const splitter = win.document.getElementById(AIWindowUI.SPLITTER_ID);
  const isHidden = el =>
    el.collapsed || win.getComputedStyle(el).display === "none";

  Assert.ok(isHidden(box), `Box should be hidden ${context}`);
  Assert.ok(isHidden(splitter), `Splitter should be hidden ${context}`);
}

function assertSidebarVisible(win, context) {
  const box = win.document.getElementById(AIWindowUI.BOX_ID);
  const splitter = win.document.getElementById(AIWindowUI.SPLITTER_ID);

  Assert.ok(!box.collapsed, `Box should be visible ${context}`);
  Assert.ok(!splitter.collapsed, `Splitter should be visible ${context}`);
  Assert.equal(
    AIWindowUI.isSidebarOpen(win),
    true,
    `Sidebar should be open ${context}`
  );
}

add_task(async function test_firstrun_immersive_view() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.firstrun.hasCompleted", false],
    ],
  });

  const win = await openAIWindow({ waitForTabURL: "" });
  const chromeRoot = win.document.documentElement;

  await navigateAndWait(win, FIRSTRUN_URL);

  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "Chrome window has the aiwindow-immersive-view attribute"
  );
  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-first-run"),
    "Chrome window has the aiwindow-first-run attribute"
  );

  await navigateAndWait(win, "https://example.com/");

  Assert.ok(
    !chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "After firstrun tab is closed, the chrome window no longer has the aiwindow-immersive-view attribute"
  );
  Assert.ok(
    !chromeRoot.hasAttribute("aiwindow-first-run"),
    "After firstrun tab is closed, the chrome window no longer has the aiwindow-first-run attribute"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_open_sidebar_immersive_view() {
  const sb = this.sinon.createSandbox();
  registerCleanupFunction(() => sb.restore());

  sb.stub(this.openAIEngine, "build");

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.firstrun.hasCompleted", false],
    ],
  });

  const win = await openAIWindow({ waitForTabURL: "" });
  const chromeRoot = win.document.documentElement;
  await navigateAndWait(win, FIRSTRUN_URL);

  Assert.ok(
    chromeRoot.hasAttribute("aiwindow-immersive-view"),
    "Chrome window has the aiwindow-immersive-view attribute"
  );

  await AIWindowUI.openSidebar(win);
  assertSidebarHidden(win, "when openSidebar called on firstrun page");

  await navigateAndWait(win, "https://example.com/");

  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => !chromeRoot.hasAttribute("aiwindow-immersive-view")
  );

  assertSidebarVisible(win, "after navigating away from firstrun");

  await navigateAndWait(win, AIWINDOW_URL);

  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => chromeRoot.hasAttribute("aiwindow-immersive-view")
  );

  assertSidebarHidden(win, "when viewing AI Window URL");

  AIWindowUI.closeSidebar(win);
  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_first_run_hides_urlbar() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      ["browser.smartwindow.firstrun.hasCompleted", false],
    ],
  });

  const win = await openAIWindow({ waitForTabURL: "" });
  const chromeRoot = win.document.documentElement;
  await navigateAndWait(win, FIRSTRUN_URL);

  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => chromeRoot.hasAttribute("aiwindow-first-run")
  );

  const urlbarContainer = win.document.getElementById("urlbar-container");
  Assert.equal(
    win.getComputedStyle(urlbarContainer).visibility,
    "hidden",
    "Address bar is hidden during first run"
  );

  // Leaving first run reveals the address bar again.
  await navigateAndWait(win, "https://example.com/");
  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => !chromeRoot.hasAttribute("aiwindow-first-run")
  );

  Assert.equal(
    win.getComputedStyle(urlbarContainer).visibility,
    "visible",
    "Address bar is visible again after leaving first run"
  );

  // The address bar also stays visible on the immersive Smart Window new tab,
  // which is the immersive-but-not-first-run case the patch fixes.
  await navigateAndWait(win, AIWINDOW_URL);
  await BrowserTestUtils.waitForMutationCondition(
    chromeRoot,
    { attributes: true },
    () => chromeRoot.hasAttribute("aiwindow-immersive-view")
  );

  Assert.equal(
    win.getComputedStyle(urlbarContainer).visibility,
    "visible",
    "Address bar is visible on the immersive Smart Window new tab"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_propbag_only_stamps_immersive_view() {
  // handleAIWindowOptions stamps the propBag browser-init reads pre-paint. It
  // marks the immersive view; first-run hiding is driven solely by
  // updateImmersiveView on location change.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const args = AIWindow.handleAIWindowOptions({ aiWindow: true });
  Assert.ok(args, "handleAIWindowOptions returns args for an AI window");

  const propBag = args.queryElementAt(1, Ci.nsIPropertyBag2);
  Assert.ok(
    propBag.hasKey("aiwindow-immersive-view"),
    "propBag carries aiwindow-immersive-view for an immersive open"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_ask_button_hidden_in_fullpage_mode() {
  const win = await openAIWindow();

  // Wait for immersive view to be active (aiWindow.html loaded)
  await BrowserTestUtils.waitForMutationCondition(
    win.document.documentElement,
    { attributes: true },
    () => win.document.documentElement.hasAttribute("aiwindow-immersive-view")
  );

  const askButton = win.document.getElementById("smartwindow-ask-button");

  Assert.ok(
    askButton.hidden,
    "Ask button is hidden in fullpage mode (aiwindow-immersive-view)"
  );

  // Navigate away from the fullpage AI window URL — button should reappear
  await navigateAndWait(win, "https://example.com/");

  Assert.ok(
    !askButton.hidden,
    "Ask button is visible after navigating away from fullpage mode"
  );

  await BrowserTestUtils.closeWindow(win);
});
