/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test that 'Save' function works.

const TEST_HTML_HTTP_URL = TEST_BASE_HTTPS + "simple.html";
const TEST_CSS_HTTP_URL = TEST_BASE_HTTPS + "simple.css";

const TEST_HTML_FILE_URL = getSupportsFile("simple.html").spec;

add_task(async function testSavingToCustomLocalFile() {
  const { ui } = await openStyleEditorForURL(TEST_HTML_HTTP_URL);

  is(ui.editors.length, 2, "Two sheets present after load.");
  const editor = ui.editors.find(e => e.friendlyName === "simple.css");
  ok(editor, "Found the simple stylesheet editor");
  await editor.getSourceEditor();
  let tooltip = editor.summary
    .querySelector(".stylesheet-name > label")
    .getAttribute("tooltiptext");
  is(
    tooltip,
    TEST_CSS_HTTP_URL,
    "The css tooltip originaly refers to the http URL"
  );

  is(
    editor.savedFile,
    null,
    "savedFile should not be pre-populated from the source file"
  );

  info("Editing the style sheet.");
  let dirty = editor.sourceEditor.once("dirty-change");
  const newTextContent = "DIRTY TEXT";
  editor.sourceEditor.replaceText("DIRTY TEXT");

  await dirty;

  is(editor.sourceEditor.isClean(), false, "Editor is dirty.");
  ok(
    editor.summary.classList.contains("unsaved"),
    "Star icon is present in the corresponding summary."
  );

  info(
    "Saving the changes with an explicit file (simulating a user-chosen save location)."
  );
  dirty = editor.sourceEditor.once("dirty-change");

  const cssFile = new FileUtils.File(
    PathUtils.join(PathUtils.profileDir, "simple-edited.css")
  );
  await new Promise(resolve => {
    editor.saveToFile(cssFile, function (file) {
      ok(file, "file should get saved when explicitly passing a file");
      resolve();
    });
  });

  await dirty;

  is(editor.sourceEditor.isClean(), true, "Editor is clean.");
  ok(
    !editor.summary.classList.contains("unsaved"),
    "Star icon is not present in the corresponding summary."
  );

  is(
    editor.savedFile?.path,
    cssFile.path,
    "savedFile should now be set on the editor"
  );

  tooltip = editor.summary
    .querySelector(".stylesheet-name > label")
    .getAttribute("tooltiptext");
  is(
    tooltip,
    TEST_CSS_HTTP_URL,
    "Once saved, the css tooltip still refers to the original HTTP URL"
  );

  is(
    readFile(cssFile),
    newTextContent,
    "local file content has the expected content"
  );
});

add_task(async function testSavingToExistingLocalFile() {
  const { ui } = await openStyleEditorForURL(TEST_HTML_FILE_URL);

  is(ui.editors.length, 2, "Two sheets present after load.");
  const editor = ui.editors.find(e => e.friendlyName === "simple.css");
  ok(editor, "Found the simple stylesheet editor");

  info("Selecting the related editor");
  await ui.selectStyleSheet(editor.styleSheet);
  const styleEditor = await editor.getSourceEditor();
  const text = styleEditor.sourceEditor.getText();
  const originalContent = await (
    await fetch(TEST_BASE_HTTPS + "simple.css")
  ).text();
  is(text, originalContent, "style inspector content is correct");
  const tooltip = editor.summary
    .querySelector(".stylesheet-name > label")
    .getAttribute("tooltiptext");
  // The test file is a symlink and may not be having the exact same file URL as TEST_CSS_FILE_URL
  ok(
    tooltip.startsWith("file://") && tooltip.endsWith("simple.css"),
    "the tooltip refers to the local file URL"
  );

  info(
    "Change the stylesheet text and see if we can save changes to the local file"
  );
  let dirty = editor.sourceEditor.once("dirty-change");
  const newContent = "* { color: green }";
  editor.sourceEditor.setText(newContent);
  await dirty;

  let onSaved = editor.once("property-change");
  editor.summary.querySelector(".stylesheet-saveButton").click();
  await onSaved;

  let updatedFileContent = await (
    await fetch(TEST_BASE_HTTPS + "simple.css", { cache: "no-store" })
  ).text();
  is(updatedFileContent, newContent);

  info(
    "Revert back to original text content to avoid introducing changes in local repo"
  );
  dirty = editor.sourceEditor.once("dirty-change");
  editor.sourceEditor.setText(originalContent);
  await dirty;

  onSaved = editor.once("property-change");
  editor.summary.querySelector(".stylesheet-saveButton").click();
  await onSaved;

  updatedFileContent = await (
    await fetch(TEST_BASE_HTTPS + "simple.css")
  ).text();
  is(
    updatedFileContent,
    originalContent,
    "Local file text content was reverted"
  );
});

function readFile(file) {
  const fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  fstream.init(file, -1, 0, 0);
  const data = NetUtil.readInputStreamToString(fstream, fstream.available());
  fstream.close();
  return data;
}
