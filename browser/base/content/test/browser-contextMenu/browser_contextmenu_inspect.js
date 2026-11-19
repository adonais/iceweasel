/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MiniWindowManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/miniwindow/MiniWindowManager.sys.mjs"
);

/**
 * Check that we show the inspect item(s) as appropriate.
 */
add_task(async function test_contextmenu_inspect() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["devtools.selfxss.count", 0],
      ["devtools.everOpened", false],
    ],
  });
  let contextMenu = document.getElementById("contentAreaContextMenu");
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    for (let [pref, value, expectation] of [
      ["devtools.selfxss.count", 10, true],
      ["devtools.selfxss.count", 0, false],
      ["devtools.everOpened", false, false],
      ["devtools.everOpened", true, true],
    ]) {
      await SpecialPowers.pushPrefEnv({
        set: [["devtools.selfxss.count", value]],
      });
      is(contextMenu.state, "closed", "checking if popup is closed");
      let promisePopupShown = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popupshown"
      );
      let promisePopupHidden = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popuphidden"
      );
      await BrowserTestUtils.synthesizeMouse(
        "body",
        2,
        2,
        { type: "contextmenu", button: 2 },
        browser
      );
      await promisePopupShown;
      let inspectItem = document.getElementById("context-inspect");
      ok(
        !inspectItem.hidden,
        `Inspect should be shown (pref ${pref} is ${value}).`
      );
      let inspectA11y = document.getElementById("context-inspect-a11y");
      is(
        inspectA11y.hidden,
        !expectation,
        `A11y should be ${
          expectation ? "visible" : "hidden"
        } (pref ${pref} is ${value}).`
      );
      contextMenu.hidePopup();
      await promisePopupHidden;
    }
  });
});

add_task(async function test_contextmenu_inspect_system_principal() {
  let contextMenu = document.getElementById("contentAreaContextMenu");
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      const div = content.document.createElement("div");
      div.id = "target";
      div.textContent = "target";
      content.document.body.prepend(div);
    });
    await SpecialPowers.pushPrefEnv({
      set: [["devtools.chrome.enabled", false]],
    });
    let defaultBranch = Services.prefs.getDefaultBranch("");
    let defaultValue = defaultBranch.getBoolPref("devtools.chrome.enabled");
    defaultBranch.setBoolPref("devtools.chrome.enabled", false);
    registerCleanupFunction(() => {
      Services.prefs.unlockPref("devtools.chrome.enabled");
      defaultBranch.setBoolPref("devtools.chrome.enabled", defaultValue);
    });
    for (let locked of [true, false]) {
      if (locked) {
        Services.prefs.lockPref("devtools.chrome.enabled");
      } else {
        Services.prefs.unlockPref("devtools.chrome.enabled");
      }
      let promisePopupShown = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popupshown"
      );
      let promisePopupHidden = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popuphidden"
      );
      await BrowserTestUtils.synthesizeMouse(
        "#target",
        2,
        2,
        { type: "contextmenu", button: 2 },
        browser
      );
      await promisePopupShown;
      is(
        document.getElementById("context-inspect").hidden,
        locked,
        `Inspect should be ${locked ? "hidden" : "shown"} when devtools.chrome.enabled is ${locked ? "" : "not "}locked to false.`
      );
      contextMenu.hidePopup();
      await promisePopupHidden;
    }
  });
});

add_task(async function test_contextmenu_inspect_mini_window() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["devtools.selfxss.count", 10],
      ["devtools.everOpened", true],
      ["browser.mini-window.enabled", true],
    ],
  });

  let contextMenu = document.getElementById("contentAreaContextMenu");

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<meta charset=utf8>hello"
  );

  // Sanity check
  is(contextMenu.state, "closed", "popup is closed at first");
  let promisePopupShown = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouse(
    "body",
    2,
    2,
    { type: "contextmenu", button: 2 },
    tab.linkedBrowser
  );
  await promisePopupShown;
  let inspectItem = document.getElementById("context-inspect");
  ok(!inspectItem.hidden, `Inspect should be shown`);
  let inspectA11y = document.getElementById("context-inspect-a11y");
  ok(!inspectA11y.hidden, `A11y should be shown`);

  let promisePopupHidden = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  contextMenu.hidePopup();
  await promisePopupHidden;
  const miniWindow = await openTabInMiniWindow(tab);
  const miniWindowContextMenu = miniWindow.document.getElementById(
    "contentAreaContextMenu"
  );
  // Sanity check
  is(miniWindowContextMenu.state, "closed", "popup is closed at first");
  promisePopupShown = BrowserTestUtils.waitForEvent(
    miniWindowContextMenu,
    "popupshown"
  );
  await BrowserTestUtils.synthesizeMouse(
    "body",
    2,
    2,
    { type: "contextmenu", button: 2 },
    miniWindow.gBrowser.selectedBrowser
  );
  await promisePopupShown;
  inspectItem = miniWindow.document.getElementById("context-inspect");
  ok(inspectItem.hidden, `Inspect should be hidden in mini window`);
  inspectA11y = miniWindow.document.getElementById("context-inspect-a11y");
  ok(inspectA11y.hidden, `A11y should be hidden in mini window`);
  promisePopupHidden = BrowserTestUtils.waitForEvent(
    miniWindowContextMenu,
    "popuphidden"
  );
  miniWindowContextMenu.hidePopup();
  await promisePopupHidden;

  let mini = [...MiniWindowManager._miniwindows][0];
  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWindow);
  BrowserTestUtils.removeTab(tab);
});

async function openTabInMiniWindow(tab) {
  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let winPromise = MiniWindowManager.popTab(tab);
  let miniWin = await opened;
  await winPromise;
  return miniWin;
}
