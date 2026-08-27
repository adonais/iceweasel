/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const kContentFileUrl = kBaseUrlForContent + "simple_page_ext.html";

function promiseExecCommandPaste(aBrowser) {
  return SpecialPowers.spawn(aBrowser, [], () => {
    let clipboardData = null;
    content.document.addEventListener(
      "paste",
      e => {
        clipboardData = e.clipboardData.getData("text/plain");
      },
      { once: true }
    );

    content.document.notifyUserGestureActivation();
    const execCommandResult = Cu.waiveXrays(content.document).execCommand(
      "paste"
    );

    return { execCommandResult, clipboardData };
  });
}

function execCommandPasteWithoutWait(aBrowser) {
  return SpecialPowers.spawn(aBrowser, [], () => {
    SpecialPowers.executeSoon(() => {
      content.document.notifyUserGestureActivation();
      const execCommandResult = Cu.waiveXrays(content.document).execCommand(
        "paste"
      );
    });
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.events.async.enabled", true],
      // Disable the paste contextmenu delay to make the test run faster.
      ["security.dialog_enable_delay", 0],
    ],
  });
});

// Test for https://bugzilla.mozilla.org/show_bug.cgi?id=2021248.
add_task(async function test_spin_event_loop() {
  info(`Randomized text to avoid overlappings with other tests`);
  const clipboardText = await promiseWritingRandomTextToClipboard();

  await BrowserTestUtils.withNewTab(kContentFileUrl, async function (aBrowser) {
    info("Setup test page for paste command test");
    let promise = SpecialPowers.spawn(
      aBrowser,
      [clipboardText],
      clipboardText => {
        const textarea = content.document.createElement("textarea");
        content.document.body.appendChild(textarea);
        textarea.focus();

        textarea.addEventListener("keydown", e => {
          info(`Got keydown event with key=${e.key}`);
          let timerRan = false;
          content.setTimeout(() => {
            timerRan = true;
          }, 0);
          if (Cu.waiveXrays(content.document).execCommand("paste")) {
            e.preventDefault();
          }
          ok(!timerRan, "timer should not have run yet");
        });

        return new Promise(resolve => {
          const textarea = content.document.querySelector("textarea");
          textarea.addEventListener("keyup", e => {
            info(`Got keyup event with key=${e.key}`);
            is(textarea.value, clipboardText, "check <textarea> value");
            resolve();
          });
        });
      }
    );
    // Ensure the event listener is registered in remote before synthesizing key event.
    await SpecialPowers.spawn(aBrowser, [], () => {
      return new Promise(resolve => {
        SpecialPowers.executeSoon(resolve);
      });
    });

    info(`Synthesize key event to trigger execCommand("paste")`);
    EventUtils.synthesizeKey("v", { accelKey: true });
    await promise;
  });
});
