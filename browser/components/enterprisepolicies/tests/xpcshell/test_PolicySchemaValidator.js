/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PolicySchemaValidator } = ChromeUtils.importESModule(
  "resource://gre/modules/policies/PolicySchemaValidator.sys.mjs"
);

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

function assertValid(value, schema, options) {
  const result = PolicySchemaValidator.validate(value, schema, options);
  Assert.ok(result.valid, `Expected ${JSON.stringify(value)} to validate`);
  return result.parsedValue;
}

function assertInvalid(value, schema, options) {
  const result = PolicySchemaValidator.validate(value, schema, options);
  Assert.ok(!result.valid, `Expected ${JSON.stringify(value)} to be invalid`);
  Assert.ok(result.error, "An error is returned for invalid values");
  return result.error;
}

add_task(function test_delegates_structural_validation() {
  const schema = {
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
  };

  Assert.deepEqual(assertValid({ id: 5 }, schema), { id: 5 });
  assertInvalid({}, schema);
  assertInvalid({ id: "nope" }, schema);
});

add_task(function test_boolean_coercion_from_gpo_dword() {
  const schema = { type: "boolean" };

  Assert.strictEqual(assertValid(1, schema), true, "1 coerces to true");
  Assert.strictEqual(assertValid(0, schema), false, "0 coerces to false");
  Assert.strictEqual(assertValid(true, schema), true, "true stays true");
  assertInvalid(2, schema);
});

add_task(function test_boolean_coercion_from_string() {
  const schema = { type: "boolean" };

  Assert.strictEqual(assertValid("true", schema), true, '"true" coerces');
  Assert.strictEqual(assertValid("false", schema), false, '"false" coerces');
  Assert.strictEqual(
    assertValid("True", schema),
    true,
    "the match is case insensitive"
  );
  assertInvalid("yes", schema);
  assertInvalid("", schema);
});

add_task(function test_string_field_keeps_its_quoted_boolean() {
  // A field that accepts a string must not have "true" turned into a boolean.
  const schema = { type: ["string", "boolean"] };

  Assert.strictEqual(assertValid("true", schema), "true", '"true" stays text');
});

add_task(function test_numeric_field_keeps_its_integer() {
  // A Preferences value is number|boolean|string; a 0/1 there is a real integer
  // and must NOT be coerced to a boolean.
  const schema = { type: ["number", "boolean", "string"] };

  Assert.strictEqual(assertValid(1, schema), 1, "1 stays an integer");
  Assert.strictEqual(assertValid(0, schema), 0, "0 stays an integer");
});

add_task(function test_uri_format_hydrates_to_url_object() {
  const schema = { type: "string", format: "uri" };

  const parsed = assertValid("https://example.com/path", schema);
  Assert.ok(URL.isInstance(parsed), "a uri-formatted string becomes a URL");
  Assert.equal(parsed.href, "https://example.com/path");

  // format:uri is permissive (intranet/private/file), unlike the built-in
  // "url" format; enterprise policies rely on accepting these.
  Assert.ok(URL.isInstance(assertValid("http://192.168.1.1", schema)));
  Assert.ok(URL.isInstance(assertValid("file:///C:/path", schema)));

  assertInvalid("not a url", schema);
});

add_task(function test_uri_or_empty() {
  const schema = {
    type: "string",
    anyOf: [{ format: "uri" }, { maxLength: 0 }],
  };

  Assert.strictEqual(assertValid("", schema), "", "empty string is allowed");
  Assert.ok(URL.isInstance(assertValid("https://example.com", schema)));
  assertInvalid("not a url", schema);
});

add_task(function test_boolean_or_enum_accepts_integer_boolean() {
  // DisplayMenuBar/DisplayBookmarksToolbar shape: a boolean or an enumerated
  // string. GPO (REG_DWORD) and macOS (NSNumber) deliver booleans as 0/1.
  const schema = {
    anyOf: [{ type: "boolean" }, { type: "string", enum: ["always", "never"] }],
  };

  Assert.strictEqual(assertValid(1, schema), true, "integer 1 coerces to true");
  Assert.strictEqual(
    assertValid(0, schema),
    false,
    "integer 0 coerces to false"
  );
  Assert.equal(assertValid("always", schema), "always", "enum string passes");
  assertInvalid("bogus", schema);
});

add_task(function test_json_string_parsing() {
  const schema = {
    type: ["object", "array"],
    contentMediaType: "application/json",
    properties: { foo: { type: "string" } },
  };

  Assert.deepEqual(assertValid({ foo: "bar" }, schema), { foo: "bar" });
  // A JSON string (as GPO/macOS deliver ExtensionSettings) is parsed.
  Assert.deepEqual(assertValid('{"foo":"bar"}', schema), { foo: "bar" });
  // Unparseable JSON reports the real cause, not a downstream type mismatch.
  const parseError = assertInvalid("not json", schema);
  Assert.ok(
    parseError.message.includes("not valid JSON"),
    "the error names the unparseable JSON"
  );
});

