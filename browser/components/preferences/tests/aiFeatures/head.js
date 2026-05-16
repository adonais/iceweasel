/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/preferences/tests/head.js",
  this
);
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/preferences/tests/aiFeatures/head_smart_window.js",
  this
);

async function withPrefsPane(pane, testFn) {
  await openPreferencesViaOpenPreferencesAPI(pane, { leaveOpen: true });
  let doc = gBrowser.selectedBrowser.contentDocument;
  try {
    await testFn(doc);
  } finally {
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  }
}

/**
 * Navigates to the AI features pane in the preferences window.
 *
 * @param {Document} doc - The preferences document
 * @param {Window} win - The preferences window
 */
async function openAiFeaturePanel(doc, win) {
  const paneLoaded = waitForPaneChange("ai");
  const categoryButton = doc.getElementById("category-ai-features");
  categoryButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(categoryButton, {}, win);
  await paneLoaded;
}
