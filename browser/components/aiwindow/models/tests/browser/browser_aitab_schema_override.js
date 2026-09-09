/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The browser.smartwindow.aitab.components pref replaces the packaged component
// schemas with a set read from the pref, so schemas can be iterated on without
// rebuilding. Covers both directions: the override taking effect, and reverting
// to the packaged set once the pref is cleared.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { loadAssets, buildPage } = AITab;

const COMPONENTS_PREF = "browser.smartwindow.aitab.components";

// Minimal override schema set: a page of "note" blocks. Each schema's bare $id
// is its key, so "note" introduces a "note" block type the packaged schemas
// don't have.
const OVERRIDE_PAGE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "page",
  type: "object",
  required: ["blocks"],
  additionalProperties: false,
  properties: {
    blocks: {
      type: "array",
      items: { oneOf: [{ $ref: "note" }] },
    },
  },
};

const OVERRIDE_NOTE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "note",
  type: "object",
  required: ["type", "text"],
  additionalProperties: false,
  properties: {
    type: { const: "note" },
    text: { type: "string", minLength: 1 },
  },
};

add_setup(async function () {
  // Raise AITab's log verbosity for the duration of this file so a failing run
  // surfaces the module's debug/error output. Reverted automatically at teardown.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.conversation.logLevel", "Debug"]],
  });
});

add_task(async function test_pref_override() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        COMPONENTS_PREF,
        JSON.stringify([OVERRIDE_PAGE_SCHEMA, OVERRIDE_NOTE_SCHEMA]),
      ],
    ],
  });

  const { env } = await loadAssets();

  Assert.deepEqual(
    [...env.names].sort(),
    ["note", "page"],
    "schemas are read from the pref, replacing the packaged set rather than merging with it"
  );

  let result = buildPage({ blocks: [{ type: "note", text: "hi" }] }, env);
  Assert.ok(
    result.ok,
    `an override-schema page validates; errors: ${JSON.stringify(result.errors)}`
  );

  result = buildPage({ blocks: [{ type: "list", fields: [], data: [] }] }, env);
  Assert.ok(
    !result.ok,
    "a packaged block type is unknown under the override schema set"
  );

  // Popped here rather than at teardown: the next task asserts the revert.
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_reverts_to_packaged_when_unset() {
  // The lazy pref getter recomputes when the pref is cleared, so it reverts
  // immediately.
  const { env } = await loadAssets();
  Assert.ok(
    env.names.includes("list"),
    "reverts to the packaged schemas once the pref is cleared"
  );
});

add_task(async function test_path_style_id_is_registered_under_bare_name() {
  // The packaged schemas all use bare $ids, so only an override can produce a
  // path-style one. It must be keyed — and registered with the validator —
  // under its last segment, which is the token the page schema's $ref uses.
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        COMPONENTS_PREF,
        JSON.stringify([
          OVERRIDE_PAGE_SCHEMA,
          { ...OVERRIDE_NOTE_SCHEMA, $id: "components/note" },
        ]),
      ],
    ],
  });

  const { env } = await loadAssets();

  Assert.deepEqual(
    [...env.names].sort(),
    ["note", "page"],
    "a path-style $id is keyed by its bare last segment"
  );

  const result = buildPage({ blocks: [{ type: "note", text: "hi" }] }, env);
  Assert.ok(
    result.ok,
    `the page schema's $ref resolves to it; errors: ${JSON.stringify(result.errors)}`
  );

  await SpecialPowers.popPrefEnv();
});
