/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const kContentFileUrl = kBaseUrlForContent + "simple_page_ext.html";

const kTextPlainMimeType = "text/plain";
const kURLPrivateMimeType = "text/x-moz-url-priv";

function execCommandCopy(aBrowser, aText) {
  return SpecialPowers.spawn(aBrowser, [aText], async aText => {
    const textArea = content.document.createElement("textarea");
    content.document.body.appendChild(textArea);
    textArea.value = aText;
    textArea.focus();
    textArea.setSelectionRange(0, textArea.value.length);
    content.document.notifyUserGestureActivation();
    ok(
      Cu.waiveXrays(content.document).execCommand("copy"),
      "Check if the 'copy' command is succeed"
    );
    textArea.remove();
  });
}

const kWriteOperations = [
  {
    description: "execCommand('copy')",
    writeFn(aBrowser, aText) {
      return execCommandCopy(aBrowser, aText);
    },
  },
  {
    description: "copy event with replaced clipboardData",
    async writeFn(aBrowser, aText) {
      SpecialPowers.spawn(aBrowser, [aText], aText => {
        content.document.addEventListener(
          "copy",
          aEvent => {
            aEvent.clipboardData.setData("text/plain", aText);
            aEvent.preventDefault();
          },
          { once: true }
        );
      });

      // The selected text is discarded in favour of the data set by the
      // listener.
      await execCommandCopy(aBrowser, "Some other text");
    },
  },
  {
    description: "navigator.clipboard.write()",
    writeFn(aBrowser, aText) {
      return SpecialPowers.spawn(aBrowser, [aText], async aText => {
        content.document.notifyUserGestureActivation();
        return content.navigator.clipboard.write([
          new content.ClipboardItem({ "text/plain": aText }),
        ]);
      });
    },
  },
  {
    description: "navigator.clipboard.writeText()",
    writeFn(aBrowser, aText) {
      return SpecialPowers.spawn(aBrowser, [aText], async aText => {
        content.document.notifyUserGestureActivation();
        return content.navigator.clipboard.writeText(aText);
      });
    },
  },
];

async function testSourceURL(win, url, expectedSourceURL) {
  await BrowserTestUtils.withNewTab(
    { gBrowser: win.gBrowser, url },
    async function (browser) {
      for (const { description, writeFn } of kWriteOperations) {
        info(`Test source URL written by ${description}`);
        // Randomized text to avoid overlapping with other tests.
        const clipboardText = "X" + Math.random();
        await SimpleTest.promiseClipboardChange(
          clipboardText,
          () => writeFn(browser, clipboardText),
          kTextPlainMimeType
        );
        is(
          SpecialPowers.getClipboardData(kURLPrivateMimeType),
          expectedSourceURL,
          `${description} wrote the source URL`
        );
      }
    }
  );
}

add_task(async function test_source_url() {
  await testSourceURL(window, kContentFileUrl, "https://example.com");
});

add_task(async function test_source_url_private_browsing() {
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  // The censored URL in private browsing mode.
  await testSourceURL(privateWindow, kContentFileUrl, "about:internet");

  await BrowserTestUtils.closeWindow(privateWindow);
});

add_task(async function test_source_url_chrome() {
  // Should not have a URL for an internal page.
  await testSourceURL(window, "about:support", "");
});
