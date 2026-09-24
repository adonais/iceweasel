/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const COOP_COEP_URL =
  "https://example.com/browser/dom/tests/browser/file_coop_coep.html";

add_task(async function test_content_script_data_frame_in_coop_coep_page() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      content_scripts: [
        {
          matches: ["https://example.com/*"],
          js: ["content_script.js"],
          run_at: "document_end",
        },
      ],
    },
    files: {
      "content_script.js": () => {
        /* global browser */
        let frame = document.createElement("iframe");
        frame.src = "data:text/html,frame";
        frame.addEventListener("load", () => {
          browser.test.sendMessage("frame-loaded");
        });
        document.body.appendChild(frame);
      },
    },
  });
  await extension.startup();

  await BrowserTestUtils.withNewTab(COOP_COEP_URL, async browser => {
    await extension.awaitMessage("frame-loaded");

    let frameWin = browser.browsingContext.children[0].currentWindowGlobal;

    // Currently creating a content script in this way will create a document
    // with no precursor principal, and that frame will load into a unique
    // `webCOOP+COEP=moz-nullprincipal:` remote type (see bug 2068262).
    //
    // This may change in the future (e.g. if we decide to use the document's
    // principal as the precursor for extension content script loads).
    ok(
      frameWin.documentPrincipal.isNullPrincipal,
      "frame has a null principal"
    );
    ok(
      !frameWin.documentPrincipal.precursorPrincipal,
      "frame's principal has no precursor"
    );

    ok(
      frameWin.remoteType.startsWith("webCOOP+COEP=moz-nullprincipal:"),
      "frame has the expected remote type"
    );
  });

  await extension.unload();
});
