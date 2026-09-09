/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Smoke test for the real MDN compatibility dataset. The behavior of MDNCompatibility is
// covered by test_mdn-compatibility.js, which uses a mock dataset. Here we only check that
// the vendored dataset can still be loaded and used, without asserting on any value which
// could legitimately change when the data is updated.

const {
  TARGET_BROWSER_ID,
} = require("resource://devtools/shared/compatibility/constants.js");
const {
  getCSSPropertiesCompatData,
} = require("resource://devtools/shared/compatibility/compatibility-dataset.js");
const MDNCompatibility = require("resource://devtools/server/actors/compatibility/lib/MDNCompatibility.js");

let cssPropertiesCompatData;

add_setup(() => {
  // Make sure we use the live dataset, even if it should be the default.
  Services.prefs.setBoolPref("devtools.compatibility.use-mock-dataset", false);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("devtools.compatibility.use-mock-dataset");
  });
  cssPropertiesCompatData = getCSSPropertiesCompatData();
});

// A dataset smaller than this would mean the update script dropped most of the data.
const MINIMUM_PROPERTIES_COUNT = 100;

add_task(function test_dataset_shape() {
  const properties = Object.keys(cssPropertiesCompatData);
  Assert.greater(
    properties.length,
    MINIMUM_PROPERTIES_COUNT,
    "The dataset contains a plausible number of properties"
  );

  info("Check the shape of every compat table in the dataset");
  let checkedSupportEntries = 0;
  for (const property of properties) {
    const compatTable = getCompatTable(cssPropertiesCompatData, property);
    if (!compatTable) {
      // Aliases only hold a `_aliasOf` property.
      Assert.equal(
        typeof cssPropertiesCompatData[property]._aliasOf,
        "string",
        `"${property}" has no compat table and is an alias`
      );
      continue;
    }

    for (const [browserId, supportEntries] of Object.entries(
      compatTable.support
    )) {
      Assert.ok(
        TARGET_BROWSER_ID.includes(browserId),
        `"${property}" only has support data for target browsers, got "${browserId}"`
      );
      Assert.ok(
        Array.isArray(supportEntries),
        `The support data of "${property}" for "${browserId}" is an array`
      );

      for (const { added } of supportEntries) {
        // `added` is set by the update script from `version_added`, which can either be a
        // version number, a boolean, or null when the data is unknown.
        Assert.ok(
          typeof added === "number" ||
            typeof added === "boolean" ||
            added === null ||
            added === undefined,
          `The parsed version of "${property}" for "${browserId}" is usable, got "${added}"`
        );
        checkedSupportEntries++;
      }
    }
  }

  Assert.greater(checkedSupportEntries, 0, "Support entries were checked");
});

add_task(function test_issues_shape() {
  const mdnCompatibility = new MDNCompatibility(cssPropertiesCompatData);
  const browsers = TARGET_BROWSER_ID.map(id => ({ id, version: "1" }));

  // Targeting version 1 of every browser, so that any modern property is unsupported and
  // reported as an issue whatever the data says.
  const declarations = [
    { name: "background-color" },
    { name: "border-block-color" },
    { name: "user-select" },
    { name: "--custom-property" },
    { name: "this-property-does-not-exist" },
  ];

  const issues = mdnCompatibility.getCSSDeclarationBlockIssues(
    declarations,
    browsers
  );
  Assert.greater(issues.length, 0, "Issues were reported");

  for (const issue of issues) {
    Assert.ok(!!issue.type, `The issue for "${issue.property}" has a type`);
    Assert.ok(
      declarations.some(
        ({ name }) => name === issue.property || issue.aliases?.includes(name)
      ),
      `The issue for "${issue.property}" matches one of the declarations`
    );
    Assert.equal(
      typeof issue.deprecated,
      "boolean",
      `The issue for "${issue.property}" has a deprecated flag`
    );
    Assert.equal(
      typeof issue.experimental,
      "boolean",
      `The issue for "${issue.property}" has an experimental flag`
    );
    Assert.ok(
      Array.isArray(issue.unsupportedBrowsers),
      `The issue for "${issue.property}" has a list of unsupported browsers`
    );
  }
});

function getCompatTable(dataset, property) {
  const node = dataset[property];
  if (node.__compat) {
    return node.__compat;
  }

  // Some properties store their compat data in a context node, e.g. `flex_context`.
  for (const field in node) {
    if (field.endsWith("_context")) {
      return node[field].__compat;
    }
  }

  return null;
}
