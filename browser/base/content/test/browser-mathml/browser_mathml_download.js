/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL =
  "http://mochi.test:8888/browser/browser/base/content/test/browser-mathml/download_page_mathml.html";

function setupMockFilePicker() {
  const MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init(window);

  let promise = new Promise(resolve => {
    MockFilePicker.showCallback = fp => {
      setTimeout(() => resolve(fp.defaultString), 0);
      return Ci.nsIFilePicker.returnCancel;
    };
  });

  return { MockFilePicker, promise };
}

add_task(async function setup_prefs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.download.always_ask_before_handling_new_types", false],
      ["browser.download.useDownloadDir", false],
      ["mathml.a.element.enabled", true],
    ],
  });
});

// Click MathML link
add_task(async function test_mathml_click_download() {
  const { MockFilePicker, promise } = setupMockFilePicker();

  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#mathml-link",
        {},
        browser
      );
      let filename = await promise;
      is(filename, "mathml_test.txt", "Download filename matches attribute.");
    });
  } finally {
    MockFilePicker.cleanup();
  }
});

// Save MathML Link As
add_task(async function test_mathml_savelinkas_download() {
  const { MockFilePicker, promise } = setupMockFilePicker();

  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
      let menu = document.getElementById("contentAreaContextMenu");
      let popupShown = BrowserTestUtils.waitForEvent(menu, "popupshown");

      BrowserTestUtils.synthesizeMouse(
        "#mathml-link",
        2,
        2,
        { type: "contextmenu", button: 2 },
        browser
      );
      await popupShown;

      let popupHidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
      menu.activateItem(document.getElementById("context-savelink"));
      await popupHidden;

      let filename = await promise;
      is(
        filename,
        "mathml_test.txt",
        "Save Link As honors download attribute."
      );
    });
  } finally {
    MockFilePicker.cleanup();
  }
});
