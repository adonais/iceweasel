/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that editing a property's from the Inspector's Rule View
// is correctly updating Style Editor text content.

const EMPTY_ELEMENT_RULEVIEW_CONTENT = {
  selector: "element",
  selectorEditable: false,
  declarations: [],
};

// When editing the last declaration, a new empty declaration will be created in the rule view.
// This relates to devtools.inspector.rule-view.focusNextOnEnter which is true by default,
// and focus the next declaration and so when editing the last, would create a new empty one.
const EMPTY_DECLARATION = { name: "", value: "", enabled: false };

const TESTS = [
  {
    description: "New rule",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const { UI } = await inspector.toolbox.getPanel("styleeditor");
      // Wait for the StyleSheet editor to be added for the new rule's stylesheet
      // (DevTools instantiate a new stylesheet when adding a new rule)
      // then also wait for CodeMirror to be fully initiatized via getSourceEditor.
      const onEditorAddedAndUpdated = UI.once("editor-selected").then(
        editor => {
          return editor.getSourceEditor();
        }
      );
      await addNewRuleAndDismissEditor(inspector, view, "body", 1);
      await onEditorAddedAndUpdated;
      await addProperty(view, 1, "color", "green");
    },
    newStylesheet: "\nbody {\n  color: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [{ name: "color", value: "green", dirty: true }],
      },
      {
        selector: "body",
        declarations: [{ name: "color", value: "blue", overridden: true }],
      },
    ],
  },
  {
    description: "Add declaration",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      await addProperty(view, 1, "color", "green");
    },
    stylesheetAfter: "body {\n  color: blue;\n  color: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue", dirty: true, overridden: true },
          { name: "color", value: "green", dirty: true },
        ],
      },
    ],
  },
  {
    description: "Add unsupported declaration name",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      await addProperty(view, 1, "unsupported", "green");
    },
    stylesheetAfter: "body {\n  color: blue;\n  unsupported: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue" },
          // Notice that unsupported name is overridden while unsupported value isn't.
          {
            name: "unsupported",
            value: "green",
            overridden: true,
            valid: false,
            dirty: true,
          },
        ],
      },
    ],
  },
  {
    // Note that unsupported name or value involves different codepath in Rust codebase (declaration_block.rs)
    description: "Add unsupported declaration value",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      await addProperty(view, 1, "font-size", "red");
    },
    stylesheetAfter: `body {\n  color: blue;\n  font-size: red;\n}`,
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue" },
          { name: "font-size", value: "red", valid: false, dirty: true },
        ],
      },
    ],
  },
  {
    description: "Add disabled declaration",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      // addProperty helper doesn't support adding commented property+value at the same time
      const ruleEditor = getRuleViewRuleEditorAt(view, 1);
      const editor = await focusNewRuleViewProperty(ruleEditor);
      editor.input.value = "/* color: green */";

      info("Pressing RETURN and waiting for the value field focus");
      const onNameAdded = view.once("ruleview-changed");
      EventUtils.synthesizeKey("VK_RETURN", {}, view.styleWindow);
      await onNameAdded;
    },
    stylesheetAfter: "body {\n  color: blue;\n  /*! color: green; */\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue", dirty: true },
          {
            name: "color",
            value: "green",
            enabled: false,
            dirty: true,
            overridden: true,
          },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Update unsupported declarations",
    stylesheetBefore: "body {\n  color: blue;\n  foo: red;\n}",
    async test(inspector, view) {
      const prop1 = getTextProperty(view, 1, { color: "blue" });
      await renameProperty(view, prop1, "bar");

      // For some reason, renaming two properties in a row creates a race condition
      // and the second wouldn't work as expected.
      await wait(500);

      const prop2 = getTextProperty(view, 1, { foo: "red" });
      await renameProperty(view, prop2, "background-color");
    },
    stylesheetAfter: "body {\n  bar: blue;\n  background-color: red;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          {
            name: "bar",
            value: "blue",
            overridden: true,
            valid: false,
            dirty: false, // Bug 2053087: this prop should be dirty as it was renamed
          },
          {
            name: "background-color",
            value: "red",
            dirty: false, // Bug 2053087: same, it should be dirty
          },
        ],
      },
    ],
  },
  {
    description: "Update declaration",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter: "body {\n  color: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Update first declaration",
    stylesheetBefore:
      "body {\n  color: blue;\n  color: white;\n  color: red;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter:
      "body {\n  color: green;\n  color: white;\n  color: red;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green", overridden: true, dirty: true },
          { name: "color", value: "white", dirty: true },
          { name: "color", value: "red", dirty: true },
        ],
      },
    ],
  },
  {
    description: "Update middle declaration",
    stylesheetBefore:
      "body {\n  color: blue;\n  color: white;\n  color: red;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "white" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter:
      "body {\n  color: blue;\n  color: green;\n  color: red;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue", overridden: true, dirty: true },
          { name: "color", value: "green", overridden: true, dirty: true },
          { name: "color", value: "red", dirty: true },
        ],
      },
    ],
  },
  {
    description: "Update last declaration",
    stylesheetBefore:
      "body {\n  color: blue;\n  color: white;\n  color: red;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "red" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter:
      "body {\n  color: blue;\n  color: white;\n  color: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue", overridden: true, dirty: true },
          { name: "color", value: "white", overridden: true, dirty: true },
          { name: "color", value: "green", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Update declaration to become important",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green !important");
    },
    stylesheetAfter: "body {\n  color: green !important;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green !important", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Update declaration to no longer be important",
    stylesheetBefore: "body {\n  color: blue !important;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter: "body {\n  color: green;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Update overridden declaration",
    stylesheetBefore: "body {\n  color: blue;\n  color: red;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter: "body {\n  color: green;\n  color: red;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green", dirty: true, overridden: true },
          { name: "color", value: "red", dirty: true },
        ],
      },
    ],
  },

  /************
   * Nested CSS
   */
  {
    description: "Add nested declaration",
    stylesheetBefore: "html {\n  body {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      await addProperty(view, 1, "color", "green");
    },
    stylesheetAfter:
      "html {\n  body {\n    color: blue;\n    color: green;\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "& body",
        ancestorRulesData: ["html {"],
        declarations: [
          { name: "color", value: "blue", dirty: true, overridden: true },
          { name: "color", value: "green", dirty: true },
        ],
      },
    ],
  },
  {
    description: "Update nested declaration",
    stylesheetBefore: "html {\n  body {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter: "html {\n  body {\n    color: green;\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "& body",
        ancestorRulesData: ["html {"],
        declarations: [
          { name: "color", value: "green", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Remove nested declaration",
    stylesheetBefore: "html {\n  body {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await removeProperty(view, prop);
    },
    stylesheetAfter: "html {\n  body {\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "& body",
        ancestorRulesData: ["html {"],
        declarations: [],
      },
    ],
  },
  /********************************
   * Nested mediaquery declarations
   *
   * TODO: Bug 2053107
  {
    description: "Add nested @media declaration",
    stylesheetBefore: "html {\n  @media screen {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      await addProperty(view, 1, "color", "green");
    },
    stylesheetAfter:
      "html {\n  @media screen {\n    color: blue;\n    color: green;\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "@media screen",
        ancestorRulesData: ["html {"],
        declarations: [
          { name: "color", value: "blue", dirty: true, overridden: true },
          { name: "color", value: "green", dirty: true },
        ],
      },
    ],
  },
  {
    description: "Update nested @media declaration",
    stylesheetBefore: "html {\n  @media screen {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await setProperty(view, prop, "green");
    },
    stylesheetAfter: "html {\n  body {\n    color: green;\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "@media screen",
        ancestorRulesData: ["html {"],
        declarations: [
          { name: "color", value: "green", dirty: true },
          EMPTY_DECLARATION,
        ],
      },
    ],
  },
  {
    description: "Remove nested @media declaration",
    stylesheetBefore: "html {\n  @media screen {\n    color: blue;\n  }\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await removeProperty(view, prop);
    },
    stylesheetAfter: "html {\n  body {\n  }\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "@media screen",
        ancestorRulesData: ["html {"],
        declarations: [],
      },
    ],
  },
  */

  /***********************
   * TOGGLING DECLARATIONS
   */
  // Note that toggling declarations won't flag them as dirty
  {
    description: "Enable declaration",
    stylesheetBefore: "body {\n/*!  color: blue;\n*/\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await togglePropStatus(view, prop);
    },
    stylesheetAfter: "body {\ncolor: blue;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [{ name: "color", value: "blue" }],
      },
    ],
  },
  {
    description: "Disable declaration",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await togglePropStatus(view, prop);
    },
    stylesheetAfter: "body {\n  /*! color: blue; */\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "blue", enabled: false, overridden: true },
        ],
      },
    ],
  },
  {
    description: "Enable declaration with inline comment",
    stylesheetBefore:
      "body {\n  /*! border: 1px solid /\\* color *\\/ red; */\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { border: "1px solid red" });
      await togglePropStatus(view, prop);
    },
    stylesheetAfter: "body {\n  border: 1px solid /* color */ red;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [{ name: "border", value: "1px solid red" }],
      },
    ],
  },
  {
    description: "Disable declaration with inline comment",
    stylesheetBefore: "body {\n  border: 1px solid /* color */ red;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { border: "1px solid red" });
      await togglePropStatus(view, prop);
    },
    stylesheetAfter:
      "body {\n  /*! border: 1px solid /\\* color *\\/ red; */\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          {
            name: "border",
            value: "1px solid red",
            enabled: false,
            overridden: true,
          },
        ],
      },
    ],
  },
  {
    description: "Disable declaration and fallback to overridden one",
    stylesheetBefore: "body {\n  color: green;\n  color: blue;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await togglePropStatus(view, prop);
    },
    stylesheetAfter: "body {\n  color: green;\n  /*! color: blue; */\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          { name: "color", value: "green" },
          { name: "color", value: "blue", enabled: false, overridden: true },
        ],
      },
    ],
  },
  {
    description: "Remove declaration",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const prop = getTextProperty(view, 1, { color: "blue" });
      await removeProperty(view, prop);
    },
    stylesheetAfter: "body {\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [],
      },
    ],
  },
  {
    description: "Edit selector",
    stylesheetBefore: "body {\n  color: blue;\n}",
    async test(inspector, view) {
      const ruleEditor = getRuleViewRuleEditorAt(view, 1);
      await editSelectorForRuleEditor(view, ruleEditor, "html > body");
    },
    stylesheetAfter: "html > body {\n  color: blue;\n}",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "html > body",
        declarations: [{ name: "color", value: "blue" }],
      },
    ],
  },
];

