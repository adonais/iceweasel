/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// shared-head.js handles imports, constants, and utility functions
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/shared/test/shared-head.js",
  this
);

/**
 * Open a toolbox on a blank tab with the new settings panel selected.
 *
 * @return {Promise<{toolbox: Toolbox, root: DevToolsSettings}>} the toolbox and
 *   the settings panel's root element, once it has rendered
 */
async function openSettings() {
  await pushPref("devtools.settings.redesign-enabled", true);
  const tab = await addTab("about:blank");
  const toolbox = await openToolboxForTab(tab, "options");
  const root = toolbox.getCurrentPanel().element;
  await root.updateComplete;
  return { toolbox, root };
}

/**
 * Find a select in the settings panel and wait until its options render.
 *
 * @param {DevToolsSettings} root The settings panel's root element
 * @param {string} selector CSS selector of the moz-select to find
 * @return {Promise<MozSelect>}
 */
async function getSelect(root, selector) {
  const select = root.shadowRoot.querySelector(selector);
  await select.closest("devtools-settings-pref").updateComplete;
  await select.updateComplete;
  await waitFor(
    () => select.inputEl.options.length,
    "The select renders its options"
  );
  return select;
}

/**
 * Choose an option in a select through its popup, as a user would.
 *
 * @param {MozSelect} select The select to change
 * @param {string} value The value of the option to choose
 * @return {Promise} resolves once the select fires its change event
 */
async function chooseOption(select, value) {
  const index = [...select.inputEl.options].findIndex(
    option => option.value === value
  );
  const popupShown = BrowserTestUtils.waitForSelectPopupShown(window);
  select.focus();
  EventUtils.synthesizeKey(" ", {}, select.ownerGlobal);
  const popup = await popupShown;
  const changed = BrowserTestUtils.waitForEvent(select, "change");
  popup.activateItem(popup.querySelectorAll("menuitem")[index]);
  await changed;
}
