/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { JsonSchema } = ChromeUtils.importESModule(
  "resource://gre/modules/JsonSchema.sys.mjs"
);

add_task(function test_basicSchema() {
  info("Testing validation of a basic schema");
  const schema = {
    type: "object",
    properties: {
      id: { type: "number" },
    },
    required: ["id"],
  };

  const validator = new JsonSchema.Validator(schema);

  Assert.deepEqual(
    JsonSchema.validate({ id: 123 }, schema),
    { valid: true, errors: [] },
    "Validation of basic schemas with validate()"
  );

  Assert.deepEqual(
    validator.validate({ id: 123 }, schema),
    { valid: true, errors: [] },
    "Validation of basic schemas with Validator"
  );

  Assert.ok(
    !JsonSchema.validate({}, schema).valid,
    "Validation of basic schemas with validate()"
  );
  Assert.ok(
    !validator.validate({}).valid,
    "Validation of basic schemas with Validator"
  );
});

add_task(function test_mozUrlFormat() {
  info("Testing custom string format 'moz-url-format'");
  const schema = {
    type: "string",
    format: "moz-url-format",
  };

  {
    const obj = "https://www.mozilla.org/%LOCALE%/";
    Assert.deepEqual(
      JsonSchema.validate(obj, schema),
      { valid: true, errors: [] },
      "Substitution of a valid variable validates"
    );
  }

  {
    const obj = "https://mozilla.org/%BOGUS%/";

    Assert.equal(
      Services.urlFormatter.formatURL(obj),
      obj,
      "BOGUS is an invalid variable for the URL formatter service"
    );

    Assert.ok(
      !JsonSchema.validate(obj, { type: "string", format: "uri" }).valid,
      "A moz-url-format string does not validate as a URI"
    );

    Assert.deepEqual(
      JsonSchema.validate(obj, schema),
      {
        valid: false,
        errors: [
          {
            instanceLocation: "#",
            keyword: "format",
            keywordLocation: "#/format",
            error: `String does not match format "moz-url-format".`,
          },
        ],
      },
      "Substitution of an invalid variable does not validate"
    );
  }
});

add_task(function test_mozUrl() {
  info("Testing custom string format 'moz-url'");
  const schema = { type: "string", format: "moz-url" };

  for (const url of [
    "https://münchen.example/",
    "https://example.com/über",
    "file:///C:/path with space/x.html",
    "https://example.com/?q={x}",
    "https://example.com/%PRODUCT%/",
  ]) {
    Assert.ok(
      JsonSchema.validate(url, schema).valid,
      `${url} validates as a moz-url`
    );
  }

  Assert.ok(
    !JsonSchema.validate("not a url", schema).valid,
    "A string the URL parser rejects does not validate"
  );
});
