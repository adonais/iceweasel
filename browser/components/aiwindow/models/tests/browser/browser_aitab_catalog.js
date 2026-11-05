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
const { FEATURE_MAJOR_VERSIONS, MODEL_FEATURES, parseVersion } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
  );

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

add_task(function test_catalog_version_is_paired_with_aitab_major() {
  // The aitab prompts in Remote Settings are written against this catalog, so
  // the catalog's major must be the major the build selects prompts for. A
  // schema change that old prompts cannot describe is a major bump of both.
  const parsed = parseVersion(gEnv.catalog.version);
  Assert.ok(
    parsed,
    `catalog.version is "{major}.{minor}" (got ${JSON.stringify(gEnv.catalog.version)})`
  );
  Assert.equal(
    parsed.major,
    FEATURE_MAJOR_VERSIONS[MODEL_FEATURES.AITAB],
    "catalog major matches FEATURE_MAJOR_VERSIONS.aitab"
  );
});

add_task(function test_bound_array_items_validated() {
  const base = data => ({
    components: [
      { id: "root", component: "Page", header: "h", children: ["c"] },
      { id: "h", component: "Header", title: "Timeline" },
      { id: "c", component: "Timeline", items: { path: "/events" } },
    ],
    dataModel: { events: data },
  });

  const ok = buildSurface(
    base([
      { date_label: "Mon", title: "A" },
      { date_label: "Tue", title: "B" },
    ]),
    gEnv
  );
  Assert.ok(
    ok.ok,
    `bound timeline items that are valid pass; errors: ${JSON.stringify(ok.errors)}`
  );

  const bad = buildSurface(base([{ date_label: "no title here" }]), gEnv);
  Assert.ok(
    !bad.ok,
    "a bound timeline item missing required `title` is rejected"
  );
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