add_task(function test_unsupported_value_fails_without_throwing() {
  // The validator throws (rather than returning invalid) for values such as
  // undefined; validate() must catch that so a single bad value can't abort
  // the whole policy engine. Before that guard this call threw instead of
  // returning a result.
  assertInvalid(undefined, { type: "object", properties: {} });
});

add_task(function test_list_drops_invalid_entries_and_keeps_the_rest() {
  // The non-negotiable behavior: one bad entry never discards the whole list.
  const schema = { type: "array", items: { type: "string" } };

  Assert.deepEqual(
    assertValid(["a", 0, "b"], schema),
    ["a", "b"],
    "a wrong-typed entry is dropped, the rest are kept"
  );
});

add_task(function test_list_of_uris_drops_invalid_keeps_valid_as_urls() {
  const schema = { type: "array", items: { type: "string", format: "uri" } };

  const parsed = assertValid(
    ["https://a.com", "not a url", "https://b.com"],
    schema
  );
  Assert.deepEqual(
    parsed.map(u => u.href),
    ["https://a.com/", "https://b.com/"],
    "the invalid entry is dropped and valid ones become URL objects"
  );
});

add_task(function test_additional_properties_stripped_when_allowed() {
  const schema = {
    type: "object",
    properties: { known: { type: "string" } },
  };

  Assert.deepEqual(
    assertValid({ known: "value", extra: "dropped" }, schema, {
      allowAdditionalProperties: true,
    }),
    { known: "value" },
    "unknown properties are stripped from the parsed value"
  );
});

add_task(function test_additional_properties_rejected_by_default() {
  const schema = {
    type: "object",
    properties: { known: { type: "string" } },
  };

  assertInvalid({ known: "value", extra: "x" }, schema);
});

// ExtensionSettings shape: a "*" entry holding the defaults, plus open-ended
// per-extension-ID entries.
const EXTENSION_SETTINGS_SHAPE = {
  type: "object",
  properties: {
    "*": {
      type: "object",
      properties: {
        installation_mode: { type: "string" },
      },
    },
  },
  patternProperties: {
    "^(?!\\*$).*$": {
      type: "object",
      properties: {
        installation_mode: { type: "string" },
        updates_disabled: { type: "boolean" },
      },
    },
  },
};

add_task(function test_map_drops_invalid_entries_and_keeps_the_rest() {
  // One malformed entry must not discard every other extension's settings.
  Assert.deepEqual(
    assertValid(
      {
        "*": { installation_mode: "blocked" },
        "good@example.com": { installation_mode: "force_installed" },
        "bad@example.com": { updates_disabled: 42 },
      },
      EXTENSION_SETTINGS_SHAPE
    ),
    {
      "*": { installation_mode: "blocked" },
      "good@example.com": { installation_mode: "force_installed" },
    },
    "the invalid entry is dropped and the rest of the policy applies"
  );
});

add_task(function test_map_never_drops_a_fixed_property() {
  // "*" is not an independently droppable entry: dropping it would turn a
  // global block into a policy that looks healthy and installs everything.
  assertInvalid(
    {
      "*": { installation_mode: 42 },
      "ok@example.com": { installation_mode: "force_installed" },
    },
    EXTENSION_SETTINGS_SHAPE
  );
});

add_task(function test_fixed_properties_are_not_dropped_individually() {
  // An object with only fixed properties is one value, not a collection: a bad
  // property fails the policy rather than being silently discarded.
  const schema = {
    type: "object",
    properties: { host: { type: "string" }, port: { type: "number" } },
  };

  assertInvalid({ host: "example.com", port: "not a number" }, schema);
});

add_task(async function test_dropped_entry_names_the_failing_field() {
  // The log line is the only signal an admin gets that an entry went missing,
  // so it must name the field that failed, including when that field's name
  // needs unescaping out of the JSON pointer the validator reports.
  const schema = {
    type: "object",
    patternProperties: {
      "^.*$": {
        type: "object",
        properties: { "application/pdf": { type: "string" } },
      },
    },
  };

  const stopListening = TestUtils.listenForConsoleMessages();
  assertValid({ mimeTypes: { "application/pdf": 3 } }, schema, {
    policyName: "Handlers",
  });
  const messages = await stopListening();

  Assert.ok(
    messages.some(
      msg =>
        msg.level == "error" &&
        msg.arguments[0].includes(
          'Handlers["mimeTypes"]["application/pdf"]: Instance type "number"'
        ) &&
        msg.arguments[0].includes("Received 3")
    ),
    "the dropped entry names the failing field and the value received"
  );
});
