/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Smoke test making sure the compatibility panel still reports issues when using the live
// MDN compatibility data. All the other tests of this folder run against a mock dataset,
// see devtools/shared/compatibility/dataset/mock-css-properties.json.
// Assertions here should stay loose enough to survive any MDN compatibility data update.

const {
  updateTargetBrowsers,
} = require("resource://devtools/client/inspector/compatibility/actions/compatibility.js");

// Targeting the very first version of Firefox, so that any property which is not as old
// as the browser itself is reported as unsupported.
const TARGET_BROWSERS = [{ id: "firefox", name: "Firefox", version: "1" }];

// `aspect-ratio` is deliberately not part of the mock dataset, so it can only be reported
// as an issue when the live dataset is used.
const PROPERTY = "aspect-ratio";

const TEST_URI = `
  <style>
  body {
    ${PROPERTY}: auto;
  }
  </style>
  <body></body>
`;

add_task(async function () {
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));

  const { inspector, selectedElementPane } = await openCompatibilityView({
    mockDataset: false,
  });

  info("Update the target browsers for this test");
  await inspector.store.dispatch(updateTargetBrowsers(TARGET_BROWSERS));

  info(`Wait for the issue about ${PROPERTY} to be displayed`);
  const issueEl = await waitFor(
    () => getIssueItem(PROPERTY, selectedElementPane),
    `The issue for ${PROPERTY} is displayed`
  );

  const unsupportedBrowsers = JSON.parse(issueEl.dataset.qaUnsupportedBrowsers);
  Assert.greater(
    unsupportedBrowsers.length,
    0,
    `The issue for ${PROPERTY} lists unsupported browsers`
  );

  const url = JSON.parse(issueEl.dataset.qaUrl);
  ok(url.startsWith("https://"), `The issue for ${PROPERTY} has a url: ${url}`);
});
