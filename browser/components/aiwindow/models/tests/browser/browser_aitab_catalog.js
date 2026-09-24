/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Self-checks on the real packaged catalog (parse + reference integrity +
// structure), plus runtime validation of bound-array items — data that lives
// in the data model, which the per-component (literal) schema can't reach.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { loadAssets, buildSurface } = AITab;

let gEnv;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.conversation.logLevel", "Debug"]],
  });
  // Throws if the packaged component_schema.json is not valid JSON (catches
  // stray trailing commas etc. before they reach production).
  const { env } = await loadAssets();
  gEnv = env;
});

add_task(function test_catalog_is_well_formed() {
  const cat = gEnv.catalog;

  // Every "#/$defs/X" referenced anywhere in the catalog is actually defined.
  const defs = new Set(Object.keys(cat.$defs || {}));
  const refs = [
    ...new Set(
      [...JSON.stringify(cat).matchAll(/#\/\$defs\/([A-Za-z0-9_]+)/g)].map(
        m => m[1]
      )
    ),
  ];
  const missing = refs.filter(r => !defs.has(r));
  Assert.deepEqual(
    missing,
    [],
    `every $ref target is defined (missing: ${missing})`
  );

  // Every component entry is an object schema or a $ref, and Page exists.
  for (const [name, def] of Object.entries(cat.components)) {
    Assert.ok(
      def && (def.type === "object" || typeof def.$ref === "string"),
      `component "${name}" is an object schema or a $ref`
    );
  }
  Assert.ok(cat.components.Page, "a Page component is defined");
});

add_task(function test_bound_array_items_validated() {
  const base = data => ({
    components: [
      { id: "root", component: "Page", header: "h", children: ["c"] },
      { id: "h", component: "Header", title: "Cards" },
      { id: "c", component: "Cards", items: { path: "/cards" } },
    ],
    dataModel: { cards: data },
  });

  const ok = buildSurface(base([{ title: "A" }, { title: "B" }]), gEnv);
  Assert.ok(
    ok.ok,
    `bound cards with valid items pass; errors: ${JSON.stringify(ok.errors)}`
  );

  const bad = buildSurface(base([{ eyebrow: "no title here" }]), gEnv);
  Assert.ok(!bad.ok, "a bound card item missing required `title` is rejected");
});

add_task(function test_bound_array_nested_in_slot_validated() {
  // Header.references -> SourceLinks.items -> SourceLink (href required),
  // exercising the recursion into a $ref'd object slot.
  const bad = buildSurface(
    {
      components: [
        { id: "root", component: "Page", header: "h", children: [] },
        {
          id: "h",
          component: "Header",
          title: "T",
          references: { items: { path: "/src" } },
        },
      ],
      dataModel: { src: [{ title: "no href" }] },
    },
    gEnv
  );
  Assert.ok(!bad.ok, "a bound source link missing required `href` is rejected");
});
