/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// See bug 2003255
add_task(async function test_extension_cannot_block_initial_load() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      manifest_version: 2,
      name: "insert script to about:blank",
      version: "1.0",
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["content.js"],
          run_at: "document_start",
          all_frames: true,
          match_about_blank: true,
        },
      ],
    },

    files: {
      "content.js": function () {
        if (window.location.href != "about:blank#unique-hash") {
          return;
        }

        const script = document.createElement("script");
        script.src =
          "data:,(window.parent.postMessage(`script ${window.location.href}`))()";
        (document.documentElement || document).appendChild(script);
      },
    },
  });

  await extension.startup();

  const url = "https://example.com/";
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);

  await ContentTask.spawn(tab.linkedBrowser, [url], async function (url) {
    Assert.equal(content.location.href, url, "Correct content document");

    const scriptEvaluated = new Promise(
      res =>
        (content.onmessage = ({ data }) => {
          if (data == "script about:blank#unique-hash") {
            res();
          }
        })
    );

    let loaded = false;
    const iframe = content.document.createElement("iframe");
    iframe.onload = () => (loaded = true);
    // Let's set a unique hash in case there are other about:blank
    iframe.src = "about:blank#unique-hash";
    content.document.body.append(iframe);
    Assert.ok(loaded, "Load occurred synchronously");

    const extScript = iframe.contentDocument.querySelector("script");
    Assert.ok(!!extScript, "Extension inserted script synchronously");

    await scriptEvaluated;
  });

  BrowserTestUtils.removeTab(tab);
  await extension.unload();
});
