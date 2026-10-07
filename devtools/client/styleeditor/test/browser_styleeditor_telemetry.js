/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Assert the functionality of telemetry probes in the style editor.
add_task(async function testStylesheetLinksToStyleEditorTelemetry() {
  Services.fog.testResetFOG();
  // Make sure the style sheets will open in the style editor.
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", false);

  await addTab(
    "data:text/html,<style>body { background: red; }</style><body>css changes</body>"
  );

  const { toolbox } = await openStyleEditor();
  const { inspector, view: ruleView } = await openRuleView();

  await selectNode("body", inspector);

  info(
    "Find the style link in the rule view and click it to open in the style editor"
  );
  const link = getRuleViewLinkByIndex(ruleView, 1);
  is(link.textContent, "inline:1", "The link text is correct");

  link.scrollIntoView();
  link.click();

  await toolbox.once("styleeditor-selected");

  is(
    Glean.devtoolsStyleeditorStylesheets.linksOpenedInStyleEditorCount.testGetValue(),
    1,
    "The links opened in style editor count is 1"
  );
});

// Assert the functionality of telemetry probes in the style editor when a style sheet is selected.
add_task(async function testSelectStyleSheetTelemetry() {
  Services.fog.testResetFOG();
  const { ui } = await openStyleEditorForURL(TEST_BASE_HTTPS + "simple.html");
  const editor = ui.editors[1];

  info("Selecting style sheet #1.");
  await ui.selectStyleSheet(editor.styleSheet, 5);

  // Assert the telemetry counter for style sheet opened in style editor is incremented.
  // 1 from the pre-selected style sheet, and 1 from the selectStyleSheet call.
  await waitFor(
    () =>
      Glean.devtoolsStyleeditorStylesheets.stylesheetsOpenedCount.testGetValue() ===
      2,
    "The style sheet opened in the style editor count is 2"
  );
});

// Assert the functionality of telemetry probes in the style editor when a style sheet is edited.
add_task(async function testEditStyleSheetTelemetry() {
  Services.fog.testResetFOG();
  const { ui } = await openStyleEditorForURL(TEST_BASE_HTTPS + "simple.html");
  const editor = ui.editors[1];

  info("Selecting style sheet #1.");
  await ui.selectStyleSheet(editor.styleSheet, 5);

  await waitUntil(() => editor.sourceEditor);

  const onStyleApplied = editor.once("style-applied");
  editor.sourceEditor.setText("body { background: red; }");
  await onStyleApplied;

  await waitFor(
    () =>
      Glean.devtoolsStyleeditorStylesheets.stylesheetsEditedCount.testGetValue() ===
      1,
    "The style sheet edited in the style editor count is 1"
  );
});
