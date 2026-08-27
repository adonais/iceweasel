/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

requestLongerTimeout(2);

const kContentFileUrl = kBaseUrlForContent + "simple_page_ext.html";
const kIsMac = navigator.platform.indexOf("Mac") > -1;

// Custom key config.
const kCustomKey = "j";
const kCustomKeyDisabled = "y";
const kCustomKeyModifier = { accelKey: true, shiftKey: true, altKey: true };

const kKeyEventTests = [
  {
    description: "Paste",
    key: "v",
    modifiers: { accelKey: true },
    shouldSuppressContextMenu: true,
  },
  {
    description: "Paste without formatting",
    key: "v",
    modifiers: { accelKey: true, shiftKey: true },
    shouldSuppressContextMenu: true,
  },
  {
    description: "Paste without formatting (Mac only)",
    key: "v",
    modifiers: { accelKey: true, shiftKey: true, altKey: true },
    shouldSuppressContextMenu: kIsMac,
  },
  {
    description: "Custom XUL command",
    key: kCustomKey,
    modifiers: kCustomKeyModifier,
    // XUL key command should always not suppress context menu
    shouldSuppressContextMenu: false,
  },
  {
    description: "Custom disabled XUL command",
    key: kCustomKeyDisabled,
    modifiers: kCustomKeyModifier,
    // XUL key command should anot suppress context menu
    shouldSuppressContextMenu: false,
  },
];

async function promiseExecCommandFromKeyboardEvent(aBrowser, aKeyboardEvent) {
  const promiseEvent = SpecialPowers.spawn(
    aBrowser,
    [aKeyboardEvent],
    aKeyboardEvent => {
      return new Promise(resolve => {
        content.document.addEventListener(
          aKeyboardEvent,
          e => {
            info(`Received ${e.type} event`);
            e.preventDefault();
            resolve(Cu.waiveXrays(content.document).execCommand("paste"));
          },
          { once: true }
        );
      });
    }
  );
  // Ensure the event listener is registered on remote target.
  await SpecialPowers.spawn(aBrowser, [], async () => {
    await new Promise(resolve => {
      SpecialPowers.executeSoon(resolve);
    });
  });
  return promiseEvent;
}

async function runKeyEventTest(
  aKey,
  aModifiers,
  aKeyboardEventType,
  aShouldSuppressContextMenu
) {
  let listener = function (e) {
    if (e.target.getAttribute("id") == kPasteMenuPopupId) {
      ok(
        !aShouldSuppressContextMenu,
        `paste contextmenu should ${aShouldSuppressContextMenu ? "not " : ""}be shown`
      );
      SpecialPowers.executeSoon(async () => {
        await promiseDismissPasteButton();
        // XXX not sure why first promiseDismissPasteButton doesn't work on Windows opt build.
        await promiseDismissPasteButton();
      });
    }
  };
  document.addEventListener("popupshown", listener);

  info(`Write random text to clipboard`);
  await promiseWritingRandomTextToClipboard();

  await BrowserTestUtils.withNewTab(kContentFileUrl, async browser => {
    const resultPromise = promiseExecCommandFromKeyboardEvent(
      browser,
      aKeyboardEventType
    );
    info(`synthesizeAndWaitKey`);
    await EventUtils.synthesizeAndWaitKey(aKey, aModifiers);
    let result = await resultPromise;
    is(result, aShouldSuppressContextMenu, `Check execCommand("paste") result`);
  });

  document.removeEventListener("popupshown", listener);
}

function getModifierString(aModifiers) {
  let modifiers = [];
  for (const [key, value] of Object.entries(aModifiers)) {
    if (value) {
      modifiers.push(key.substring(0, key.indexOf("Key")));
    }
  }
  return modifiers.join(",");
}

function createKeyElementWithPasteCommand(
  aKeySetId,
  aId,
  aKey,
  aModifiers,
  aDisabled = false
) {
  let keyset = document.getElementById(aKeySetId);
  let key = document.createXULElement("key");
  key.setAttribute("id", aId);
  key.setAttribute("key", aKey);
  key.setAttribute("modifiers", getModifierString(aModifiers));
  key.setAttribute("command", "cmd_paste");
  if (aDisabled) {
    key.setAttribute("disabled", "true");
  }
  keyset.prepend(key);
  return key;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.events.async.enabled", true],
      // Disable the paste contextmenu delay to make the test run faster.
      ["security.dialog_enable_delay", 0],
    ],
  });

  // Setup custom XUL key command.

  let key = createKeyElementWithPasteCommand(
    "mainKeyset",
    "key_custom",
    kCustomKey,
    kCustomKeyModifier
  );

  let keyDisabled = createKeyElementWithPasteCommand(
    "mainKeyset",
    "key_custom_disabled",
    kCustomKeyDisabled,
    kCustomKeyModifier,
    true
  );

  registerCleanupFunction(async function () {
    key.remove();
    keyDisabled.remove();
  });
});

kKeyEventTests.forEach(keyEventTest => {
  describe(`Test ${keyEventTest.description}`, () => {
    it("keydown", async () => {
      await runKeyEventTest(
        keyEventTest.key,
        keyEventTest.modifiers,
        "keydown",
        keyEventTest.shouldSuppressContextMenu
      );
    });

    it("keyup", async () => {
      await runKeyEventTest(
        keyEventTest.key,
        keyEventTest.modifiers,
        "keyup",
        false /* keyup event should not suppress contextmenu */
      );
    });
  });
});
