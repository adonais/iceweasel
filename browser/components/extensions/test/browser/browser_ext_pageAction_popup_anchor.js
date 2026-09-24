"use strict";

const TEST_URL = "https://example.com/";

// What browser.pageAction.show() does in the parent process.
function showPageAction(pageAction) {
  pageAction.action.setProperty(gBrowser.selectedTab, "enabled", true);
}

add_task(async function test_popup_destroyed_when_anchoring_throws() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      page_action: { default_popup: "popup.html" },
    },
    files: {
      "popup.html": `<!DOCTYPE html><html><body>popup</body></html>`,
    },
  });
  await extension.startup();

  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    let panelId = `${makeWidgetId(extension.id)}-panel`;
    let pageAction = Management.global.pageActionFor(
      WebExtensionPolicy.getByID(extension.id).extension
    );
    await getPageActionButton(extension);

    // PanelPopup only resolves contentReady once the popup's browser has
    // reported its size, so the browser is always inserted before handleClick()
    // reaches the anchoring step below.
    let popupBrowser;
    let onBrowserInserted = (eventName, browser) => {
      if (browser.closest("panel")?.id == panelId) {
        popupBrowser = browser;
      }
    };
    Management.on("extension-browser-inserted", onBrowserInserted);

    // handleClick() instantiates a PanelPopup, awaits its contentReady, and
    // then calls togglePanelForAction() to anchor and show it. Throwing here
    // simulates panelAnchorNodeForAction() finding no usable anchor node, the
    // scenario described in
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1378104#c90, so that we can
    // check that the popup handleClick() created is cleaned up.
    let panel;
    let originalToggle = BrowserPageActions.togglePanelForAction;
    BrowserPageActions.togglePanelForAction = (action, panelNode) => {
      panel = panelNode;
      is(
        pageAction.popupNode.panel,
        panelNode,
        "the page action references the popup it is about to show"
      );
      ok(
        panelNode.contains(popupBrowser),
        "the popup's browser is in the panel"
      );
      throw new Error("Anchoring failed");
    };
    registerCleanupFunction(() => {
      Management.off("extension-browser-inserted", onBrowserInserted);
      BrowserPageActions.togglePanelForAction = originalToggle;
    });

    showPageAction(pageAction);
    await Assert.rejects(
      pageAction.handleClick(window, { button: 0, modifiers: [] }),
      /Anchoring failed/,
      "the anchoring failure is reported to the caller"
    );

    is(panel.parentNode, null, "the popup panel was removed from the document");
    is(
      pageAction.popupNode,
      undefined,
      "the page action no longer references the popup"
    );

    // A popup that is never shown is never hidden either, so a browser left
    // behind here would keep a refresh driver ticking, and vsync enabled, for
    // the lifetime of the window.
    await TestUtils.waitForCondition(
      () => !panel.contains(popupBrowser),
      "waiting for the popup's browser to be destroyed"
    );
  });

  await extension.unload();
});
