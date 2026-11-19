/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_subframes_process_isolation.js",
  this
);

const PRIVILEGED_ABOUT_PAGE_NAME =
  "test-extension-subframes-process-isolation-privilegedabout";

const promiseTestAboutPageRegistered = registerPrivilegedAboutTestPage(
  PRIVILEGED_ABOUT_PAGE_NAME,
  getRootDirectory(gTestPath) + "data/file_privilegedabout_page.html"
);

add_setup(function () {
  is(
    WebExtensionPolicy.useRemoteWebExtensions,
    true,
    "This test file expects extensions to run in their own extension content process"
  );
});

add_task(async function test_extension_subframe_in_https_page() {
  await assertExtensionSubframeProcess({
    parentURL: "https://example.com",
    parentRemoteType: "webIsolated",
    expectInExtensionProcess: false,
  });
});

add_task(async function test_extension_subframe_in_file_page() {
  await assertExtensionSubframeProcess({
    parentURL: Services.io.newFileURI(
      new FileUtils.File(getTestFilePath("data/file_dummy.html"))
    ).spec,
    parentRemoteType: "file",
    expectInExtensionProcess: false,
  });
});

add_task(async function test_extension_subframe_in_privilegedmozilla_page() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.remote.separatePrivilegedMozillaWebContentProcess", true],
      ["browser.tabs.remote.separatedMozillaDomains", "example.com"],
    ],
  });
  await assertExtensionSubframeProcess({
    parentURL: "https://example.com",
    parentRemoteType: "privilegedmozilla",
    expectInExtensionProcess: false,
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_extension_subframe_in_privilegedabout_page() {
  await promiseTestAboutPageRegistered;
  await assertExtensionSubframeProcess({
    parentURL: `about:${PRIVILEGED_ABOUT_PAGE_NAME}`,
    parentRemoteType: "privilegedabout",
    expectInExtensionProcess: true,
  });
});

add_task(async function test_multiple_subframes_same_extension_process() {
  await promiseTestAboutPageRegistered;
  const extension = loadTestExtensionWithWebAccessibleResources();
  await extension.startup();
  const extensionPageURL = `moz-extension://${extension.uuid}/page.html`;

  const aboutURL = `about:${PRIVILEGED_ABOUT_PAGE_NAME}`;
  const firstTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    aboutURL
  );
  const secondTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    aboutURL
  );
  // Sanity checks (ensure about: pages are running in the expected child process).
  assertDOMProcessRemoteType({
    childID:
      firstTab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess
        .childID,
    expectedRemoteType: "privilegedabout",
    msg: "first tab about: page process got the expected remoteType",
  });
  assertDOMProcessRemoteType({
    childID:
      secondTab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess
        .childID,
    expectedRemoteType: "privilegedabout",
    msg: "second tab about: page process got the expected remoteType",
  });

  const firstChildID = await loadSubframeAndGetChildID(
    firstTab.linkedBrowser,
    extensionPageURL
  );
  const secondChildID = await loadSubframeAndGetChildID(
    secondTab.linkedBrowser,
    extensionPageURL
  );

  if (SpecialPowers.useRemoteSubframes) {
    assertDOMProcessRemoteType({
      childID: firstChildID,
      expectedRemoteType: "extension",
      msg: "first tab moz-extension:// subframe process got the expected remoteType",
    });
    assertDOMProcessRemoteType({
      childID: secondChildID,
      expectedRemoteType: "extension",
      msg: "second tab moz-extension:// subframe process got the expected remoteType",
    });
    is(
      firstChildID,
      secondChildID,
      "both extension subframes should share one extension process"
    );
  } else {
    // This branch is only expected to be hit when the test runs with fission disabled.
    assertDOMProcessRemoteType({
      childID: firstChildID,
      expectedRemoteType: "privilegedabout",
      msg: "first tab moz-extension:// subframe process got the expected remoteType",
    });
    assertDOMProcessRemoteType({
      childID: secondChildID,
      expectedRemoteType: "privilegedabout",
      msg: "second tab moz-extension:// subframe process got the expected remoteType",
    });
    is(
      firstChildID,
      firstTab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess
        .childID,
      "First extension subframe should share the parent frame process"
    );
    is(
      secondChildID,
      secondTab.linkedBrowser.browsingContext.currentWindowGlobal.domProcess
        .childID,
      "Second extension subframe should share the parent frame process"
    );
  }

  await BrowserTestUtils.removeTab(firstTab);
  await BrowserTestUtils.removeTab(secondTab);

  await extension.unload();
});
