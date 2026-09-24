"use strict";

const FILES = {
  "page.html": `<!DOCTYPE html>
    <html>
    <meta charset=utf-8>
    <body>
    <script src="page.js"></script>
    </body></html>`,

  "page.js": function () {
    window.importModule = () => import("./module.mjs");
  },

  "module.mjs": `export default 42;\n`,
};

async function loadExtensionPage() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: { manifest_version: 2 },
    files: FILES,
  });

  await extension.startup();

  let page = await ExtensionTestUtils.loadContentPage(
    `moz-extension://${extension.uuid}/page.html`,
    { extension }
  );

  return { extension, page };
}

add_task(async function test_module_loads_normally() {
  let { extension, page } = await loadExtensionPage();

  await page.spawn([], async () => {
    let ns = await content.wrappedJSObject.importModule();
    Assert.strictEqual(
      ns.wrappedJSObject.default,
      42,
      "control: the module's source is evaluated"
    );
  });

  await page.close();
  await extension.unload();
});

add_task(async function test_scripting_disabled_creates_empty_module() {
  let { extension, page } = await loadExtensionPage();

  await page.spawn([], async () => {
    let loadGroup = content.docShell.QueryInterface(
      Ci.nsIDocumentLoader
    ).loadGroup;
    let moduleIsFetching = () => {
      for (let request of loadGroup.requests) {
        if (request.name.endsWith("module.mjs")) {
          return true;
        }
      }
      return false;
    };

    // import a module, and then disable scripting.
    // An empty module script should be created.
    content.wrappedJSObject.importModule();
    Cu.blockScriptForGlobal(content);
    try {
      Assert.ok(moduleIsFetching(), "the module's fetch is in flight");
      await ContentTaskUtils.waitForCondition(
        () => !moduleIsFetching(),
        "the module's fetch completed while scripting was disabled"
      );
    } finally {
      Cu.unblockScriptForGlobal(content);
    }

    // Import again should get the cached empty module script, even if scripting
    // is enabled now.
    let ns = await content.wrappedJSObject.importModule();
    Assert.strictEqual(
      ns.wrappedJSObject.default,
      undefined,
      "the module was created from empty source"
    );
  });

  await page.close();
  await extension.unload();
});
