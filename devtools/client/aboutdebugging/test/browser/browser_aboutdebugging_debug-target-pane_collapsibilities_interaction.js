/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-collapsibilities.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-collapsibilities.js",
  this
);

/**
 * Test that collapsibilities of DebugTargetPane on RuntimePage by mouse clicking.
 */

add_task(async function () {
  prepareCollapsibilitiesTest();

  const { document, tab, window } = await openAboutDebugging();
  await selectThisFirefoxPage(document, window.AboutDebugging.store);

  for (const { title } of TARGET_PANES) {
    info("Check whether this pane is collapsed after clicking the title");
    await toggleCollapsibility(getDebugTargetPane(title, document));
    await assertDebugTargetCollapsed(
      getDebugTargetPane(title, document),
      title
    );

    info("Check whether this pane is expanded after clicking the title again");
    await toggleCollapsibility(getDebugTargetPane(title, document));
    await assertDebugTargetExpanded(getDebugTargetPane(title, document), title);
  }

  await removeTab(tab);
});

/**
 * Test that collapsibilities of DebugTargetPane on RuntimePage by keyboard interaction.
 */

add_task(async function () {
  prepareCollapsibilitiesTest();

  const { document, tab, window } = await openAboutDebugging();
  await selectThisFirefoxPage(document, window.AboutDebugging.store);

  info("Assert that the debug target panes are all expanded");
  for (const { title } of TARGET_PANES) {
    await assertDebugTargetExpanded(getDebugTargetPane(title, document), title);
  }

  const sectionHeadings = [
    ...document.querySelectorAll(".qa-debug-target-pane-title"),
  ];
  const expectedTitles = [
    "Tabs",
    "Temporary Extensions",
    "Extensions",
    "Service Workers",
    "Shared Workers",
    "Other Workers",
  ];

  info("Focus on the first debug target pane title");
  sectionHeadings[0].focus();

  let index = 0;
  while (index < sectionHeadings.length) {
    info(
      `Check that the "${expectedTitles[index]}" pane is collapsed after pressing the Enter key`
    );
    pressKey(window, "Enter");
    assertDebugTargetCollapsed(
      getDebugTargetPane(expectedTitles[index], document),
      expectedTitles[index]
    );
    pressKey(window, "Tab");
    index++;
  }

  await removeTab(tab);
});

const keyMappings = {
  Enter: { code: "VK_RETURN" },
  Tab: { code: "VK_TAB" },
};

function pressKey(win, keyName) {
  const keyEvent = keyMappings[keyName];
  const { code, modifiers } = keyEvent;
  info(`The ${keyName} key is pressed`);
  return EventUtils.synthesizeKey(code, modifiers || {}, win);
}
