/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
const { SmartWindowTelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/SmartWindowTelemetry.sys.mjs"
);

PromiseTestUtils.allowMatchingRejectionsGlobally(
  /conversationState\.map is not a function/
);

function resetTelemetryState() {
  Services.fog.testResetFOG();
  SmartWindowTelemetry._resetClientErrorDedupForTests();
}

async function withAIWindow(callback) {
  Services.fog.initializeFOG();
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.firstrun.modelChoice", "0"]],
  });
  let win;
  try {
    win = await openAIWindow();
    await callback(win);
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    await SpecialPowers.popPrefEnv();
  }
}

async function waitForClientErrorEvents(count = 1) {
  await TestUtils.waitForCondition(
    () => Glean.smartWindow.clientError.testGetValue()?.length >= count,
    `Wait for ${count} client_error event(s)`
  );
  return Glean.smartWindow.clientError.testGetValue();
}

add_task(async function test_chrome_doc_uncaught_error_records_client_error() {
  await withAIWindow(async win => {
    const browser = win.gBrowser.selectedBrowser;
    const aiWindowEl = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    Assert.ok(aiWindowEl.isConnected, "ai-window is connected");

    resetTelemetryState();

    const view = browser.contentDocument.defaultView;
    // The file and line are read from the Error object, not from the
    // ErrorEvent. The event's own filename/lineno are only used when no error
    // object is attached, so we set them on the error here.
    const error = new view.TypeError("boom from chrome");
    error.fileName =
      "chrome://browser/content/aiwindow/components/ai-window.mjs";
    error.lineNumber = 42;
    const errEvent = new view.ErrorEvent("error", {
      error,
      message: "boom from chrome",
    });
    view.dispatchEvent(errEvent);

    const events = await waitForClientErrorEvents(1);
    const event = events.findLast(e => e.extra.name === "TypeError");
    Assert.ok(event, "client_error event for our synthetic error recorded");
    const extra = event.extra;
    Assert.equal(extra.source, "uncaught", "source is uncaught");
    Assert.equal(extra.name, "TypeError", "name is TypeError");
    Assert.equal(
      extra.message,
      "runtime_error",
      "message is sanitized, the error type stays in name"
    );
    Assert.equal(
      extra.filename,
      "chrome://browser/content/aiwindow/components/ai-window.mjs",
      "filename preserved"
    );
    Assert.equal(Number(extra.lineno), 42, "lineno preserved");
    Assert.equal(extra.location, "home", "location populated from ai-window");
    Assert.ok("chat_id" in extra, "chat_id present");
  });
});

add_task(
  async function test_chrome_doc_unhandled_rejection_records_client_error() {
    await withAIWindow(async win => {
      const browser = win.gBrowser.selectedBrowser;
      await TestUtils.waitForCondition(
        () => browser.contentDocument?.querySelector("ai-window")?.isConnected,
        "Wait for ai-window connected"
      );

      resetTelemetryState();

      const view = browser.contentDocument.defaultView;
      const reason = new view.Error("rejected reason");
      const rejectionEvent = new view.PromiseRejectionEvent(
        "unhandledrejection",
        { reason, promise: view.Promise.resolve(), cancelable: true }
      );
      view.dispatchEvent(rejectionEvent);

      const events = await waitForClientErrorEvents(1);
      const event = events.findLast(e => e.extra.name === "Error");
      Assert.ok(event, "client_error for rejected promise recorded");
      Assert.equal(event.extra.source, "uncaught", "source uncaught");
      Assert.equal(
        event.extra.message,
        "runtime_error",
        "message is sanitized"
      );
    });
  }
);

add_task(async function test_lit_render_source_inferred_from_stack() {
  await withAIWindow(async win => {
    const browser = win.gBrowser.selectedBrowser;
    await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window")?.isConnected,
      "Wait for ai-window connected"
    );

    resetTelemetryState();

    const view = browser.contentDocument.defaultView;
    const litError = new view.TypeError("render exploded");
    litError.stack =
      "render@chrome://global/content/vendor/lit.all.mjs:801:9\n" +
      "performUpdate@chrome://global/content/vendor/lit.all.mjs:800:5";
    view.dispatchEvent(new view.ErrorEvent("error", { error: litError }));

    const events = await waitForClientErrorEvents(1);
    const event = events.findLast(e => e.extra.source === "lit-render");
    Assert.ok(event, "client_error for lit error recorded");
    Assert.equal(
      event.extra.source,
      "lit-render",
      "stack frames inside lit.all.mjs classify as lit-render"
    );
    Assert.equal(
      event.extra.message,
      "lit_render_failed",
      "message is sanitized to the lit render key"
    );
  });
});

