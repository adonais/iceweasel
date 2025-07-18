/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bug 1896175 - Testing canvas randomization with read canvas permission granted.
 * Bug 1918690 - Extend canvas randomization permission test
 */

const emptyPage =
  getRootDirectory(gTestPath).replace(
    "chrome://mochitests/content",
    "https://example.com"
  ) + "empty.html";

function getImageData(tab, isOffscreen, method) {
  const extractCanvas = function (isOffscreen, method) {
    const canvas = isOffscreen
      ? new OffscreenCanvas(3, 1)
      : document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!isOffscreen) {
      canvas.width = 3;
      canvas.height = 1;
    }

    ctx.fillStyle = "rgb(255, 0, 0)";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 255, 0)";
    ctx.fillRect(1, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.fillRect(2, 0, 1, 1);

    if (method === "getImageData") {
      return ctx.getImageData(0, 0, 3, 1).data.join(",");
    } else if (method === "toDataURL") {
      return canvas.toDataURL("image/png", 1);
    } else if (method === "toBlob") {
      return new Promise((resolve, reject) => {
        if (isOffscreen) {
          canvas.toBlob().then(resolve, reject);
        } else {
          canvas.toBlob(resolve, "image/png", 1);
        }
      }).then(blob => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        const { promise, resolve, reject } = Promise.withResolvers();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        return promise;
      });
    } else if (method === "convertToBlob") {
      return canvas.convertToBlob().then(blob => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        const { promise, resolve, reject } = Promise.withResolvers();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        return promise;
      });
    }

    throw new Error("Unknown method");
  };

  const extractCanvasExpr = `(${extractCanvas.toString()})(${isOffscreen}, "${method}");`;

  return SpecialPowers.spawn(
    tab.linkedBrowser,
    [extractCanvasExpr],
    async funccode => content.eval(funccode)
  );
}

// Test cases: [isOffscreen, method, true value]
const TEST_CASES = [
  // HTMLCanvasElement
  [false, "getImageData", null],
  [false, "toDataURL", null],
  [false, "toBlob", null],
  // OffscreenCanvas
  [true, "getImageData", null],
  [true, "toBlob", null],
  [true, "convertToBlob", null],
];

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.wait300msAfterTabSwitch", true],
      ["privacy.resistFingerprinting", false],
      ["privacy.fingerprintingProtection", false],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: emptyPage,
    forceNewProcess: true,
  });

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test_case = TEST_CASES[i];
    const [isOffscreen, method] = test_case;
    const readback = await getImageData(tab, isOffscreen, method);
    if (readback == null || !readback.length) {
      throw new Error(
        `Failed to get the initial readback for ${
          isOffscreen ? "Offscreen Canvas" : "HTML Canvas"
        } ${method} got ${readback}`
      );
    }
    test_case[2] = readback;
  }

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

async function runTest(permissionGranted, isRFP) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.resistFingerprinting", isRFP],
      ["privacy.fingerprintingProtection", !isRFP],
      [
        "privacy.fingerprintingProtection.overrides",
        "-AllTargets,+CanvasRandomization,+CanvasImageExtractionPrompt",
      ],
    ],
  });

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: emptyPage,
    forceNewProcess: true,
  });

  if (permissionGranted) {
    await SpecialPowers.pushPermissions([
      {
        type: "canvas",
        allow: true,
        context: emptyPage,
      },
    ]);
  }

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test_case = TEST_CASES[i];
    const [isOffscreen, method, trueValue] = test_case;
    const readback = await getImageData(tab, isOffscreen, method);
    const message = `PermissionGranted: ${permissionGranted}; Method: ${method}; Offscreen: ${isOffscreen}; Image should be ${
      permissionGranted ? "the same" : "different"
    }`;
    permissionGranted
      ? is(readback, trueValue, message)
      : isnot(readback, trueValue, message);
  }

  if (permissionGranted) {
    await SpecialPowers.popPermissions();
  }
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_rfp_no_permission() {
  await runTest(false, true);
});

add_task(async function test_rfp_permission() {
  await runTest(true, true);
});

add_task(async function test_fpp_no_permission() {
  await runTest(false, false);
});

add_task(async function test_fpp_permission() {
  await runTest(true, false);
});
