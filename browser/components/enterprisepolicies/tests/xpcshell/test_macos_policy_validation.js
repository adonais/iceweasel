/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// macOS config profiles reach the policy engine differently from policies.json:
// the native nsMacPreferencesReader maps every NSNumber (booleans included) to a
// JS integer, and macOSPoliciesParser unflattens "__"-delimited keys into nested
// objects/arrays. The policy-engine tests all use the JSON provider, which
// delivers real JS types, so the macOS value shapes are otherwise unexercised.
//
// The unflatten step is covered by test_macosparser_unflatten.js, and the native
// reader's CFType-to-JS mapping needs a real config profile to verify. This test
// guards the remaining, platform-independent piece: that PolicySchemaValidator
// and the real schema accept and coerce the values macOS produces -- in
// particular booleans that arrive as 0/1 integers.

const { PolicySchemaValidator } = ChromeUtils.importESModule(
  "resource://gre/modules/policies/PolicySchemaValidator.sys.mjs"
);
const { schema } = ChromeUtils.importESModule(
  "resource:///modules/policies/schema.sys.mjs"
);

add_task(function test_macos_shaped_values_validate_and_coerce() {
  // Values as they look after the native reader and unflattening. The original
  // macOS flat keys are noted in comments.
  const policies = {
    DisableAppUpdate: 1,
    AppAutoUpdate: 0,
    DisplayMenuBar: 1,
    DisplayBookmarksToolbar: "never",
    AppUpdateURL: "https://update.example.com/",
    // Homepage__URL, Homepage__Locked
    Homepage: { URL: "https://home.example.com/", Locked: 1 },
    // Cookies__Allow__0, Cookies__Allow__1
    Cookies: { Allow: ["https://a.example.com", "https://b.example.com"] },
    PrivateBrowsingModeAvailability: 1,
  };

  function parse(name) {
    const result = PolicySchemaValidator.validate(
      policies[name],
      schema.properties[name],
      { allowAdditionalProperties: true }
    );
    Assert.ok(result.valid, `${name} validates`);
    return result.parsedValue;
  }

  Assert.strictEqual(
    parse("DisableAppUpdate"),
    true,
    "An integer 1 boolean policy coerces to true"
  );
  Assert.strictEqual(
    parse("AppAutoUpdate"),
    false,
    "An integer 0 boolean policy coerces to false"
  );
  Assert.strictEqual(
    parse("DisplayMenuBar"),
    true,
    "An integer for a boolean-or-enum policy coerces to true"
  );
  Assert.equal(
    parse("DisplayBookmarksToolbar"),
    "never",
    "An enumerated string for a boolean-or-enum policy passes through"
  );
  Assert.ok(
    URL.isInstance(parse("AppUpdateURL")),
    "A URL policy coerces to a URL object"
  );

  const homepage = parse("Homepage");
  Assert.ok(URL.isInstance(homepage.URL), "Homepage.URL is a URL object");
  Assert.strictEqual(
    homepage.Locked,
    true,
    "A nested integer boolean coerces to true"
  );

  const cookies = parse("Cookies");
  Assert.equal(cookies.Allow.length, 2, "Both origins are kept");
  Assert.ok(
    cookies.Allow.every(u => URL.isInstance(u)),
    "Origins coerce to URL objects"
  );

  Assert.strictEqual(
    parse("PrivateBrowsingModeAvailability"),
    1,
    "A numeric enum policy keeps its integer value"
  );
});
