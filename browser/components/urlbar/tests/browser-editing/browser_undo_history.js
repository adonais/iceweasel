/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Gecko drops an editor's undo history when its frame is reconstructed
// (bug 2017065), so opening and closing the view must not reconstruct the
// input's frame (bug 2061633).
add_task(async function undoAfterViewClose() {
  await UrlbarTestUtils.promisePopupOpen(window, () => {
    gURLBar.focus();
    EventUtils.sendString("example");
  });
  await UrlbarTestUtils.promiseSearchComplete(window);
  Assert.equal(gURLBar.value, "example", "The string was typed.");

  await UrlbarTestUtils.promisePopupClose(window);

  let controller =
    document.commandDispatcher.getControllerForCommand("cmd_undo");
  Assert.ok(
    controller.isCommandEnabled("cmd_undo"),
    "Undo is available after the view closed."
  );

  goDoCommand("cmd_undo");
  Assert.equal(gURLBar.value, "", "Undo removed the typed string.");

  gURLBar.blur();
});

// Setting an input's value drops its undo history unless the input carries
// preserveundohistory, and a load sets the address bar's value
// (bug 2069367).
add_task(async function undoAfterNavigation() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.autoFill", false]],
  });

  const TYPED = "https://example.com/234";

  await BrowserTestUtils.withNewTab(
    "https://example.com/123",
    async browser => {
      gURLBar.focus();
      gURLBar.select();
      let loadedValue = gURLBar.value;

      await UrlbarTestUtils.promisePopupOpen(window, () =>
        EventUtils.sendString(TYPED)
      );
      await UrlbarTestUtils.promiseSearchComplete(window);
      Assert.equal(gURLBar.value, TYPED, "The string replaced the loaded URL.");

      let loaded = BrowserTestUtils.browserLoaded(browser, false, url =>
        url.endsWith("/234")
      );
      EventUtils.synthesizeKey("KEY_Enter");
      await loaded;
      Assert.notEqual(gURLBar.value, TYPED, "The load set the value.");

      gURLBar.focus();
      goDoCommand("cmd_undo");
      Assert.equal(gURLBar.value, TYPED, "Undo restored the typed string.");

      goDoCommand("cmd_undo");
      Assert.equal(
        gURLBar.value,
        loadedValue,
        "Undo restored the URL the typing replaced."
      );

      gURLBar.blur();
    }
  );

  await SpecialPowers.popPrefEnv();
});
