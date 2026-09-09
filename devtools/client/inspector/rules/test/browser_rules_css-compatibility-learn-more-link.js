/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that the Learn More link is displayed when possible,
// and that it links to MDN or the spec if no MDN url is provided.

const TEST_URI = `
<style>
  body {
    user-select: none;
    stroke-color: red;
    -moz-orient: horizontal;
  }
</style>
<body>
</body>`;

const TEST_DATA_INITIAL = [
  {
    selector: "body",
    rules: [
      {},
      {
        "user-select": {
          value: "none",
          expected: COMPATIBILITY_TOOLTIP_MESSAGE.default,
          // MDN url
          expectedLearnMoreUrl:
            "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/user-select?utm_source=devtools&utm_medium=inspector-css-compatibility&utm_campaign=default",
        },
        "stroke-color": {
          value: "red",
          expected: COMPATIBILITY_TOOLTIP_MESSAGE.experimental,
          // No MDN url, but a spec one
          expectedLearnMoreUrl:
            "https://drafts.csswg.org/fill-stroke-3/#stroke-color",
        },
        "-moz-orient": {
          value: "horizontal",
          expected: COMPATIBILITY_TOOLTIP_MESSAGE.default,
          // Neither MDN url nor spec url, so there is no link at all
          expectedLearnMoreUrl: null,
        },
      },
    ],
  },
];

add_task(async function () {
  // This test relies on the mock dataset, see
  // devtools/shared/compatibility/dataset/mock-css-properties.json
  await setMockCompatibilityDataset();
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));
  const { inspector, view } = await openRuleView();

  await runCSSCompatibilityTests(view, inspector, TEST_DATA_INITIAL);
});