add_task(async function test_chat_content_dispatch_relays_to_telemetry() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    Services.fog.initializeFOG();
    resetTelemetryState();

    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-content");
      const chatContent = content.document.querySelector("ai-chat-content");
      Assert.ok(chatContent, "ai-chat-content element exists");

      chatContent.dispatchEvent(
        new content.CustomEvent("AIChatContent:ClientError", {
          bubbles: true,
          composed: true,
          detail: {
            source: "markdown",
            name: "SyntaxError",
            message: "unexpected token",
            filename:
              "chrome://browser/content/aiwindow/modules/ChatMarkdownParser.mjs",
            lineno: 17,
          },
        })
      );
    });

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
      "Wait for client_error relayed from chat content"
    );

    const events = Glean.smartWindow.clientError.testGetValue();
    const event = events.findLast(e => e.extra.source === "markdown");
    Assert.ok(event, "markdown client_error relayed from content");
    Assert.equal(event.extra.name, "SyntaxError", "name forwarded");
    Assert.equal(
      event.extra.message,
      "markdown_render_failed",
      "message sanitized to markdown key"
    );
    Assert.equal(
      event.extra.filename,
      "chrome://browser/content/aiwindow/modules/ChatMarkdownParser.mjs",
      "filename forwarded"
    );
    Assert.equal(Number(event.extra.lineno), 17, "lineno forwarded");
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_chat_content_relays_explicit_message_key() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    Services.fog.initializeFOG();
    resetTelemetryState();

    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-content");
      const chatContent = content.document.querySelector("ai-chat-content");

      // The shape AIChatContentChild sends for a failure only it can name: the
      // key travels in its own field, alongside the raw message.
      chatContent.dispatchEvent(
        new content.CustomEvent("AIChatContent:ClientError", {
          bubbles: true,
          composed: true,
          detail: {
            source: "message-data",
            messageKey: "message_dispatch_failed",
            name: "TypeError",
            message: "chatContent.dispatchEvent is not a function",
            filename: "",
            lineno: 0,
          },
        })
      );
    });

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
      "Wait for client_error relayed from chat content"
    );

    const events = Glean.smartWindow.clientError.testGetValue();
    const event = events.findLast(e => e.extra.source === "message-data");
    Assert.ok(event, "message-data client_error relayed from content");
    Assert.equal(
      event.extra.message,
      "message_dispatch_failed",
      "relayed message key wins over the source key and the message text"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_chat_content_window_error_relays_to_telemetry() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    Services.fog.initializeFOG();
    resetTelemetryState();

    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-content");
      const view = content.window;
      const err = new view.Error("uncaught from content");
      view.dispatchEvent(new view.ErrorEvent("error", { error: err }));
    });

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
      "Wait for client_error from chat content window listener"
    );

    const events = Glean.smartWindow.clientError.testGetValue();
    const event = events.findLast(e => e.extra.source === "uncaught");
    Assert.ok(event, "client_error for content window error recorded");
    Assert.equal(event.extra.source, "uncaught", "source uncaught");
    Assert.equal(event.extra.message, "runtime_error", "message is sanitized");
  });

  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_chat_content_malformed_message_data_records_client_error() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", true]],
    });

    await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
      Services.fog.initializeFOG();
      resetTelemetryState();

      await SpecialPowers.spawn(browser, [], async () => {
        await content.customElements.whenDefined("ai-chat-content");
        const chatContent = content.document.querySelector("ai-chat-content");
        chatContent.dispatchEvent(
          new content.CustomEvent("aiChatContentActor:message", {
            bubbles: true,
            detail: null,
          })
        );
      });

      await TestUtils.waitForCondition(
        () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
        "Wait for client_error from malformed message data"
      );

      const events = Glean.smartWindow.clientError.testGetValue();
      const event = events.findLast(e => e.extra.source === "message-data");
      Assert.ok(event, "client_error for malformed message data recorded");
      Assert.equal(
        event.extra.message,
        "invalid_message_data",
        "message-data uses the stable invalid data key"
      );
      // This test has no ai-window open, so there is no context to attach.
      // The correlation fields (location, chat_id, model) should come back
      // empty.
      Assert.equal(event.extra.location, "", "location defaults to empty");
      Assert.equal(event.extra.chat_id, "", "chat_id defaults to empty");
      Assert.equal(event.extra.model, "", "model defaults to empty");
    });

    await SpecialPowers.popPrefEnv();
  }
);

