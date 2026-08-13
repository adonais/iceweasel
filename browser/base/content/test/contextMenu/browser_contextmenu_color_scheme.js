/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_submenu_matches_context_menu() {
  let contextMenu = document.getElementById("contentAreaContextMenu");
  let submenu = document.getElementById("context-media-playbackrate").menupopup;

  // 0 and 1 are the dark and light values of the pref.
  for (let [override, scheme] of [
    [1, "light"],
    [0, "dark"],
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [["layout.css.prefers-color-scheme.content-override", override]],
    });

    await BrowserTestUtils.withNewTab("about:blank", async browser => {
      let popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
      await BrowserTestUtils.synthesizeMouse(
        "body",
        2,
        2,
        { type: "contextmenu", button: 2 },
        browser
      );
      await popupShown;

      is(
        getComputedStyle(contextMenu).colorScheme,
        scheme,
        "The content context menu uses content's preferred color scheme."
      );
      is(
        getComputedStyle(submenu).colorScheme,
        scheme,
        "The submenu matches the color scheme of the context menu."
      );

      let popupHidden = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popuphidden"
      );
      contextMenu.hidePopup();
      await popupHidden;
    });

    await SpecialPowers.popPrefEnv();
  }
});
