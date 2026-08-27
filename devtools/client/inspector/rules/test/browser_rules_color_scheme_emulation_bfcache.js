/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test color scheme emulation.
const TEST_URI = URL_ROOT_SSL + "doc_media_queries.html";

add_task(async function testBfCacheNavigationWithDevTools() {
  await pushPref("layout.css.custom-media.enabled", true);

  await addTab(TEST_URI);
  const defaultPrefersDark = await getCurrentPrefersDark();
  const { inspector, view, toolbox } = await openRuleView();

  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );

  await assertEmulationPanelClosed(view);
  await openEmulationPanel(view);

  const { lightButton, darkButton, noneButton } =
    getColorSchemeEmulationButtons(inspector);
  const buttonToEnable = defaultPrefersDark ? lightButton : darkButton;
  ok(buttonToEnable, "The opposite color scheme emulation button exists");
  ok(noneButton, "The none button exists");

  info(`Click on the ${defaultPrefersDark ? "light" : "dark"} button`);
  buttonToEnable.click();
  await waitForEmulationEnabled(defaultPrefersDark);
  is(
    await isEmulationEnabled(defaultPrefersDark),
    true,
    "color scheme emulation is enabled"
  );

  info("Navigate to a different URL and disable the color emulation");
  await navigateTo(TEST_URI + "?someparameter");

  const { noneButton: noneButtonAfterNavigation } =
    getColorSchemeEmulationButtons(inspector);
  noneButtonAfterNavigation.click();
  await waitForEmulationDisabled(defaultPrefersDark);
  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );

  info(
    "Perform a bfcache navigation and check that the emulation is still disabled"
  );
  const waitForDevToolsReload = await watchForDevToolsReload(
    gBrowser.selectedBrowser
  );
  gBrowser.goBack();
  await waitForDevToolsReload();
  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );

  await toolbox.destroy();
});

add_task(async function testBfCacheNavigationAfterClosingDevTools() {
  await addTab(TEST_URI);
  const defaultPrefersDark = await getCurrentPrefersDark();
  const { inspector, toolbox } = await openRuleView();

  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );

  const { lightButton, darkButton } = getColorSchemeEmulationButtons(inspector);
  const buttonToEnable = defaultPrefersDark ? lightButton : darkButton;
  ok(buttonToEnable, "The opposite color scheme emulation button exists");

  info(`Click on the ${defaultPrefersDark ? "light" : "dark"} button`);
  buttonToEnable.click();
  await waitForEmulationEnabled(defaultPrefersDark);
  is(
    await isEmulationEnabled(defaultPrefersDark),
    true,
    "color scheme emulation is enabled"
  );

  // Wait for the iframe target to be processed before destroying the toolbox,
  // to avoid unhandled promise rejections.
  // The iframe URL starts with https://example.org/document-builder.sjs
  const iframeURL = "https://example.org/document-builder.sjs";
  const onIframeProcessed = waitForTargetProcessed(
    toolbox.commands,
    targetFront => targetFront.url.startsWith(iframeURL)
  );

  info("Navigate to a different URL");
  await navigateTo(TEST_URI + "?someparameter");

  info("Wait for the iframe target to be processed by target-command");
  await onIframeProcessed;

  info("Close DevTools to disable the emulation");
  await toolbox.destroy();
  await waitForEmulationDisabled(defaultPrefersDark);
  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );

  info(
    "Perform a bfcache navigation and check that the emulation is still disabled"
  );
  const awaitPageShow = BrowserTestUtils.waitForContentEvent(
    gBrowser.selectedBrowser,
    "pageshow"
  );
  gBrowser.goBack();
  await awaitPageShow;

  is(
    await isEmulationEnabled(defaultPrefersDark),
    false,
    "color scheme emulation is disabled"
  );
});

function getColorSchemeEmulationButtons(inspector) {
  const doc = inspector.panelDoc;
  return {
    lightButton: doc.querySelector("#color-scheme-emulation-light"),
    darkButton: doc.querySelector("#color-scheme-emulation-dark"),
    noneButton: doc.querySelector("#color-scheme-emulation-none"),
  };
}

async function isEmulationEnabled(defaultPrefersDark) {
  return (await getCurrentPrefersDark()) !== defaultPrefersDark;
}

async function waitForEmulationEnabled(defaultPrefersDark) {
  await waitFor(
    async () => (await getCurrentPrefersDark()) !== defaultPrefersDark
  );
}

async function waitForEmulationDisabled(defaultPrefersDark) {
  await waitFor(
    async () => (await getCurrentPrefersDark()) === defaultPrefersDark
  );
}
