"use strict";

const server = createHttpServer({ hosts: ["example.com"] });
server.registerDirectory("/data/", do_get_file("data"));

add_task(async function test_runtime_getVersion() {
  const version = "1.2.3";

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      version: version,
      content_scripts: [
        {
          matches: ["http://example.com/data/file_sample.html"],
          js: ["content_script.js"],
        },
      ],
    },

    background() {
      browser.test.assertEq(
        browser.runtime.getVersion(),
        version,
        "runtime.getVersion() from background script is correct"
      );
    },

    files: {
      "content_script.js"() {
        browser.test.assertEq(
          browser.runtime.getVersion(),
          version,
          "runtime.getVersion() from content script is correct"
        );
      },
    },
  });

  await extension.startup();

  const contentPage = await ExtensionTestUtils.loadContentPage(
    "http://example.com/data/file_sample.html"
  );

  await contentPage.close();
  await extension.unload();
});