add_task(async function () {
  // Disable auto pretty printing as it doesn't help assert the authored text returned by the server.
  pushPref("devtools.styleeditor.disable-pretty-print", true);

  await addTab("data:text/html,<body>css changes</body>");

  const { inspector, view } = await openRuleView();
  const { UI } = await inspector.toolbox.selectTool("styleeditor");
  await inspector.toolbox.selectTool("inspector");

  for (const {
    description,
    stylesheetBefore,
    test,
    newStylesheet,
    stylesheetAfter,
    ruleViewContent,
  } of TESTS) {
    info(" " + "-".repeat(50));
    info(" #### " + description);

    // Navigate to the test page **after** having loaded devtools
    // to ensure having the authored stylesheet from gecko
    const onClear = UI.once("stylesheets-clear");
    await navigateTo(
      "data:text/html,<style>" +
        encodeURIComponent(stylesheetBefore) +
        "</style><body>css changes</body>"
    );
    await onClear;
    await waitUntil(() => UI.editors.length === 1);

    await selectNode("body", inspector);

    const editor = await UI.editors[0].getSourceEditor();
    let editorText = editor.sourceEditor.getText();
    const styleElementText = await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [],
      async function () {
        return content.document.styleSheets[0].ownerNode.textContent;
      }
    );
    is(
      styleElementText,
      editorText,
      `Original stylesheet text is the text content of the <style> element for '${description}'`
    );

    const onEditorAdded = UI.once("editor-added");
    const onEditorUpdated = editor.once("style-applied");
    await test(inspector, view);

    // We may either update the existing stylesheet,
    // or create a new stylesheet when adding a new rule.
    // Assert the text content for that one stylesheet.
    const updatedEditor = await (newStylesheet
      ? onEditorAdded
      : onEditorUpdated.then(() => editor));

    // Unfortunately, when adding properties/declarations,
    // there may be an arbitrary number of style-applied emitted.
    // Even when adding only one, you may get a first one for the
    // name and a subsequent one for the value.
    await wait(500);
    editorText = updatedEditor.sourceEditor.getText();
    is(
      editorText,
      newStylesheet || stylesheetAfter,
      `The new stylesheet text is correct for '${description}'`
    );

    info(" # check rule view content for: " + description);
    await checkRuleViewContent(view, ruleViewContent, description);
  }
});
