/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Bugs 1950310 and 2011806: on macOS artifact builds, XUL comes from a CI
// build using Nightly branding while the child executables on disk were laid
// down by the local build, so their names don't match. The launcher works
// around that by reading each helper's Info.plist.

// These tests check that child processes launch, however it does not verify
// the resolved paths. On a build that is not an artifact build, the fallback
// to the branding macros produces the same string, so these tasks pass either
// way. The paths themselves are checked in
// ipc/glue/test/gtest/TestMacChildProcessPaths.cpp.

// Verify a content process can be launched with plist path resolution.
add_task(async function test_content_process() {
  await BrowserTestUtils.withNewTab("https://example.com", async () => {
    let procInfo = await ChromeUtils.requestProcInfo();
    let contentProcesses = procInfo.children.filter(p => p.type === "web");
    Assert.greater(
      contentProcesses.length,
      0,
      "At least one content process is running"
    );
  });
});

// Verify a GPU process can be launched with plist path resolution. The GPU
// process is force-enabled via layers.gpu-process.force-enabled in the
// manifest. Headless mode force disables the GPU process regardless of that
// pref (see gfxPlatform::InitGPUProcessPrefs), so there is nothing to check.
add_task(async function test_gpu_process() {
  let gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);
  if (gfxInfo.isHeadless) {
    ok(true, "Headless mode disables the GPU process, skipping");
    return;
  }

  let hasGPU = (await ChromeUtils.requestProcInfo()).children.some(
    p => p.type === "gpu"
  );
  Assert.ok(hasGPU, "GPU process is running");
});

// Verify a GMP process can be launched with plist path resolution.
add_task(async function test_gmp_process() {
  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    // Requesting ClearKey MediaKeys triggers a GMP process launch.
    await SpecialPowers.spawn(browser, [], async () => {
      let config = [
        {
          initDataTypes: ["webm"],
          videoCapabilities: [{ contentType: 'video/webm; codecs="vp9"' }],
        },
      ];
      let access = await content.navigator.requestMediaKeySystemAccess(
        "org.w3.clearkey",
        config
      );
      await access.createMediaKeys();
    });

    let hasGMP = (await ChromeUtils.requestProcInfo()).children.some(
      p => p.type === "gmpPlugin"
    );
    Assert.ok(hasGMP, "GMP process is running");
  });
});
