/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

ChromeUtils.defineLazyGetter(this, "SidebarTestUtils", () => {
  const { SidebarTestUtils: utils } = ChromeUtils.importESModule(
    "resource://testing-common/SidebarTestUtils.sys.mjs"
  );
  utils.init(this);
  return utils;
});

/**
 * Select all the text of a page with the mouse pressed, then release it.
 *
 * @param {MozBrowser} browser the browser to select in
 * @param {object} [options]
 * @param {Window} [options.win] the window to run the select all command in
 * @param {number} [options.releaseX] where to release the mouse
 * @param {number} [options.releaseY] where to release the mouse
 * @param {number} [options.holdMs] ms to wait after selecting before the release
 */
async function selectAllAndMouseUp(
  browser,
  { win = window, releaseX = 60, releaseY = 10, holdMs = 0 } = {}
) {
  await SimpleTest.promiseFocus(browser);
  await BrowserTestUtils.synthesizeMouse(
    browser,
    10,
    10,
    { type: "mousedown" },
    browser
  );
  const selectPromise = SpecialPowers.spawn(browser, [], () =>
    ContentTaskUtils.waitForCondition(() => content.getSelection().toString())
  );
  win.goDoCommand("cmd_selectAll");
  await selectPromise;
  if (holdMs) {
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, holdMs));
  }
  await BrowserTestUtils.synthesizeMouse(
    browser,
    releaseX,
    releaseY,
    { type: "mouseup" },
    browser
  );
}
