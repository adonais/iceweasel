/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;

async function testSlowScriptNotification({ description, url, embedded }) {
  Services.fog.testResetFOG();

  const notificationPromise = BrowserTestUtils.waitForGlobalNotificationBar(
    window,
    "process-hang"
  );

  // Avoid waiting for load because this test intentionally hangs the viewer.
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url,
    waitForLoad: false,
  });

  try {
    const notification = await notificationPromise;
    ok(true, `${description}: the slow script notification must be displayed`);

    const stopButton =
      notification.buttonContainer.querySelector("[label='Stop']");
    ok(stopButton, `${description}: the notification must have a Stop button`);
    stopButton.click();

    const events = Glean.slowScriptWarning.shownContent.testGetValue();
    is(events?.length, 1, `${description}: one hang event must be recorded`);
    is(
      events?.[0]?.extra.uri_type,
      "content",
      `${description}: the PDF script must be classified as content`
    );

    const target = embedded
      ? tab.linkedBrowser.browsingContext.children[0]
      : tab.linkedBrowser;
    ok(target, `${description}: the PDF browsing context must exist`);

    await SpecialPowers.spawn(target, [], () => {});
    ok(true, `${description}: the viewer must be responsive again`);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

// The PDF contains an infinite loop.
add_task(async function test_slow_script_notification() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["pdfjs.enableScripting", true],
      ["dom.ipc.reportProcessHangs", true],
      ["dom.max_script_run_time", 2],
      ["dom.max_script_run_time.require_critical_input", false],
    ],
  });

  try {
    await testSlowScriptNotification({
      description: "Top-level PDF",
      url: TESTROOT + "file_pdfjs_slow_script.pdf",
      embedded: false,
    });
    await testSlowScriptNotification({
      description: "Embedded PDF",
      url: TESTROOT + "file_pdfjs_slow_script.html",
      embedded: true,
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});
