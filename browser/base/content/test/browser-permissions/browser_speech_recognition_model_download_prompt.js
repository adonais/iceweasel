/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verify that SpeechRecognition.install() shows a permission doorhanger and
// that accepting it resolves the promise with true, while dismissing (via the
// Not Now button or the Escape key) resolves with false and removes the
// notification. Also verifies the prompt is skipped entirely once the model
// is already installed.

const ORIGIN = "https://example.com";
const PAGE =
  getRootDirectory(gTestPath).replace("chrome://mochitests/content", ORIGIN) +
  "empty.html";
const MODEL_DOWNLOAD_NOTIFICATION_ID = "speech-recognition-model-download";
const MODEL_DOWNLOAD_PROGRESS_NOTIFICATION_ID =
  "speech-recognition-model-download-progress";

async function triggerInstall(browser) {
  await SpecialPowers.spawn(browser, [], () => {
    // install() requires transient user activation (it can trigger a large
    // download); synthesize it since this call isn't from a real user gesture.
    content.document.notifyUserGestureActivation();
    // Do not await — we need to return immediately so the popup can appear.
    content.SpeechRecognition.install({
      langs: ["en-US"],
      processLocally: true,
    });
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["media.webspeech.recognition.enable", true]],
  });
});

add_task(async function test_install_shows_doorhanger() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    let popupShown = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popupshown"
    );

    await triggerInstall(browser);
    await popupShown;

    let notification = PopupNotifications.getNotification(
      MODEL_DOWNLOAD_NOTIFICATION_ID,
      browser
    );
    ok(notification, "speech-recognition-model-download notification exists");

    // Dismiss without downloading.
    let popupHidden = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popuphidden"
    );
    notification.remove();
    await popupHidden;
  });
});

// Asserts that a content-process install() call resolves with `false`.
// `installResultPromise` must be the raw promise returned from within a
// SpecialPowers.spawn task, so the settlement happens in the content process.
async function assertInstallResolvesFalse(installResultPromise, why) {
  let result;
  try {
    result = await installResultPromise;
  } catch (e) {
    ok(false, `install() unexpectedly rejected in content ${why}: ${e}`);
    throw e;
  }
  is(result, false, `install() resolves false in content ${why}`);
}

async function assertNotificationGone(browser, why) {
  ok(
    !PopupNotifications.getNotification(
      MODEL_DOWNLOAD_NOTIFICATION_ID,
      browser
    ),
    `notification is actually removed (not just dismissed) ${why}`
  );
}

add_task(async function test_install_not_now_resolves_false() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    let popupShown = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popupshown"
    );

    let installResult = SpecialPowers.spawn(browser, [], async () => {
      content.document.notifyUserGestureActivation();
      return content.SpeechRecognition.install({
        langs: ["en-US"],
        processLocally: true,
      });
    });

    await popupShown;

    let notification = PopupNotifications.getNotification(
      MODEL_DOWNLOAD_NOTIFICATION_ID,
      browser
    );
    ok(notification, "Notification present before dismissal");

    let popupHidden = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popuphidden"
    );
    let popup = document.getElementById(
      "speech-recognition-model-download-notification"
    );
    await popup.secondaryButton.updateComplete;
    popup.secondaryButton.click();
    await popupHidden;

    await assertNotificationGone(browser, "after clicking Not Now");
    await assertInstallResolvesFalse(installResult, "after clicking Not Now");
  });
});

// Verify that dismissing the prompt with the Escape key resolves install()
// with false and removes the notification, same as clicking Not Now.
add_task(async function test_install_escape_resolves_false() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    let popupShown = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popupshown"
    );

    let installResult = SpecialPowers.spawn(browser, [], async () => {
      content.document.notifyUserGestureActivation();
      return content.SpeechRecognition.install({
        langs: ["en-US"],
        processLocally: true,
      });
    });

    await popupShown;

    let notification = PopupNotifications.getNotification(
      MODEL_DOWNLOAD_NOTIFICATION_ID,
      browser
    );
    ok(notification, "Notification present before dismissal");

    let popupHidden = BrowserTestUtils.waitForEvent(
      PopupNotifications.panel,
      "popuphidden"
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await popupHidden;

    // Let any pending _update() run before asserting the notification stays gone.
    await TestUtils.waitForTick();
    await assertNotificationGone(browser, "after pressing Escape");
    Assert.notEqual(
      PopupNotifications.panel.state,
      "open",
      "panel did not reopen after Escape"
    );

    await assertInstallResolvesFalse(installResult, "after pressing Escape");
  });
});

