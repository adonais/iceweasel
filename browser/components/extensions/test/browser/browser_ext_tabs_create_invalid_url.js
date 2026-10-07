"use strict";

const FILE_URL = Services.io.newFileURI(
  new FileUtils.File(getTestFilePath("file_dummy.html"))
).spec;

function loadTestExtension() {
  return ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["tabs"],
    },

    background: function () {
      async function testInvalidUrl(tabsCreateURL) {
        let promise = browser.tabs.create({ url: tabsCreateURL });
        promise.then(tab => {
          // Remove the opened tab is any.
          browser.tabs.remove(tab);
        });
        await browser.test.assertRejects(
          promise,
          /Illegal URL/,
          `Should get rejection for tabs.create with: ${tabsCreateURL}`
        );
        browser.test.sendMessage("created");
      }
      browser.test.onMessage.addListener((msg, tabsCreateURL) => {
        browser.test.assertEq(msg, "create", `tabs.create: ${tabsCreateURL}`);
        testInvalidUrl(tabsCreateURL);
      });
    },
  });
}

add_task(async function test_invalid_url_in_tabs_create() {
  let extension = loadTestExtension();
  await extension.startup();

  let dataURLPage = `data:text/html,
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body>
        <h1>data url page</h1>
      </body>
    </html>`;

  let testCases = [
    { tabsCreateURL: "about:addons" },
    {
      tabsCreateURL: "javascript:console.log('tabs.update execute javascript')",
    },
    { tabsCreateURL: dataURLPage },
    { tabsCreateURL: FILE_URL },
    { tabsCreateURL: `view-source:${FILE_URL}` },
    // FILE_URL is not a real jar archive, but for validation we only look at
    // the URL structure, so it doesn't matter.
    { tabsCreateURL: `view-source:jar:${FILE_URL}!/inside.txt` },
  ];

  for (let { tabsCreateURL } of testCases) {
    extension.sendMessage("create", tabsCreateURL);
    await extension.awaitMessage("created");
  }

  await extension.unload();
});