add_task(
  async function test_chat_content_repeated_malformed_message_data_dedups() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", true]],
    });

    await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
      Services.fog.initializeFOG();
      resetTelemetryState();

      await SpecialPowers.spawn(browser, [], async () => {
        await content.customElements.whenDefined("ai-chat-content");
        const chatContent = content.document.querySelector("ai-chat-content");
        for (let i = 0; i < 3; i++) {
          chatContent.dispatchEvent(
            new content.CustomEvent("aiChatContentActor:message", {
              bubbles: true,
              detail: null,
            })
          );
        }
      });

      await TestUtils.waitForCondition(
        () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
        "Wait for client_error from malformed message data"
      );

      const events = Glean.smartWindow.clientError.testGetValue();
      const messageDataEvents = events.filter(
        e => e.extra.source === "message-data"
      );
      Assert.equal(
        messageDataEvents.length,
        1,
        "repeated invalid message data is deduped to a single event"
      );
    });

    await SpecialPowers.popPrefEnv();
  }
);

add_task(
  async function test_chat_content_lit_render_failure_records_client_error() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", true]],
    });

    await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
      Services.fog.initializeFOG();
      resetTelemetryState();

      await SpecialPowers.spawn(browser, [], async () => {
        await content.customElements.whenDefined("ai-chat-content");
        const chatContent = content.document.querySelector("ai-chat-content");
        // Use the underlying object (past the Xray security wrapper) so that
        // setting a property triggers a Lit re-render and requestUpdate() can
        // be called.
        const chatContentJS = chatContent.wrappedJSObject || chatContent;
        chatContentJS.conversationState = {};
        chatContentJS.requestUpdate();
      });

      await TestUtils.waitForCondition(
        () => Glean.smartWindow.clientError.testGetValue()?.length >= 1,
        "Wait for client_error from Lit render failure"
      );

      const events = Glean.smartWindow.clientError.testGetValue();
      const event = events.findLast(e => e.extra.source === "lit-render");
      Assert.ok(event, "client_error for Lit render failure recorded");
      Assert.equal(
        event.extra.message,
        "lit_render_failed",
        "Lit render failure uses the stable message key"
      );
    });

    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_markdown_failure_records_once_not_as_lit() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  // The markdown failure is rethrown to preserve the existing UI error state,
  // so it also surfaces as an unhandled rejection of the Lit update. Allow it
  // here; the assertions below verify the rethrow is deduped rather than
  // recorded a second time as a lit-render error.
  PromiseTestUtils.allowMatchingRejectionsGlobally(
    /setHTML failed for telemetry test/
  );

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    Services.fog.initializeFOG();
    resetTelemetryState();

    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-message");

      // Patch setHTML on the page's own (content-realm) Element prototype,
      // which is the copy ai-chat-message actually calls when rendering
      // markdown. Going through the Xray wrapper would patch the wrong copy.
      const elementProto = content.wrappedJSObject.Element.prototype;
      const originalSetHTML = elementProto.setHTML;
      elementProto.setHTML = function () {
        throw new content.TypeError("setHTML failed for telemetry test");
      };

      try {
        const el = content.document.createElement("ai-chat-message");
        content.document.body.append(el);
        const elJS = el.wrappedJSObject || el;
        elJS.role = "assistant";
        el.setAttribute("role", "assistant");
        elJS.message = "**markdown**";
        el.setAttribute("message", "**markdown**");

        // Let the failing render run without handling its rejected
        // updateComplete, so the rethrow reaches the window listener exactly
        // as it would in production. The macrotask yields after Lit's
        // microtask update, by which point the unhandledrejection has fired.
        await new Promise(resolve => content.setTimeout(resolve, 0));
        el.remove();
      } finally {
        elementProto.setHTML = originalSetHTML;
      }
    });

    await TestUtils.waitForCondition(
      () =>
        Glean.smartWindow.clientError
          .testGetValue()
          ?.some(e => e.extra.source === "markdown"),
      "Wait for client_error from markdown failure"
    );

    const events = Glean.smartWindow.clientError.testGetValue();
    const markdownEvents = events.filter(e => e.extra.source === "markdown");
    Assert.equal(
      markdownEvents.length,
      1,
      "markdown failure records exactly one event"
    );
    Assert.equal(
      markdownEvents[0].extra.message,
      "markdown_render_failed",
      "markdown failure uses the stable message key"
    );
    Assert.ok(
      !events.some(e => e.extra.source === "lit-render"),
      "rethrown markdown error is not re-reported as lit-render"
    );
  });

  await SpecialPowers.popPrefEnv();
});
