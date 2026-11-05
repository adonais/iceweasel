"use strict";

add_task(async function test_sender_windowId() {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      manifest_version: 3,
      action: {
        default_popup: "popup.html",
        default_area: "navbar",
      },
      sidebar_action: {
        default_panel: "sidebar.html",
      },
      content_scripts: [
        {
          matches: ["*://example.com/*"],
          js: ["content.js"],
        },
      ],
    },
    background: async function () {
      let newWindowId;
      browser.runtime.onMessage.addListener((message, sender) => {
        if (message.source === "from-content-moved") {
          browser.test.assertEq(
            sender.tab.windowId,
            newWindowId,
            "Content script sender.tab.windowId should match the new window id"
          );
          browser.test.assertEq(
            sender.windowId,
            newWindowId,
            "Content script sender.windowId should match the new window id"
          );
          browser.windows.remove(newWindowId).then(() => {
            browser.test.sendMessage("content-moved-tested");
          });
        } else if (message.source === "from-content") {
          browser.test.assertEq(
            sender.tab.windowId,
            sender.windowId,
            "Content script sender.windowId should match sender.tab.windowId"
          );
          browser.test.sendMessage("content-tested");

          browser.windows.create({ tabId: sender.tab.id }).then(newWindow => {
            newWindowId = newWindow.id;
            browser.tabs.sendMessage(newWindow.tabs[0].id, {
              command: "check-moved",
            });
          });
        } else if (message.source === "from-popup") {
          browser.test.assertEq(
            message.currentWindowId,
            sender.windowId,
            "Popup sender.windowId should strictly match browser.windows.getCurrent()"
          );
          browser.test.sendMessage("popup-tested");
        } else if (message.source === "from-sidebar") {
          browser.test.assertEq(
            message.currentWindowId,
            sender.windowId,
            "Sidebar sender.windowId should strictly match browser.windows.getCurrent()"
          );

          // Broadcast to the sidebar to test the background script's sender object
          browser.runtime.sendMessage({ source: "from-background" });
        }
      });

      browser.test.sendMessage("background-ready");
    },
    files: {
      "popup.html": `<!DOCTYPE html><meta charset="utf-8"><script src="popup.js"></script>`,
      "popup.js": async function () {
        browser.windows.getCurrent().then(currentWindow => {
          browser.runtime.sendMessage({
            source: "from-popup",
            currentWindowId: currentWindow.id,
          });
        });
      },

      "sidebar.html": `<!DOCTYPE html><meta charset="utf-8"><script src="sidebar.js"></script>`,
      "sidebar.js": async function () {
        browser.runtime.onMessage.addListener((message, sender) => {
          if (message.source === "from-background") {
            browser.test.assertEq(
              undefined,
              sender.windowId,
              "Background script sender should not have a windowId"
            );
            browser.test.sendMessage("sidebar-and-background-tested");
          }
        });

        browser.windows.getCurrent().then(currentWindow => {
          browser.runtime.sendMessage({
            source: "from-sidebar",
            currentWindowId: currentWindow.id,
          });
        });
      },

      "content.js": async function () {
        browser.runtime.onMessage.addListener(message => {
          if (message.command === "check-moved") {
            browser.runtime.sendMessage({ source: "from-content-moved" });
          }
        });

        browser.runtime.sendMessage({ source: "from-content" });
      },
    },
  });

  await extension.startup();
  await extension.awaitMessage("background-ready");

  info("Testing content script messaging");
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  await extension.awaitMessage("content-tested");
  await extension.awaitMessage("content-moved-tested");

  info("Testing popup messaging");
  await clickBrowserAction(extension);
  await extension.awaitMessage("popup-tested");
  await closeBrowserAction(extension);

  info("Testing sidebar and background messaging");
  await SidebarController.show(`ext-sidebar_${extension.id}-sidebar-action`);

  await extension.awaitMessage("sidebar-and-background-tested");

  await SidebarController.hide();
  await BrowserTestUtils.removeTab(tab);

  await extension.unload();
});
