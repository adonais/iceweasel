/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../head_subframes_process_isolation.js */

// With extensions.webextensions.remote=false the extension process is completely
// disabled, and so extension subframes are expected to be loaded in the same
// process of their corresponding parent frame (including when embedded in a
// privilegedabout page).

Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "../head_subframes_process_isolation.js",
  this
);

const PRIVILEGED_ABOUT_PAGE_NAME =
  "test-separated-extension-subframes-remote-disabled-privilegedabout";

const promiseTestAboutPageRegistered = registerPrivilegedAboutTestPage(
  PRIVILEGED_ABOUT_PAGE_NAME,
  getRootDirectory(gTestPath) + "../data/file_privilegedabout_page.html"
);

add_setup(function () {
  is(
    WebExtensionPolicy.useRemoteWebExtensions,
    false,
    "This test file expects extensions.webextensions.remote=false to keep extensions running in-process"
  );
});

add_task(async function test_extension_subframe_in_https_page() {
  await assertExtensionSubframeProcess({
    parentURL: "https://example.com",
    parentRemoteType: "webIsolated",
    expectInExtensionProcess: false,
  });
});

add_task(async function test_extension_subframe_in_privilegedabout_page() {
  await promiseTestAboutPageRegistered;
  await assertExtensionSubframeProcess({
    parentURL: `about:${PRIVILEGED_ABOUT_PAGE_NAME}`,
    parentRemoteType: "privilegedabout",
    expectInExtensionProcess: false,
  });
});
