/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The browser.smartwindow.aitab.components pref replaces the packaged A2UI
// catalog with one read from the pref, so the catalog can be iterated on
// without rebuilding. Covers both directions: the override taking effect, and
// reverting to the packaged catalog once the pref is cleared.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { loadAssets, buildSurface } = AITab;

const COMPONENTS_PREF = "browser.smartwindow.aitab.components";

// A minimal override catalog: a Page container plus a custom "Note" component
// the packaged catalog doesn't have. Includes just the $defs its Page.children
// reference needs.
const OVERRIDE_CATALOG = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:test:catalog",
  catalogId: "urn:test:catalog",
  $defs: {
    ComponentId: { type: "string" },
    ChildList: {
      oneOf: [
        { type: "array", items: { $ref: "#/$defs/ComponentId" } },
        {
          type: "object",
          required: ["componentId", "path"],
          additionalProperties: false,
          properties: {
            componentId: { $ref: "#/$defs/ComponentId" },
            path: { type: "string" },
          },
        },
      ],
    },
  },
  functions: [],
  components: {
    Page: {
      type: "object",
      required: ["children"],
      additionalProperties: false,
      properties: { children: { $ref: "#/$defs/ChildList" } },
    },
    Note: {
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: { text: { type: "string", minLength: 1 } },
    },
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
    set: [[COMPONENTS_PREF, JSON.stringify(OVERRIDE_CATALOG)]],
  });

  const { env } = await loadAssets();

  Assert.deepEqual(
    [...env.names].sort(),
    ["Note", "Page"],
    "components are read from the pref, replacing the packaged catalog rather than merging with it"
  );

  let result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", children: ["n"] },
        { id: "n", component: "Note", text: "hi" },
      ],
    },
    env
  );
  Assert.ok(
    result.ok,
    `an override-catalog surface validates; errors: ${JSON.stringify(result.errors)}`
  );

  result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", children: ["t"] },
        { id: "t", component: "RankedTable", columns: [], rows: [] },
      ],
    },
    env
  );
  Assert.ok(
    !result.ok,
    "a packaged component type is unknown under the override catalog"
  );

  // Popped here rather than at teardown: the next task asserts the revert.
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_reverts_to_packaged_when_unset() {
  // The lazy pref getter recomputes when the pref is cleared, so it reverts
  // immediately.
  const { env } = await loadAssets();
  Assert.ok(
    env.names.includes("RankedTable"),
    "reverts to the packaged catalog once the pref is cleared"
  );
});
