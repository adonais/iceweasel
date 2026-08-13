/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Check that the Browser Console can separately show or hide messages emitted by
// the browser itself (privileged "chrome" code) and by web content, and that
// these "Browser"/"Content" filters are not displayed in the Web Console.

"use strict";

const TEST_URI =
  "https://example.com/browser/devtools/client/webconsole/" +
  "test/browser/test-console.html";

const CHROME_MESSAGE = "browser-console-origin-filter-chrome";
const CONTENT_MESSAGE = "browser-console-origin-filter-content";

add_task(async function () {
  // Make the Browser Console watch content processes so content messages show up.
  await pushPref("devtools.browsertoolbox.scope", "everything");

  info("Open the Web Console and check it has no origin filters");
  let hud = await openNewTabAndConsole(TEST_URI);

  let filterState = await getFilterState(hud);
  is(
    filterState.chrome,
    undefined,
    "The Web Console does not have a Browser filter"
  );
  is(
    filterState.content,
    undefined,
    "The Web Console does not have a Content filter"
  );

  ok(
    !getOriginFilterButton(hud, "chrome"),
    "The Browser filter button is not in the Web Console DOM"
  );
  ok(
    !getOriginFilterButton(hud, "content"),
    "The Content filter button is not in the Web Console DOM"
  );

  await closeConsole();

  info("Open the Browser Console");
  hud = await BrowserConsoleManager.toggleBrowserConsole();
  ok(hud, "browser console opened");

  ok(
    getOriginFilterButton(hud, "chrome"),
    "The Browser filter button is in the Browser Console DOM"
  );
  ok(
    getOriginFilterButton(hud, "content"),
    "The Content filter button is in the Browser Console DOM"
  );

  await clearOutput(hud);

  info("Emit a message from privileged browser code and one from web content");
  hud.iframeWindow.console.log(CHROME_MESSAGE);
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [CONTENT_MESSAGE], msg =>
    content.wrappedJSObject.console.log(msg)
  );

  await waitFor(() => findMessageByType(hud, CHROME_MESSAGE, ".console-api"));
  await waitFor(() => findMessageByType(hud, CONTENT_MESSAGE, ".console-api"));

  info("Both origin filters are on by default");
  filterState = await getFilterState(hud);
  ok(filterState.chrome, "The Browser (chrome) filter is on by default");
  ok(filterState.content, "The Content filter is on by default");

  info("Hide content messages");
  await setFilterState(hud, { content: false });
  await waitFor(() => !findMessageByType(hud, CONTENT_MESSAGE, ".console-api"));
  ok(
    findMessageByType(hud, CHROME_MESSAGE, ".console-api"),
    "The browser message is still visible when content messages are hidden"
  );

  info("Show content messages again and hide browser messages");
  await setFilterState(hud, { content: true, chrome: false });
  await waitFor(() => !findMessageByType(hud, CHROME_MESSAGE, ".console-api"));
  ok(
    findMessageByType(hud, CONTENT_MESSAGE, ".console-api"),
    "The content message is still visible when browser messages are hidden"
  );

  info("Restore the browser filter and check the message comes back");
  await setFilterState(hud, { chrome: true });
  await waitFor(() => findMessageByType(hud, CHROME_MESSAGE, ".console-api"));

  await resetFilters(hud);
  await clearOutput(hud);
});

function getOriginFilterButton(hud, filterKey) {
  return hud.ui.outputNode.querySelector(
    `.devtools-togglebutton[data-category="${filterKey}"]`
  );
}
