/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test for the MDN compatibility diagnosis module.
// This runs against the mock dataset so that it is not impacted by MDN compatibility
// data updates. See test_mdn-compatibility-live-data.js for the smoke test running
// against the real dataset.

const {
  COMPATIBILITY_ISSUE_TYPE,
} = require("resource://devtools/shared/constants.js");
const MDNCompatibility = require("resource://devtools/server/actors/compatibility/lib/MDNCompatibility.js");
const {
  getCSSPropertiesCompatData,
} = require("resource://devtools/shared/compatibility/compatibility-dataset.js");

const FIREFOX_1 = {
  id: "firefox",
  version: "1",
};

const FIREFOX_60 = {
  id: "firefox",
  version: "60",
};

const FIREFOX_69 = {
  id: "firefox",
  version: "69",
};

// Above the version in which -moz-user-focus was removed.
const FIREFOX_130 = {
  id: "firefox",
  version: "130",
};

const FIREFOX_ANDROID_1 = {
  id: "firefox_android",
  version: "1",
};

const SAFARI_13 = {
  id: "safari",
  version: "13",
};

const TEST_DATA = [
  {
    description: "Test for a supported property",
    declarations: [{ name: "background-color" }],
    browsers: [FIREFOX_69],
    expectedIssues: [],
  },
  {
    description: "Test for some supported properties",
    declarations: [{ name: "background-color" }, { name: "color" }],
    browsers: [FIREFOX_69],
    expectedIssues: [],
  },
  {
    description: "Test for an unsupported property",
    declarations: [{ name: "grid-column" }],
    browsers: [FIREFOX_1],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "grid-column",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/grid-column",
        specUrl: "https://drafts.csswg.org/css-grid/#placement-shorthands",
        deprecated: false,
        experimental: false,
        unsupportedBrowsers: [FIREFOX_1],
      },
    ],
  },
  {
    description: "Test for an unknown property",
    declarations: [{ name: "unknown-property" }],
    browsers: [FIREFOX_69],
    expectedIssues: [],
  },
  {
    description: "Test for a deprecated property",
    declarations: [{ name: "clip" }],
    browsers: [FIREFOX_69],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "clip",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/clip",
        specUrl: "https://drafts.csswg.org/css-masking/#propdef-clip",
        deprecated: true,
        experimental: false,
        unsupportedBrowsers: [],
      },
    ],
  },
  {
    description: "Test for a property having some issues",
    declarations: [{ name: "ruby-align" }],
    browsers: [FIREFOX_1],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "ruby-align",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/ruby-align",
        specUrl: "https://drafts.csswg.org/css-ruby/#ruby-align-property",
        deprecated: false,
        experimental: false,
        unsupportedBrowsers: [FIREFOX_1],
      },
    ],
  },
  {
    description:
      "Test for a property whose support is unknown in one of the browsers. Unknown " +
      "support is considered as supported, to avoid reporting issues we are not sure about",
    declarations: [{ name: "animation-timeline" }],
    browsers: [FIREFOX_69, FIREFOX_ANDROID_1],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "animation-timeline",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/animation-timeline",
        specUrl:
          "https://drafts.csswg.org/css-animations-2/#animation-timeline",
        deprecated: false,
        experimental: false,
        // Firefox is not listed, although the dataset has no version for it.
        unsupportedBrowsers: [FIREFOX_ANDROID_1],
      },
    ],
  },
  {
    description:
      "Test for an aliased property not supported in all browsers with prefix needed",
    declarations: [{ name: "-moz-user-select" }],
    browsers: [FIREFOX_69, SAFARI_13],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY_ALIASES,
        property: "user-select",
        aliases: ["-moz-user-select"],
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/user-select",
        specUrl: "https://drafts.csswg.org/css-ui/#content-selection",
        deprecated: false,
        experimental: false,
        prefixNeeded: true,
        unsupportedBrowsers: [SAFARI_13],
      },
    ],
  },
  {
    description:
      "Test for an aliased property not supported in all browsers without prefix needed",
    declarations: [
      { name: "-moz-user-select" },
      { name: "-webkit-user-select" },
    ],
    browsers: [FIREFOX_ANDROID_1, FIREFOX_69, SAFARI_13],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY_ALIASES,
        property: "user-select",
        aliases: ["-moz-user-select", "-webkit-user-select"],
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/user-select",
        specUrl: "https://drafts.csswg.org/css-ui/#content-selection",
        deprecated: false,
        experimental: false,
        prefixNeeded: false,
        unsupportedBrowsers: [FIREFOX_ANDROID_1],
      },
    ],
  },
  {
    description: "Test for aliased properties supported in all browsers",
    declarations: [
      { name: "-moz-user-select" },
      { name: "-webkit-user-select" },
    ],
    browsers: [FIREFOX_69, SAFARI_13],
    expectedIssues: [],
  },
  {
    description:
      "Test for a property defined with prefix, on versions before it was removed",
    declarations: [{ name: "-moz-user-focus" }],
    browsers: [FIREFOX_1, FIREFOX_60, FIREFOX_69],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "-moz-user-focus",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/-moz-user-focus",
        specUrl: undefined,
        deprecated: true,
        experimental: false,
        unsupportedBrowsers: [],
      },
    ],
  },
  {
    description: "Test for a property which was removed",
    declarations: [{ name: "-moz-user-focus" }],
    browsers: [FIREFOX_69, FIREFOX_130],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "-moz-user-focus",
        url: "https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/-moz-user-focus",
        specUrl: undefined,
        deprecated: true,
        experimental: false,
        unsupportedBrowsers: [FIREFOX_130],
      },
    ],
  },
  {
    description: "Test for an experimental property with no MDN url",
    declarations: [{ name: "stroke-color" }],
    browsers: [FIREFOX_69],
    expectedIssues: [
      {
        type: COMPATIBILITY_ISSUE_TYPE.CSS_PROPERTY,
        property: "stroke-color",
        url: undefined,
        specUrl: "https://drafts.csswg.org/fill-stroke-3/#stroke-color",
        deprecated: false,
        experimental: true,
        unsupportedBrowsers: [FIREFOX_69],
      },
    ],
  },
];

add_task(() => {
  Services.prefs.setBoolPref("devtools.compatibility.use-mock-dataset", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("devtools.compatibility.use-mock-dataset");
  });

  const mdnCompatibility = new MDNCompatibility(getCSSPropertiesCompatData());

  for (const {
    description,
    declarations,
    browsers,
    expectedIssues,
  } of TEST_DATA) {
    info(description);
    const issues = mdnCompatibility.getCSSDeclarationBlockIssues(
      declarations,
      browsers
    );
    deepEqual(
      issues,
      expectedIssues,
      "CSS declaration compatibility data matches expectations"
    );
  }
});
