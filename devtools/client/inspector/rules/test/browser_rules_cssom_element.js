/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test that changes done to DOM Elements via CSS OM JavaScript API
// are correctly reported in the rule view and markup view.

const TESTS = [
  // Do a couple of tests without CSSOM, just to assert the default rule view behavior on
  // DOM Element styles.
  //
  // Note that doing any CSSOM change would clear all disabled or overriden declarations.
  {
    description: "Showing all possibly overriden declarations",
    styleBefore: "color: red !important; color: blue",

    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "color", value: "red !important" },
          { name: "color", value: "blue", overridden: true },
        ],
      },
    ],
  },
  {
    description: "Showing disabled properties",
    styleBefore: "/*! color: red */ color: blue",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "color", value: "red", overridden: true, enabled: false },
          { name: "color", value: "blue" },
        ],
      },
    ],
  },
  {
    description: "Showing bogus or inexistant property",
    styleBefore: "foo: red; 1: 2; color: bar;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "foo", value: "red", overridden: true, valid: false },
          { name: "1", value: "2", overridden: true, valid: false },
          { name: "color", value: "bar", valid: false },
        ],
      },
    ],
  },

  // Tests which would do CSSOM
  {
    description: "Adding new property",
    styleBefore: "background-color: grey",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue");
    },
    styleAfter: "background-color: grey; color: blue;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "background-color", value: "grey" },
          { name: "color", value: "blue" },
        ],
      },
    ],
  },
  {
    description: "Adding new important property",
    styleBefore: "background-color: grey",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue", "important");
    },
    styleAfter: "background-color: grey; color: blue !important;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "background-color", value: "grey" },
          { name: "color", value: "blue !important" },
        ],
      },
    ],
  },

  {
    /* doing any CSSOM will clear all disabled/overriden declarations */
    description: "Adding new property on rule with disabled property",
    styleBefore: "/*! background-color: grey */",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue");
    },
    styleAfter: "color: blue;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [{ name: "color", value: "blue" }],
      },
    ],
  },
  {
    /* doing any CSSOM will clear all disabled/overriden declarations */
    description: "Adding new property on rule with overridden property",
    styleBefore: "color: red; color: green; background-color: grey",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue");
    },
    styleAfter: "color: blue; background-color: grey;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "color", value: "blue" },
          { name: "background-color", value: "grey" },
        ],
      },
    ],
  },
  {
    description: "Changing existing property",
    styleBefore: "color: red; background-color: grey",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue");
    },
    styleAfter: "color: blue; background-color: grey;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [
          { name: "color", value: "blue" },
          { name: "background-color", value: "grey" },
        ],
      },
    ],
  },
  {
    /* Setting a property via CSSOM would override any possibly important property */
    description: "Changing important existing property",
    styleBefore: "color: red !important",
    contentTask: async () => {
      content.document.body.style.setProperty("color", "blue");
    },
    styleAfter: "color: blue;",
    ruleViewContent: [
      {
        selector: "element",
        selectorEditable: false,
        declarations: [{ name: "color", value: "blue" }],
      },
    ],
  },
];

add_task(async function () {
  await addTab("data:text/html,<body>css changes to dom element style</body>");

  const { inspector, view } = await openRuleView();

  for (const {
    description,
    styleBefore,
    contentTask,
    styleAfter,
    ruleViewContent,
  } of TESTS) {
    info(" " + "-".repeat(50));
    info(" #### " + description);

    await navigateTo(
      `data:text/html,<body style="${styleBefore}">CSS Changes to dom element style</body>`
    );
    await selectNode("body", inspector);

    if (contentTask) {
      const onInspectorUpdated = inspector.once("rule-view-refreshed");
      await SpecialPowers.spawn(gBrowser.selectedBrowser, [], contentTask);
      await onInspectorUpdated;
    }

    if (styleAfter) {
      const newStyle = await SpecialPowers.spawn(
        gBrowser.selectedBrowser,
        [],
        function () {
          return content.document.body.getAttribute("style");
        }
      );
      is(
        newStyle,
        styleAfter,
        `[${description}] DOM Element style attribute is correct`
      );
    }

    await checkRuleViewContent(view, ruleViewContent, description);
  }
});
