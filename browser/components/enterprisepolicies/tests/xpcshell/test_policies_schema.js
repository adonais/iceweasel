/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Validates policies-schema.json against policies-schema.meta.json, so every
// policy has metadata that downstream tooling relies on. A new rule that JSON
// Schema can express belongs in policies-schema.meta.json.

const { JsonSchema } = ChromeUtils.importESModule(
  "resource://gre/modules/JsonSchema.sys.mjs"
);

let metaSchema;

function readSupportJSON(name) {
  return IOUtils.readJSON(PathUtils.join(do_get_cwd().path, name));
}

add_setup(async function () {
  metaSchema = await readSupportJSON("policies-schema.meta.json");
});

add_task(async function test_policies_schema_has_required_metadata() {
  let policiesSchema = await readSupportJSON("policies-schema.json");

  let validator = new JsonSchema.Validator(metaSchema, { shortCircuit: false });
  let result = validator.validate(policiesSchema);

  let message = "policies-schema.json should satisfy policies-schema.meta.json";
  if (!result.valid) {
    message += `:\n${JSON.stringify(result.errors, null, 2)}`;
  }
  Assert.ok(result.valid, message);
});

// Guards against accidentally weakening the meta-schema.
// Removing a validation rule from the meta-schema causes this
// test to fail instead of reducing schema coverage.
add_task(async function test_meta_schema_catches_violations() {
  let description = "A description long enough to satisfy minLength.";
  let compat = {
    firefox: { version_added: "60" },
    firefox_esr: { version_added: "60" },
    firefox_enterprise: { version_added: false },
  };
  let bad = {
    properties: {
      MissingDescription: {
        "x-category": "Miscellaneous",
        "x-compatibility": compat,
        examples: ["example"],
      },
      ShortDescription: {
        description: "Too short.",
        "x-category": "Miscellaneous",
        "x-compatibility": compat,
        examples: ["example"],
      },
      EmptyCategory: {
        description,
        "x-category": "",
        "x-compatibility": compat,
        examples: ["example"],
      },
      EmptyExamples: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": compat,
        examples: [],
      },
      MissingCompatibility: {
        description,
        "x-category": "Miscellaneous",
        examples: ["example"],
      },
      MissingChannel: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": {
          firefox: { version_added: "60" },
          firefox_enterprise: { version_added: false },
        },
        examples: ["example"],
      },
      MissingVersionAdded: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": { ...compat, firefox: {} },
        examples: ["example"],
      },
      BadVersionString: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": {
          ...compat,
          firefox: { version_added: "fifty" },
        },
        examples: ["example"],
      },
      BadVersionType: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": {
          ...compat,
          firefox: { version_added: 2 },
        },
        examples: ["example"],
      },
      UnknownChannel: {
        description,
        "x-category": "Miscellaneous",
        "x-compatibility": {
          ...compat,
          firefox_galactic_edition: { version_added: "60" },
        },
        examples: ["example"],
      },
    },
  };

  let validator = new JsonSchema.Validator(metaSchema, { shortCircuit: false });
  let result = validator.validate(bad);
  Assert.ok(!result.valid, "A schema with bad metadata should be rejected.");

  for (let [policy, keyword] of [
    ["MissingDescription", "required"],
    ["ShortDescription", "minLength"],
    ["EmptyCategory", "minLength"],
    ["EmptyExamples", "minItems"],
    ["MissingCompatibility", "required"],
    ["MissingChannel", "required"],
    ["MissingVersionAdded", "required"],
    ["BadVersionString", "pattern"],
    ["BadVersionType", "type"],
    ["UnknownChannel", "additionalProperties"],
  ]) {
    Assert.ok(
      result.errors.some(
        e => e.keyword == keyword && e.instanceLocation.includes(policy)
      ),
      `${policy} should be flagged by "${keyword}".`
    );
  }
});
