/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SmartWindowTelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/SmartWindowTelemetry.sys.mjs"
);

function lastClientErrorEvent() {
  const events = Glean.smartWindow.clientError.testGetValue();
  return events?.[events.length - 1];
}

function resetTelemetryState() {
  Services.fog.testResetFOG();
  SmartWindowTelemetry._resetClientErrorDedupForTests();
}

add_task(async function setup() {
  do_get_profile();
  Services.fog.initializeFOG();
});

add_task(async function test_recordClientError_normalizes_error() {
  resetTelemetryState();

  const err = new TypeError("Cannot read properties of undefined");
  err.fileName = "chrome://browser/content/aiwindow/components/ai-window.mjs";
  err.lineNumber = 1234;

  // With source "uncaught", the message text is inspected to guess a category.
  // Known sources (lit-render, markdown, message-data) skip that and use a
  // fixed key instead.
  SmartWindowTelemetry.recordClientError(err, {
    source: "uncaught",
    context: {
      location: "home",
      chat_id: "abc-123",
      message_seq: 4,
      model: "custom-model",
    },
  });

  const event = lastClientErrorEvent();
  Assert.ok(event, "client_error event recorded");
  Assert.equal(event.extra.source, "uncaught", "source recorded");
  Assert.equal(event.extra.name, "TypeError", "name recorded");
  Assert.equal(
    event.extra.message,
    "property_read_failure",
    "message-text heuristic produces a sanitized key"
  );
  Assert.equal(
    event.extra.filename,
    "chrome://browser/content/aiwindow/components/ai-window.mjs",
    "filename recorded"
  );
  Assert.equal(Number(event.extra.lineno), 1234, "lineno recorded");
  Assert.equal(event.extra.location, "home", "location forwarded");
  Assert.equal(event.extra.chat_id, "abc-123", "chat_id forwarded");
  Assert.equal(Number(event.extra.message_seq), 4, "message_seq forwarded");
  Assert.equal(event.extra.model, "custom-model", "model forwarded");
});

add_task(
  async function test_recordClientError_source_key_overrides_heuristics() {
    resetTelemetryState();

    // When the source is a known surface, its fixed key always wins, even if
    // the message text looks like something a heuristic would match. This is
    // what keeps the lit-render / markdown keys stable.
    SmartWindowTelemetry.recordClientError(
      new TypeError("Cannot read properties of undefined"),
      { source: "lit-render" }
    );

    const event = lastClientErrorEvent();
    Assert.equal(event.extra.source, "lit-render", "source recorded");
    Assert.equal(
      event.extra.message,
      "lit_render_failed",
      "source key wins over message-text heuristics"
    );
  }
);

add_task(async function test_recordClientError_sanitizes_unknown_message() {
  resetTelemetryState();

  const longMessage = "x".repeat(2000);
  SmartWindowTelemetry.recordClientError(new Error(longMessage), {
    source: "markdown",
  });

  const event = lastClientErrorEvent();
  Assert.ok(event, "event recorded");
  Assert.equal(
    event.extra.message,
    "markdown_render_failed",
    "raw message is replaced with a sanitized source key"
  );
});

add_task(async function test_recordClientError_keeps_error_type_in_name() {
  resetTelemetryState();

  // The error type is only recorded once, as the name. Nothing about it is
  // repeated in the message key.
  SmartWindowTelemetry.recordClientError(
    new ReferenceError("x is not defined"),
    {
      source: "uncaught",
    }
  );

  const event = lastClientErrorEvent();
  Assert.equal(event.extra.name, "ReferenceError", "error type recorded once");
  Assert.equal(
    event.extra.message,
    "runtime_error",
    "an unrecognized message falls back to runtime_error"
  );
});

add_task(async function test_recordClientError_message_key_wins() {
  resetTelemetryState();

  // Callers that know what a failure means say so explicitly, instead of the
  // recorder having to guess whether a message is already a key.
  SmartWindowTelemetry.recordClientError(new TypeError("is not a function"), {
    source: "uncaught",
    messageKey: "message_dispatch_failed",
  });

  const event = lastClientErrorEvent();
  Assert.equal(
    event.extra.message,
    "message_dispatch_failed",
    "an explicit message key wins over the message-text heuristics"
  );
});

