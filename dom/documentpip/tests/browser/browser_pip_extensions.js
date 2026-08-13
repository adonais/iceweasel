/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

// Test documentPictureInPicture.requestWindow() from a content script.
async function testContentScript({ useMainWorld } = {}) {
  // In isolated world, we need to unwrap the window so the test
  // can see what we set on it.
  const pageWindow = useMainWorld ? "window" : "window.wrappedJSObject";

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["activeTab"],
      content_scripts: [
        {
          matches: ["https://example.com/*"],
          js: ["script.js"],
          ...(useMainWorld ? { world: "MAIN" } : {}),
        },
      ],
    },
    files: {
      "script.js": `
        ${pageWindow}.pipReady = true;
        // Wait for test to grant us user activation
        window.addEventListener("test-pip", async () => {
          try {
            let pipWin = await window.documentPictureInPicture.requestWindow();
            ${pageWindow}.pipResult = { opened: true };
          } catch (e) {
            ${pageWindow}.pipResult = { opened: false, error: e.message };
          }
        });
      `,
    },
  });

  await extension.startup();

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "https://example.com",
    waitForLoad: true,
  });

  const chromePiPPromise = BrowserTestUtils.waitForNewWindow();

  const result = await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.wrappedJSObject.pipReady
    );
    content.document.notifyUserGestureActivation();
    content.dispatchEvent(new content.CustomEvent("test-pip"));
    await ContentTaskUtils.waitForCondition(
      () => content.wrappedJSObject.pipResult
    );
    return content.wrappedJSObject.pipResult;
  });

  let chromePiP;
  if (result.opened) {
    chromePiP = await chromePiPPromise;
  }

  return { result, tab, chromePiP, extension };
}

function getContentPrincipal(browserOrWin) {
  const browser = browserOrWin.gBrowser
    ? browserOrWin.gBrowser.selectedBrowser
    : browserOrWin;
  return browser.browsingContext.currentWindowContext.documentPrincipal;
}

add_task(async function dpip_from_main_world() {
  const { result, tab, chromePiP, extension } = await testContentScript({
    useMainWorld: true,
  });

  ok(result.opened, "MAIN world content script can open DPIP");

  const expectedURL = UrlbarTestUtils.trimURL(
    tab.linkedBrowser.currentURI.spec
  );
  is(chromePiP.gURLBar.value, expectedURL, "PiP urlbar shows opener origin");

  ok(
    getContentPrincipal(chromePiP).equals(
      getContentPrincipal(tab.linkedBrowser)
    ),
    "PiP principal matches the opener page's principal"
  );

  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});

add_task(async function dpip_from_isolated_world() {
  const { result, tab, chromePiP, extension } = await testContentScript();

  ok(result.opened, "Isolated world can open DPIP");

  ok(
    getContentPrincipal(chromePiP).equals(
      getContentPrincipal(tab.linkedBrowser)
    ),
    "PiP principal matches the opener page's principal"
  );

  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});

/* global browser */
add_task(async function dpip_from_extension_page() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "page.html": `<script src="page.js"></script>`,
      "page.js": async function () {
        browser.test.onMessage.addListener(async msg => {
          if (msg !== "open-pip") {
            return;
          }
          let pipPromise;
          browser.test.withHandlingUserInput(() => {
            pipPromise = window.documentPictureInPicture.requestWindow();
          });
          let pipWin = await pipPromise;
          browser.test.assertTrue(
            pipWin,
            "Extension page can open Document PiP"
          );
        });
        browser.test.sendMessage("ready");
      },
    },
    async background() {
      await browser.tabs.create({
        url: browser.runtime.getURL("page.html"),
      });
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const chromePiPPromise = BrowserTestUtils.waitForNewWindow();
  extension.sendMessage("open-pip");
  const chromePiP = await chromePiPPromise;

  const tab = gBrowser.tabs.find(t =>
    t.linkedBrowser.currentURI.spec.startsWith("moz-extension://")
  );

  ok(
    getContentPrincipal(chromePiP).equals(
      getContentPrincipal(tab.linkedBrowser)
    ),
    "PiP principal matches the extension page's principal"
  );

  await BrowserTestUtils.closeWindow(chromePiP);
  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});
