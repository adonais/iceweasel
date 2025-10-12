/* Any copyright is dedicated to the Public Domain.
 htt*p://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  HttpServer: "resource://testing-common/httpd.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TaskbarTabs: "resource:///modules/taskbartabs/TaskbarTabs.sys.mjs",
  TaskbarTabsPin: "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs",
  TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
});

sinon.stub(TaskbarTabsPin, "pinTaskbarTab");
sinon.stub(TaskbarTabsPin, "unpinTaskbarTab");

let gHttpServer = null;
let gManifest = null;

add_setup(function startServer() {
  gHttpServer = new HttpServer();
  gHttpServer.start(-1);
  registerCleanupFunction(() => {
    return new Promise(resolve => gHttpServer.stop(resolve));
  });

  gHttpServer.registerPathHandler(
    "/taskbartabs-manifest.json",
    (request, response) => {
      response.setStatusLine(
        null,
        gManifest ? 200 : 404,
        gManifest ? "OK" : "Not Found"
      );
      response.write(
        typeof gManifest === "string" ? gManifest : JSON.stringify(gManifest)
      );
      response.processAsync();
      response.finish();
    }
  );
});

registerCleanupFunction(async () => {
  sinon.restore();
  await TaskbarTabs.resetForTests();
});

function httpUrl(path) {
  return `http://localhost:${gHttpServer.identity.primaryPort}${path}`;
}

const gPageAction = document.getElementById("taskbar-tabs-button");

add_task(async function test_noManifest() {
  gManifest = null;
  await usingManifest((aWindow, aTaskbarTab) => {
    ok(true, "Created a taskbar tab with no manifest");
    // No manifest, so we use TaskbarTabsRegistry's default start URL.
    is(aTaskbarTab.startUrl, httpUrl(""), "Default start URL is used");
  });
});

add_task(async function test_emptyManifest() {
  gManifest = {};
  await usingManifest((aWindow, aTaskbarTab) => {
    ok(true, "Created a taskbar tab with an empty manifest");
    // The manifest was successfully requested, so ManifestObtainer made
    // a default for the missing value. Unlike TaskbarTabsRegistry, this
    // default _includes_ a trailing slash, which needs to be accounted
    // for.
    is(aTaskbarTab.startUrl, httpUrl("/"), "Default start URL is used");
  });
});

add_task(async function test_invalidManifest() {
  gManifest = "NOT a valid manifest!!";
  await usingManifest((aWindow, aTaskbarTab) => {
    ok(true, "Created a taskbar tab with an invalid manifest");
    // The manifest could be downloaded, and so (even though the 'JSON' is
    // wildly invalid) it uses ManifestObtainer's default.
    is(aTaskbarTab.startUrl, httpUrl("/"), "Default start URL is used");
  });
});

add_task(async function test_nameAndStartUrl() {
  gManifest = {
    name: "Taskbar Tabs test",
    start_url: "/example/path/string/here",
  };

  await usingManifest((aWindow, aTaskbarTab) => {
    is(
      aTaskbarTab.name,
      "Taskbar Tabs test",
      "Page action detected correct name"
    );
    is(
      aTaskbarTab.startUrl,
      httpUrl("/example/path/string/here"),
      "Page action detected correct start URL"
    );
  });
});

async function usingManifest(aCallback) {
  const location = httpUrl("/taskbartabs-manifest.json");

  await BrowserTestUtils.withNewTab(httpUrl("/"), async browser => {
    await SpecialPowers.spawn(browser, [location], async url => {
      content.document.body.innerHTML = `<link rel="manifest" href="${url}">`;
    });

    const tab = window.gBrowser.getTabForBrowser(browser);
    let result = await TaskbarTabs.moveTabIntoTaskbarTab(tab);

    const uri = Services.io.newURI(httpUrl("/"));
    const tt = await TaskbarTabs.findOrCreateTaskbarTab(uri, 0);
    is(
      await TaskbarTabsUtils.getTaskbarTabIdFromWindow(result.window),
      tt.id,
      "moveTabIntoTaskbarTab created a Taskbar Tab"
    );
    aCallback(result.window, tt);

    await TaskbarTabs.removeTaskbarTab(tt.id);
    await BrowserTestUtils.closeWindow(result.window);
  });
}
