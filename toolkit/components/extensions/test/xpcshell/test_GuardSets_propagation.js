"use strict";

const { setEnterpriseGuards } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionPermissions.sys.mjs"
);

const server = createHttpServer({
  hosts: ["guard.example.com", "other.example.com"],
});
server.registerPathHandler("/ok", (req, res) => {
  res.setStatusLine(req.httpVersion, 200, "OK");
  res.write("ok");
});

// Verify that a content process spawned after setEnterpriseGuards picks up the
// guards on initialization, and that a live update propagates to an existing
// content process.
add_task(async function test_content_script_propagation() {
  setEnterpriseGuards({
    "*": {
      runtime_blocked_hosts: ["http://guard.example.com/*"],
      runtime_allowed_hosts: [],
    },
  });

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: "cs-guard@test" } },
      content_scripts: [
        {
          matches: ["http://other.example.com/*"],
          js: ["cs.js"],
        },
      ],
      host_permissions: [
        "http://guard.example.com/*",
        "http://other.example.com/*",
      ],
    },
    files: {
      "cs.js"() {
        browser.test.onMessage.addListener(async (msg, url) => {
          if (msg === "fetch-blocked") {
            await browser.test.assertRejects(
              fetch(url),
              /NetworkError/,
              `${url} blocked in content process`
            );
            browser.test.sendMessage("done");
          } else if (msg === "fetch-allowed") {
            let r = await fetch(url);
            browser.test.assertTrue(r.ok, `${url} allowed in content process`);
            browser.test.sendMessage("done");
          }
        });
        browser.test.sendMessage("content-script-ready");
      },
    },
  });
  await extension.startup();

  // Verifies that a newly-spawned content process picks up pre-set guards.
  let page = await ExtensionTestUtils.loadContentPage(
    "http://other.example.com/ok"
  );
  await extension.awaitMessage("content-script-ready");

  extension.sendMessage("fetch-blocked", "http://guard.example.com/ok");
  await extension.awaitMessage("done");

  // Verifies that an existing content process receives updated guards.
  setEnterpriseGuards({
    "*": {
      runtime_blocked_hosts: ["http://other.example.com/*"],
      runtime_allowed_hosts: [],
    },
  });

  extension.sendMessage("fetch-allowed", "http://guard.example.com/ok");
  await extension.awaitMessage("done");

  await page.close();
  await extension.unload();
  setEnterpriseGuards({});
});
