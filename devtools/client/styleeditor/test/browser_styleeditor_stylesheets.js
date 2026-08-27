/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Can't use strict because of octal characters used in "Showing encoded declarations"
/* eslint-disable strict */

// Assert the behavior of various types of stylesheets in the style editor
// as well as in the rules view, without doing any CSSOM/RuleView modification.

const EMPTY_ELEMENT_RULEVIEW_CONTENT = {
  selector: "element",
  selectorEditable: false,
  declarations: [],
};

const TESTS = [
  {
    description: "Only a comment",
    stylesheet: "/* Stylesheet with no rule, but only comment */",
    ruleViewContent: [EMPTY_ELEMENT_RULEVIEW_CONTENT],
  },

  {
    description: "Only a rule with comment",
    stylesheet: "body { /* only an empty rule with a comment */ }",
    styleSheetTextInStyleEditor:
      "body { /* only an empty rule with a comment */\n}\n",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [],
      },
    ],
  },

  {
    description: "Comments around declaration definition",
    stylesheet:
      "body { /* before name */ color /* after name */: /* before value */ red /* after value */; }",
    styleSheetTextInStyleEditor:
      "body { /* before name */\n  color /* after name */: /* before value */ red /* after value */;\n}\n",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [{ name: "color", value: "red" }],
      },
    ],
  },

  {
    description: "Showing encoded declarations",
    stylesheet:
      "\000062 \00006f \000064 \000079 {\000063 \00006f \00006c \00006f \000072 :#\000036 \000036 \000033 \000033 \000039 \000039;}",
    styleSheetTextInStyleEditor:
      "\\00062 \\0006f \\00064 \\00079  {\n  \\00063 \\0006f \\0006c \\0006f \\00072 :#\\00036 \\00036 \\00033 \\00033 \\00039 \\00039;\n}\n",
    ruleViewContent: [
      EMPTY_ELEMENT_RULEVIEW_CONTENT,
      {
        selector: "body",
        declarations: [
          {
            // Bug 2010305: should be:
            // name: "color", and not overridden
            name: "\\00063 \\0006f \\0006c \\0006f \\00072",
            value: "#\\00036 \\00036 \\00033 \\00033 \\00039 \\00039",
            overridden: true,
          },
        ],
      },
    ],
  },
];

add_task(async function () {
  // Disable auto pretty printing as it doesn't help assert the authored text returned by the server.
  pushPref("devtools.styleeditor.disable-pretty-print", true);

  await addTab("data:text/html,<body>css changes</body>");

  const { toolbox, ui } = await openStyleEditor();

  for (const {
    description,
    stylesheet,
    styleSheetTextInStyleEditor,
    ruleViewContent,
  } of TESTS) {
    info(" " + "-".repeat(50));
    info(" #### " + description);

    // Navigate to the test page **after** having loaded devtools
    // to ensure having the authored stylesheet from gecko
    await navigateToAndWaitForStyleSheets(
      "data:text/html,<style>" +
        // For some reason encodeURIComponent replaces "\" with "%"
        // in octal characters which breaks the stylesheet...
        encodeURIComponent(stylesheet).replace(/%000/g, "\\000") +
        "</style><body>css changes</body>",
      ui,
      1
    );
    const editor = await ui.editors[0].getSourceEditor();
    const text = editor.sourceEditor.getText();
    is(
      text,
      // styleSheetTextInStyleEditor will only be defined if for some reason the stylesheet
      // is rendered differently from its original input
      typeof styleSheetTextInStyleEditor == "string"
        ? styleSheetTextInStyleEditor
        : stylesheet,
      "Original stylesheet text is the text content of the <style> element"
    );

    await toolbox.selectTool("inspector");
    const { inspector, view } = await openRuleView();
    await selectNode("body", inspector);
    await checkRuleViewContent(view, ruleViewContent, description);

    // Switch back to the style editor as next for loop iteration expect to be on it
    await toolbox.selectTool("styleeditor");
  }
});
