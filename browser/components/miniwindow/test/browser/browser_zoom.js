/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.zoom.siteSpecific", false],
      ["browser.zoom.full", true],
    ],
  });
});

async function checkZoomShortcuts(cropped) {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let miniWin = cropped
    ? await popTabForTest(tab)
    : await popWholeTabForTest(tab);
  let mini = [...MiniWindowManager._miniwindows][0];

  try {
    await SimpleTest.promiseFocus(mini.browser);
    Assert.equal(mini.browser.fullZoom, 1, "Start at the default zoom level");

    for (let command of [
      "cmd_fullZoomReduce",
      "cmd_fullZoomEnlarge",
      "cmd_fullZoomReset",
    ]) {
      let keys = miniWin.document.querySelectorAll(
        `#mainKeyset > key[command="${command}"]`
      );
      Assert.greater(keys.length, 0, `${command} has keyboard shortcuts`);
      for (let key of keys) {
        Assert.notEqual(
          key.getAttribute("disabled"),
          "true",
          `${key.getAttribute("data-l10n-id")} is enabled`
        );
      }
    }

    Assert.equal(
      miniWin.document
        .getElementById("key_newNavigatorTab")
        .getAttribute("disabled"),
      "true",
      "Unrelated shortcuts remain disabled"
    );

    for (let key of ["-", "=", "+", "_"]) {
      let reducing = key === "-" || key === "_";
      EventUtils.synthesizeKey(key, { accelKey: true }, miniWin);
      await TestUtils.waitForCondition(
        () =>
          reducing ? mini.browser.fullZoom < 1 : mini.browser.fullZoom > 1,
        `Accel+${key} ${reducing ? "reduces" : "enlarges"} the page`
      );

      EventUtils.synthesizeKey("0", { accelKey: true }, miniWin);
      await TestUtils.waitForCondition(
        () => mini.browser.fullZoom === 1,
        "Accel+0 resets the zoom level"
      );
    }
  } finally {
    await miniWin.FullZoom.reset();
    let closed = BrowserTestUtils.domWindowClosed(miniWin);
    mini.close();
    await closed;
    assertNoMiniWindowsOpen();
    removeTestTabs();
  }
}

add_task(async function test_full_tab_zoom_shortcuts() {
  await checkZoomShortcuts(false);
});

add_task(async function test_cropped_zoom_shortcuts() {
  await checkZoomShortcuts(true);
});