add_task(async function test_recordClientError_unknown_message_key_ignored() {
  resetTelemetryState();

  SmartWindowTelemetry.recordClientError(
    new TypeError("boom is not a function"),
    {
      source: "uncaught",
      messageKey: "not_one_of_our_keys",
    }
  );

  const event = lastClientErrorEvent();
  Assert.equal(
    event.extra.message,
    "not_a_function",
    "an unknown message key is dropped and the key derived instead"
  );
});

add_task(async function test_recordClientErrorDetail_records_relayed_fields() {
  resetTelemetryState();

  // The shape AIChatContentParent relays: the fields are already named as the
  // event's extra keys, so nothing is renamed on the way in.
  SmartWindowTelemetry.recordClientErrorDetail(
    {
      source: "markdown",
      name: "SyntaxError",
      message: "unexpected token",
      filename:
        "chrome://browser/content/aiwindow/modules/ChatMarkdownParser.mjs",
      lineno: 17,
    },
    {
      location: "sidebar",
      chat_id: "def-456",
      message_seq: 2,
      model: "a-model",
    }
  );

  const event = lastClientErrorEvent();
  Assert.equal(event.extra.name, "SyntaxError", "name recorded");
  Assert.equal(
    event.extra.message,
    "markdown_render_failed",
    "raw relayed message is replaced with the source key"
  );
  Assert.equal(
    event.extra.filename,
    "chrome://browser/content/aiwindow/modules/ChatMarkdownParser.mjs",
    "filename recorded"
  );
  Assert.equal(Number(event.extra.lineno), 17, "lineno recorded");
  Assert.equal(event.extra.location, "sidebar", "location forwarded");
});

add_task(async function test_recordClientError_unknown_source_falls_back() {
  resetTelemetryState();

  SmartWindowTelemetry.recordClientError(new Error("boom"), {
    source: "definitely-not-a-real-source",
  });

  const event = lastClientErrorEvent();
  Assert.equal(
    event.extra.source,
    "uncaught",
    "unknown source coerces to uncaught"
  );
});

add_task(async function test_recordClientError_accepts_string_throwable() {
  resetTelemetryState();

  SmartWindowTelemetry.recordClientError("plain string failure", {
    source: "uncaught",
  });

  const event = lastClientErrorEvent();
  Assert.equal(event.extra.name, "", "no name for string throwable");
  Assert.equal(
    event.extra.message,
    "runtime_error",
    "string body is not recorded raw"
  );
});

add_task(
  async function test_recordClientError_defaults_correlation_when_missing() {
    resetTelemetryState();

    SmartWindowTelemetry.recordClientError(new Error("no context"), {
      source: "markdown",
    });

    const event = lastClientErrorEvent();
    Assert.equal(event.extra.location, "", "location defaults to empty");
    Assert.equal(event.extra.chat_id, "", "chat_id defaults to empty");
    Assert.equal(
      Number(event.extra.message_seq),
      0,
      "message_seq defaults to 0"
    );
    Assert.equal(event.extra.model, "", "model defaults to empty");
  }
);

add_task(async function test_recordClientError_infers_message_from_source() {
  resetTelemetryState();

  // Content-side callers can send an error with all fields empty and let the
  // parent work out the message key from the source alone.
  SmartWindowTelemetry.recordClientError(
    { name: "", message: "", fileName: "", lineNumber: 0 },
    { source: "message-data" }
  );

  const event = lastClientErrorEvent();
  Assert.equal(
    event.extra.message,
    "invalid_message_data",
    "empty message + message-data source resolves to invalid_message_data"
  );
});

add_task(async function test_recordClientError_caps_repeated_emissions() {
  resetTelemetryState();

  const err = new Error("repeated");
  for (let i = 0; i < 30; i++) {
    SmartWindowTelemetry.recordClientError(err, { source: "uncaught" });
  }

  const events = Glean.smartWindow.clientError.testGetValue();
  Assert.lessOrEqual(
    events.length,
    20,
    "dedup cap suppresses repeats above CLIENT_ERROR_EMIT_CAP"
  );
  Assert.greaterOrEqual(events.length, 1, "at least one event recorded");
});
