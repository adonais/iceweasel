/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.verticalTabs", true],
      ["sidebar.verticalTabs.dragToPinPromo.dismissed", false],
      ["sidebar.visibility", "always-show"],
      ["browser.nova.enabled", false],
    ],
  });
});

add_task(async function test_promo_card_only_shows_for_expanded_sidebar() {
  const promoCard = document.getElementById("drag-to-pin-promo-card");

  await SidebarController.updateUIState({ expanded: false });
  ok(
    BrowserTestUtils.isHidden(promoCard),
    "Drag-to-pin promo card is hidden when sidebar is collapsed."
  );

  await SidebarController.updateUIState({ expanded: true });
  ok(
    BrowserTestUtils.isVisible(promoCard),
    "Drag-to-pin promo card is shown when sidebar is expanded."
  );
});

/* Bug 2052309: tests that the promo is hidden when Nova is enabled */
add_task(async function test_promo_card_hidden_when_nova_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", false]] });
  const promoCard = document.getElementById("drag-to-pin-promo-card");

  await SidebarController.updateUIState({ expanded: true });
  ok(
    BrowserTestUtils.isVisible(promoCard),
    "Drag-to-pin promo card is shown when Nova is disabled."
  );

  await SpecialPowers.pushPrefEnv({ set: [["browser.nova.enabled", true]] });
  await BrowserTestUtils.waitForMutationCondition(
    promoCard,
    { attributeFilter: ["hidden"] },
    () => BrowserTestUtils.isHidden(promoCard)
  );
  ok(
    BrowserTestUtils.isHidden(promoCard),
    "Drag-to-pin promo card is hidden when Nova is enabled."
  );

  await SpecialPowers.popPrefEnv();
  await BrowserTestUtils.waitForMutationCondition(
    promoCard,
    { attributeFilter: ["hidden"] },
    () => BrowserTestUtils.isVisible(promoCard)
  );
  ok(
    BrowserTestUtils.isVisible(promoCard),
    "Drag-to-pin promo card is shown again when Nova is disabled."
  );
});

add_task(async function test_dismiss_promo_card() {
  const promoCard = document.getElementById("drag-to-pin-promo-card");

  info("Dismiss drag-to-pin promo card using close button.");
  EventUtils.synthesizeMouseAtCenter(promoCard.closeButton, {});
  await BrowserTestUtils.waitForMutationCondition(
    promoCard,
    { attributeFilter: ["hidden"] },
    () => BrowserTestUtils.isHidden(promoCard)
  );
});
