/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Exercises the real packaged A2UI catalog (fetched via loadAssets from
// chrome://): buildSurface() validates a surface (a flat list of component
// instances + a data model) against the catalog and returns it unchanged.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { loadAssets, buildSurface } = AITab;

let gEnv;

add_setup(async function () {
  // Raise AITab's log verbosity for the duration of this file so a failing run
  // surfaces the module's debug/error output. Reverted automatically at teardown.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.conversation.logLevel", "Debug"]],
  });
  const { env } = await loadAssets();
  gEnv = env;
});

// A minimal valid surface: a root Page referencing a Header, a TextBlock, and a
// RankedTable whose rows are bound into the data model.
const VALID_SURFACE = Object.freeze({
  catalogId: "https://aitab.mozilla.org/catalogs/aitab/catalog.json",
  components: [
    {
      id: "root",
      component: "Page",
      header: "hdr",
      children: ["intro", "tbl"],
    },
    { id: "hdr", component: "Header", title: "Installer Quotes" },
    { id: "intro", component: "TextBlock", lead: "Three quotes, compared." },
    {
      id: "tbl",
      component: "RankedTable",
      columns: [
        { key: "name", type: "text", role: "title" },
        { key: "price", type: "currency", role: "detail", goal: "min" },
      ],
      rows: { path: "/quotes" },
    },
  ],
  dataModel: { quotes: [{ name: "Bright Build", price: 31200 }] },
});

// Page requires a `header`, so the fixtures below that are about something
// else pair their root with this minimal one.
const HEADER = Object.freeze({ id: "hdr", component: "Header", title: "T" });

add_task(function test_valid_surface_validates() {
  const result = buildSurface(structuredClone(VALID_SURFACE), gEnv);
  Assert.ok(
    result.ok,
    `the surface validates; errors: ${JSON.stringify(result.errors)}`
  );
  Assert.deepEqual(
    result.surface,
    VALID_SURFACE,
    "the surface is returned unchanged"
  );
});

add_task(function test_components_must_be_an_array() {
  const result = buildSurface({ dataModel: {} }, gEnv);
  Assert.ok(!result.ok, "a surface without a components array is rejected");
});

add_task(function test_requires_exactly_one_root() {
  const result = buildSurface(
    { components: [{ id: "a", component: "Header", title: "x" }] },
    gEnv
  );
  Assert.ok(!result.ok, "a surface with no `root` component is rejected");
});

add_task(function test_root_must_be_a_page() {
  const result = buildSurface(
    { components: [{ id: "root", component: "Header", title: "x" }] },
    gEnv
  );
  Assert.ok(!result.ok, "a root that is not a Page is rejected");
});

add_task(function test_unknown_component_type() {
  const result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", header: "hdr", children: ["b"] },
        HEADER,
        { id: "b", component: "Banner" },
      ],
    },
    gEnv
  );
  Assert.ok(!result.ok, "an unknown component type is rejected");
});

add_task(function test_component_missing_required_prop() {
  const result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", header: "h", children: [] },
        { id: "h", component: "Header" },
      ],
    },
    gEnv
  );
  Assert.ok(!result.ok, "a Header without its required `title` is rejected");
});

add_task(function test_additional_property_rejected() {
  const result = buildSurface(
    {
      components: [
        {
          id: "root",
          component: "Page",
          header: "hdr",
          children: [],
          bogus: 1,
        },
        HEADER,
      ],
    },
    gEnv
  );
  Assert.ok(!result.ok, "an unexpected property on a component is rejected");
});

add_task(function test_dangling_id_reference() {
  const result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", header: "hdr", children: ["ghost"] },
        HEADER,
      ],
    },
    gEnv
  );
  Assert.ok(!result.ok, "a child id that no component defines is rejected");
});

add_task(function test_unresolved_data_binding() {
  const result = buildSurface(
    {
      components: [
        { id: "root", component: "Page", header: "hdr", children: ["s"] },
        HEADER,
        { id: "s", component: "Cards", items: { path: "/missing" } },
      ],
      dataModel: {},
    },
    gEnv
  );
  Assert.ok(
    !result.ok,
    "an absolute binding path absent from dataModel is rejected"
  );
});
