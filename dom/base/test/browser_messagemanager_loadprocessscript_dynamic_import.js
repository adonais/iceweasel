"use strict";

const SCRIPT_URL =
  "chrome://mochitests/content/browser/dom/base/test/file_process_script_dynamic_import.js";

// Load the process script in all the existing processes, and collect the
// message sent by each of them.
function loadProcessScriptAndCollect(url, messageName) {
  const expectedCount = Services.ppmm.childCount;
  const results = [];
  const received = new Promise(resolve => {
    Services.ppmm.addMessageListener(messageName, function listener(msg) {
      results.push(msg.data);
      if (results.length == expectedCount) {
        Services.ppmm.removeMessageListener(messageName, listener);
        resolve(results);
      }
    });
  });
  Services.ppmm.loadProcessScript(url, false);
  return received;
}

// A process script which resolves module specifiers in a relative path and an
// absolute path.
add_task(async function test_dynamic_import_from_process_script() {
  const results = await loadProcessScriptAndCollect(
    SCRIPT_URL,
    "Test:DynamicImport:File"
  );
  Services.ppmm.removeDelayedProcessScript(SCRIPT_URL);

  for (const { processType, relative, absolute } of results) {
    is(
      relative,
      "loaded",
      `relative specifier is resolved against the process script URL (process type ${processType})`
    );
    is(
      absolute,
      "loaded",
      `absolute specifier is resolved (process type ${processType})`
    );
  }
});

const HELPER_URL =
  "chrome://mochitests/content/browser/dom/base/test/file_subscript_dynamic_import.sys.mjs";

add_task(async function test_dynamic_import_from_subscript() {
  const { loadSubScript } = ChromeUtils.importESModule(HELPER_URL);
  const [absolute, relative] = await loadSubScript(
    "chrome://mochitests/content/browser/dom/base/test/file_subscript_dynamic_import.js"
  );

  is(absolute, "loaded", "absolute specifier is resolved");
  is(
    relative,
    "loaded",
    "relative specifier is resolved against the subscript URL"
  );
});

// A precompiled script has no base URL, so only absolute specifiers resolve.
add_task(async function test_dynamic_import_from_precompiled_script() {
  const { executePrecompiledScript } = ChromeUtils.importESModule(HELPER_URL);
  const [absolute, relative] = await executePrecompiledScript(
    "chrome://mochitests/content/browser/dom/base/test/file_precompiled_script_dynamic_import.js"
  );

  is(absolute, "loaded", "absolute specifier is resolved without a base URL");
  is(
    relative,
    "TypeError",
    "relative specifier is rejected without a base URL"
  );
});
