"use strict";

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { XPCShellContentUtils } = ChromeUtils.importESModule(
  "resource://testing-common/XPCShellContentUtils.sys.mjs"
);
const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

XPCShellContentUtils.init(this);

function delay() {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

const server = XPCShellContentUtils.createHttpServer({
  hosts: ["example.com"],
});

// XML document with only a <script> tag as the document element.
const PAGE_URL = "http://example.com/";
const DCL_PAGE_URL = "http://example.com/blockdcl";
server.registerPathHandler("/", (request, response) => {
  response.setHeader("Content-Type", "application/xhtml+xml");
  response.write(String.raw`<!DOCTYPE html>
    <script xmlns="http://www.w3.org/1999/xhtml" src="slow.js"/>
  `);
});

server.registerPathHandler("/blockdcl", (request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.write("<!DOCTYPE html><html><body>blockdcl</body></html>");
});

let resolveResumeScriptPromise;
let resumeScriptPromise = new Promise(resolve => {
  resolveResumeScriptPromise = resolve;
});

let resolveScriptRequestPromise;
let scriptRequestPromise = new Promise(resolve => {
  resolveScriptRequestPromise = resolve;
});

// An empty script which waits to complete until `resumeScriptPromise`
// resolves.
server.registerPathHandler("/slow.js", async (request, response) => {
  response.processAsync();
  resolveScriptRequestPromise();

  await resumeScriptPromise;

  response.setHeader("Content-type", "text/javascript");
  response.write("");
  response.finish();
});

add_setup(function () {
  Services.prefs.setBoolPref("security.allow_unsafe_parent_loads", true);
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("security.allow_unsafe_parent_loads");
});

// Tests that attempting to block parsing for a <script> tag while the
// parser is already blocked is handled correctly, and does not cause
// crashes or hangs.
add_task(async function test_nested_blockParser() {
  // Wait for the document element of the page to be inserted, and block
  // the parser when it is.
  let resolveBlockerPromise;
  let blockerPromise;
  let docElementPromise = TestUtils.topicObserved(
    "document-element-inserted",
    doc => {
      if (doc.location.href === PAGE_URL) {
        blockerPromise = new Promise(resolve => {
          resolveBlockerPromise = resolve;
        });

        doc.blockParsing(blockerPromise);
        return true;
      }
      return false;
    }
  );

  // Begin loading the page.
  let pagePromise = XPCShellContentUtils.loadContentPage(PAGE_URL, {
    remote: false,
  });

  // Wait for the document element to be inserted.
  await docElementPromise;
  // Wait for the /slow.js script request to initiate.
  await scriptRequestPromise;

  // Make some trips through the event loop to be safe.
  await delay();
  await delay();

  // Allow the /slow.js script request to complete.
  resolveResumeScriptPromise();

  // Make some trips through the event loop so that the <script> request
  // unblocks the parser.
  await delay();
  await delay();

  // Release the parser blocker added in the observer above.
  resolveBlockerPromise();

  // Make some trips through the event loop to allow the parser to
  // unblock.
  await delay();
  await delay();

  // Wait for the document to finish loading, and then close it.
  let page = await pagePromise;
  await page.close();
});

// Tests that blockParsing() also blocks DOMContentLoaded, and that
// DOMContentLoaded is fired once the blocker promise settles.
add_task(async function test_blockParsing_blocksDOMContentLoaded() {
  let resolveBlockerPromise;
  let dclFired = false;
  let dclPromise;

  let docElementPromise = TestUtils.topicObserved(
    "document-element-inserted",
    doc => {
      if (doc.location.href !== DCL_PAGE_URL) {
        return false;
      }

      let blockerPromise = new Promise(resolve => {
        resolveBlockerPromise = resolve;
      });
      doc.blockParsing(blockerPromise);

      dclPromise = new Promise(resolve => {
        doc.addEventListener(
          "DOMContentLoaded",
          () => {
            dclFired = true;
            resolve();
          },
          { once: true }
        );
      });
      return true;
    }
  );

  let pagePromise = XPCShellContentUtils.loadContentPage(DCL_PAGE_URL, {
    remote: false,
  });

  await docElementPromise;

  // Make some trips through the event loop to be safe.
  await delay();
  await delay();

  Assert.ok(!dclFired, "DOMContentLoaded is blocked while parsing is blocked");

  resolveBlockerPromise();
  await dclPromise;

  Assert.ok(dclFired, "DOMContentLoaded is fired once the blocker settles");

  let page = await pagePromise;
  await page.close();
});
