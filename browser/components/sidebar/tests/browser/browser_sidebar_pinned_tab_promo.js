/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.verticalTabs", true],
      ["sidebar.verticalTabs.dragToPinPromo.dismissed", false],
      ["sidebar.visibility", "always-show"],
    ],
  });
});

/* Bug 2052309: tests that the promo is hidden when Nova is enabled */
add_task(async function test_promo_card_hidden_when_nova_enabled() {
  const promoCard = document.getElementById("drag-to-pin-promo-card");

  await SidebarController.updateUIState({ expanded: true });
  ok(
    BrowserTestUtils.isHidden(promoCard),
    "Drag-to-pin promo card is hidden when Nova is enabled."
  );
});
