/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-collapsibilities.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-collapsibilities.js",
  this
);

/**
 * Check that navigating from This Firefox to Setup and back to This Firefox works and
 * does not leak.
 */

const TAB_URL_1 = "data:text/html,<title>TAB1</title>";
const TAB_URL_2 = "data:text/html,<title>TAB2</title>";

add_task(async function () {
  info("Force all debug target panes to be expanded");
  prepareCollapsibilitiesTest();

  const { document, tab, window } = await openAboutDebugging();
  const AboutDebugging = window.AboutDebugging;
  await selectThisFirefoxPage(document, AboutDebugging.store);

  const setupSidebarItem = findSidebarItemByText("Setup", document);
  ok(setupSidebarItem, "Found the Setup sidebar item");

  const thisFirefoxString = getThisFirefoxString(window);
  const thisFirefoxSidebarItem = findSidebarItemByText(
    thisFirefoxString,
    document
  );
  ok(thisFirefoxSidebarItem, `Found the ${thisFirefoxString} sidebar item`);

  ok(
    isSidebarItemSelected(thisFirefoxSidebarItem),
    `${thisFirefoxString} sidebar item is selected by default`
  );

  info("Open a new background tab TAB1");
  const backgroundTab1 = await addTab(TAB_URL_1, { background: true });

  info("Wait for the tab to appear in the debug targets with the correct name");
  await waitUntil(() => findDebugTargetByText("TAB1", document));

  await waitForAboutDebuggingRequests(AboutDebugging.store);
  info("Click on the Setup item in the sidebar");
  selectSidebarItemPage("Setup", document);

  info("Wait until Connect page is displayed");
  await waitUntil(() => document.querySelector(".qa-connect-page"));
  // we need to wait here because the sidebar isn't updated after mounting the page
  info("Wait until Setup sidebar item is selected");
  await waitUntil(() => isSidebarItemSelected(setupSidebarItem));
  ok(
    !document.querySelector(".qa-runtime-page"),
    "Runtime page no longer rendered"
  );

  info("Open a new tab which should be listed when we go back to This Firefox");
  const backgroundTab2 = await addTab(TAB_URL_2, { background: true });

  info("Click on the ThisFirefox item in the sidebar");
  const requestsSuccess = waitForRequestsSuccess(AboutDebugging.store);
  selectSidebarItemPage(thisFirefoxString, document);

  info("Wait for all target requests to complete");
  await requestsSuccess;

  info("Wait until ThisFirefox page is displayed");
  await waitUntil(() => document.querySelector(".qa-runtime-page"));
  ok(
    isSidebarItemSelected(thisFirefoxSidebarItem),
    "ThisFirefox sidebar item is selected again"
  );
  ok(
    !document.querySelector(".qa-connect-page"),
    "Connect page no longer rendered"
  );

  info("TAB2 should already be displayed in the debug targets");
  await waitUntil(() => findDebugTargetByText("TAB2", document));

  info("Remove first background tab");
  await removeTab(backgroundTab1);

  info(
    "Check TAB1 disappears, meaning ThisFirefox client is correctly connected"
  );
  await waitUntil(() => !findDebugTargetByText("TAB1", document));

  info("Remove second background tab");
  await removeTab(backgroundTab2);

  info(
    "Check TAB2 disappears, meaning ThisFirefox client is correctly connected"
  );
  await waitUntil(() => !findDebugTargetByText("TAB2", document));

  await waitForAboutDebuggingRequests(AboutDebugging.store);

  await removeTab(tab);
});
