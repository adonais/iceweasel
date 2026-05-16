/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const HOMEPAGE_PREF = "browser.startup.homepage";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.settings-redesign.enabled", true],
      ["identity.fxaccounts.account.device.name", ""],
    ],
  });
});

add_task(async function test_deleting_custom_url() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        HOMEPAGE_PREF,
        "https://example.com|https://test.org|https://mozilla.org",
      ],
    ],
  });

  let { doc, tab } = await openCustomHomepageSubpage();

  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("moz-box-item[data-url]").length === 3,
    "Wait for all URLs to render"
  );

  let boxItems = doc.querySelectorAll("moz-box-item[data-url]");
  let secondItem = Array.from(boxItems).find(
    item => item.getAttribute("data-url") === "https://test.org"
  );
  ok(secondItem, "Found the test.org item");

  let deleteButton = secondItem.querySelector(
    "moz-button[data-action='delete']"
  );
  ok(deleteButton, "Delete button exists on the item");

  deleteButton.click();

  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getStringPref(HOMEPAGE_PREF) ===
      "https://example.com|https://mozilla.org",
    "Pref updated after deletion"
  );

  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("moz-box-item[data-url]").length === 2,
    "Wait for list to update"
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_reordering_custom_urls() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        HOMEPAGE_PREF,
        "https://example.com|https://test.org|https://mozilla.org",
      ],
    ],
  });

  let { win, doc, tab } = await openCustomHomepageSubpage();

  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("moz-box-item[data-url]").length === 3,
    "Wait for all URLs to render"
  );

  let boxGroupControl = await settingControlRenders(
    "customHomepageBoxGroup",
    win
  );
  let boxGroup = boxGroupControl.controlEl;

  let reorderEvent = new CustomEvent("reorder", {
    bubbles: true,
    detail: {
      draggedIndex: 0,
      targetIndex: 2,
    },
  });

  boxGroup.dispatchEvent(reorderEvent);

  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getStringPref(HOMEPAGE_PREF) ===
      "https://test.org|https://mozilla.org|https://example.com",
    "Pref updated with new order"
  );

  await BrowserTestUtils.removeTab(tab);
});
