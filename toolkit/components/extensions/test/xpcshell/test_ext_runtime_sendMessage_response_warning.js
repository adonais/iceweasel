"use strict";

// Regression Test for Bug 1877223: Warning message should emit to console when
// message sent to a message listener, and sender does not receive the
// expected response returned by sendResponse. If listener function passed to
// browser.runtime.onMessage.addListener() is async, sendResponse will be ignored.

function expectedWarning(extension) {
  return (
    "sendResponse() has no effect because the runtime.onMessage handler " +
    `has already returned a Promise. (extension: ${extension.id})`
  );
}

async function collectConsoleMessages(extension, finishEventName) {
  const { messages } = await promiseConsoleOutput(async () => {
    let page = await ExtensionTestUtils.loadContentPage(
      `moz-extension://${extension.uuid}/page.html`,
      { extension }
    );

    await extension.awaitFinish(finishEventName);

    await page.close();
  });

  return messages;
}

add_task(async function test_emit_warning_before_promise_returns() {
  let extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.runtime.onMessage.addListener(
        async (msg, sender, sendResponse) => {
          sendResponse("Hi from listener");
        }
      );
    },
    files: {
      "page.html": `<!DOCTYPE html><meta charset="utf-8"><script src="page.js"></script>`,
      "page.js": async () => {
        await browser.runtime.sendMessage("ping");
        browser.test.notifyPass("message-sent-to-listener");
      },
    },
  });

  await extension.startup();

  let messages = await collectConsoleMessages(
    extension,
    "message-sent-to-listener"
  );

  ok(
    messages.some(m => m.errorMessage?.includes(expectedWarning(extension))),
    "sendResponse warning logged when sendResponse is called before the listener's promise returns"
  );

  await extension.unload();
});

add_task(async function test_emit_warning_after_promise_returns() {
  let extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.runtime.onMessage.addListener(
        async (msg, sender, sendResponse) => {
          await Promise.resolve();
          sendResponse("Hi from listener");
        }
      );
    },
    files: {
      "page.html": `<!DOCTYPE html><meta charset="utf-8"><script src="page.js"></script>`,
      "page.js": async () => {
        await browser.runtime.sendMessage("ping");
        browser.test.notifyPass("message-sent-to-listener");
      },
    },
  });

  await extension.startup();

  let messages = await collectConsoleMessages(
    extension,
    "message-sent-to-listener"
  );

  ok(
    messages.some(m => m.errorMessage?.includes(expectedWarning(extension))),
    "sendResponse warning logged when sendResponse is called after the listener's promise returns"
  );

  await extension.unload();
});

add_task(async function test_send_response_not_ignored_and_no_warning_logged() {
  let extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        setTimeout(() => sendResponse("Hi from listener"), 0);
        return true;
      });
    },
    files: {
      "page.html": `<!DOCTYPE html><meta charset="utf-8"><script src="page.js"></script>`,
      "page.js": async () => {
        let response = await browser.runtime.sendMessage("ping");
        browser.test.assertEq(
          "Hi from listener",
          response,
          "sendResponse's response reaches the caller"
        );
        browser.test.notifyPass("message-sent-to-listener");
      },
    },
  });

  await extension.startup();

  let messages = await collectConsoleMessages(
    extension,
    "message-sent-to-listener"
  );

  ok(
    !messages.some(m =>
      m.errorMessage?.includes("sendResponse() has no effect")
    ),
    "No sendResponse warning logged when the listener correctly uses return true without async"
  );

  await extension.unload();
});