add_task(async function test_overlapping_installs_share_prompt_and_result() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.modelHub.testing", true],
      ["media.webspeech.recognition.model-download.prompt.testing", false],
      ["media.navigator.permission.disabled", false],
    ],
  });

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    let popupShownCount = 0;
    let onPopupShown = () => {
      popupShownCount++;
    };
    PopupNotifications.panel.addEventListener("popupshown", onPopupShown);

    try {
      let popupShown = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );

      await SpecialPowers.spawn(browser, [], () => {
        content.document.notifyUserGestureActivation();
        content.overlappingSpeechInstalls = [
          content.SpeechRecognition.install({
            langs: ["fr-FR"],
            processLocally: true,
          }),
        ];
      });
      await popupShown;

      await SpecialPowers.spawn(browser, [], () => {
        for (let i = 0; i < 2; i++) {
          content.document.notifyUserGestureActivation();
          content.overlappingSpeechInstalls.push(
            content.SpeechRecognition.install({
              langs: ["fr-FR"],
              processLocally: true,
            })
          );
        }
      });

      await TestUtils.waitForTick();
      is(popupShownCount, 1, "overlapping install() calls share one prompt");

      let popup = document.getElementById(
        "speech-recognition-model-download-notification"
      );
      await popup.button.updateComplete;
      popup.button.click();

      let results = await SpecialPowers.spawn(browser, [], () =>
        Promise.all(content.overlappingSpeechInstalls)
      );
      is(
        results.join(","),
        "true,true,true",
        "all overlapping install() calls resolve with the same result"
      );

      let progressNotification = PopupNotifications.getNotification(
        MODEL_DOWNLOAD_PROGRESS_NOTIFICATION_ID,
        browser
      );
      if (progressNotification) {
        let popupHidden;
        if (PopupNotifications.panel.state != "closed") {
          popupHidden = BrowserTestUtils.waitForEvent(
            PopupNotifications.panel,
            "popuphidden"
          );
        }
        progressNotification.remove();
        if (popupHidden) {
          await popupHidden;
        }
      }
    } finally {
      PopupNotifications.panel.removeEventListener("popupshown", onPopupShown);
    }
  });

  await SpecialPowers.popPrefEnv();
});

// install() must skip the permission prompt entirely once the model is
// already installed: there is nothing to download, so nothing to consent to.
add_task(async function test_install_skips_prompt_when_already_installed() {
  // Mock backend; auto-allow the first install so the model becomes installed.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.modelHub.testing", true],
      ["media.webspeech.recognition.model-download.prompt.testing", true],
      ["media.navigator.permission.disabled", true],
    ],
  });

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    await SpecialPowers.spawn(browser, [], () => {
      content.document.notifyUserGestureActivation();
      return content.SpeechRecognition.install({
        langs: ["en-US"],
        processLocally: true,
      });
    });
    let status = await SpecialPowers.spawn(browser, [], () =>
      content.SpeechRecognition.available({
        langs: ["en-US"],
        processLocally: true,
      })
    );
    is(status, "available", "model reports available after first install");
  });

  // Real prompt path. The model is now installed, so a second install() must
  // resolve true without ever showing the permission prompt.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["media.webspeech.recognition.model-download.prompt.testing", false],
      ["media.navigator.permission.disabled", false],
    ],
  });

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    let popupShown = false;
    let listener = () => {
      popupShown = true;
    };
    PopupNotifications.panel.addEventListener("popupshown", listener);

    let installed = await SpecialPowers.spawn(browser, [], () => {
      content.document.notifyUserGestureActivation();
      return content.SpeechRecognition.install({
        langs: ["en-US"],
        processLocally: true,
      });
    });

    PopupNotifications.panel.removeEventListener("popupshown", listener);

    ok(installed, "install() resolves true for an already-installed model");
    ok(
      !popupShown,
      "install() must not show the prompt when already installed"
    );
  });

  // One pop per pushPrefEnv() above, not a copy-paste duplicate.
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});
