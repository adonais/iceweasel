/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const exampleUrl = "https://example.com/1";

/**
 * Testing for bug 1953361: if the user starts typing in the interval between
 * the mousedown that focuses the Urlbar and the click that would otherwise
 * select all of its previous content, the typed characters must not be
 * clobbered by that select-all.
 */
add_task(async function typingBetweenMousedownAndClickIsNotClobbered() {
  gURLBar.value = exampleUrl;
  gURLBar.blur();

  let target = gURLBar.inputField;
  EventUtils.synthesizeMouseAtCenter(
    target,
    { type: "mousedown" },
    target.documentGlobal
  );
  Assert.ok(gURLBar.focused, "Urlbar should be focused after mousedown.");

  EventUtils.synthesizeKey("1", {}, window);
  await UrlbarTestUtils.promiseSearchComplete(window);

  // mouseup on the same target as mousedown auto-generates a click.
  let clickPromise = BrowserTestUtils.waitForEvent(target, "click");
  EventUtils.synthesizeMouseAtCenter(
    target,
    { type: "mouseup" },
    target.documentGlobal
  );
  await clickPromise;

  EventUtils.synthesizeKey("2", {}, window);
  await UrlbarTestUtils.promiseSearchComplete(window);

  let trimmed = UrlbarTestUtils.trimURL(exampleUrl);
  Assert.equal(
    gURLBar.value.replace("12", ""),
    trimmed,
    "Both keystrokes should arrive in order without clobbering the value: " +
      gURLBar.value
  );

  gURLBar.blur();
  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});
