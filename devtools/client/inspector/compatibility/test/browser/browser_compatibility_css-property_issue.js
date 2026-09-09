/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that unsupported CSS properties are correctly reported as issues.

const {
  COMPATIBILITY_ISSUE_TYPE,
} = require("resource://devtools/shared/constants.js");

const TEST_URI = `
  <style>
  body {
    color: blue;
    text-box-edge: text;
    user-modify: read-only;
    stroke-color: red;
    -moz-orient: horizontal;
  }
  div {
    overflow-anchor: auto;
  }
  </style>
  <body>
    <div>test</div>
  </body>
`;

const TEST_DATA_SELECTED = [
  {
    type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
    property: "text-box-edge",
    url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/text-box-edge",
    deprecated: false,
    experimental: false,
  },
  {
    type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY_ALIASES,
    property: "user-modify",
    url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/user-modify",
    aliases: ["user-modify"],
    deprecated: true,
    experimental: false,
  },
  {
    type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
    property: "stroke-color",
    // No MDN url, but a spec one
    specUrl: "https://drafts.csswg.org/fill-stroke-3/#stroke-color",
    deprecated: false,
    experimental: true,
  },
  {
    type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
    property: "-moz-orient",
    // Neither MDN url nor spec url, so the property is not rendered as a link
    deprecated: false,
    experimental: false,
  },
];

const TEST_DATA_ALL = [
  ...TEST_DATA_SELECTED,
  {
    type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
    property: "overflow-anchor",
    url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/overflow-anchor",
    deprecated: false,
    experimental: false,
  },
];

add_task(async function () {
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));

  // This test relies on the mock dataset, see
  // devtools/shared/compatibility/dataset/mock-css-properties.json
  const { allElementsPane, selectedElementPane } =
    await openCompatibilityView();

  info("Check the content of the issue list on the selected element");
  await assertIssueList(selectedElementPane, TEST_DATA_SELECTED);

  info("Check the content of the issue list on all elements");
  await assertIssueList(allElementsPane, TEST_DATA_ALL);
});
