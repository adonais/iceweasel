/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function openPrefsWithSettings({ allEnabled, zoomEnabled }) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.settings-redesign.enabled", allEnabled],
      ["browser.settings-redesign.zoom.enabled", zoomEnabled],
    ],
  });
  await openPreferencesViaOpenPreferencesAPI("general", { leaveOpen: true });
  return gBrowser.selectedBrowser.contentDocument;
}

add_task(async function test_section_disabled() {
  let doc = await openPrefsWithSettings({
    allEnabled: false,
    zoomEnabled: false,
  });
  let legacyGroup = doc.getElementById("zoomGroup");
  let redesignGroup = doc.querySelector('setting-group[groupid="zoom"]');
  ok(legacyGroup.checkVisibility(), "The legacy group is visible");
  is(
    legacyGroup.dataset.category,
    "paneGeneral",
    "The legacy group has a category"
  );
  ok(
    !legacyGroup.hasAttribute("data-hidden-from-search"),
    "The legacy group is visible to search"
  );
  ok(!redesignGroup, "The redesign group was removed");
  gBrowser.removeCurrentTab();
});

add_task(async function test_section_enabled() {
  let doc = await openPrefsWithSettings({
    allEnabled: false,
    zoomEnabled: true,
  });
  let legacyGroup = doc.getElementById("zoomGroup");
  let redesignGroup = doc.querySelector('setting-group[groupid="zoom"]');
  ok(!legacyGroup.checkVisibility(), "The legacy group is hidden");
  ok(!legacyGroup.dataset.category, "The legacy group category is removed");
  is(
    legacyGroup.getAttribute("data-hidden-from-search"),
    "true",
    "The legacy group is hidden from search"
  );
  ok(redesignGroup.checkVisibility(), "The redesign group is visible");
  is(
    redesignGroup.dataset.category,
    "paneGeneral",
    "The redesign group has a category"
  );
  gBrowser.removeCurrentTab();
});

add_task(async function test_all_enabled() {
  let doc = await openPrefsWithSettings({
    allEnabled: true,
    zoomEnabled: false,
  });
  let legacyGroup = doc.getElementById("zoomGroup");
  let redesignGroup = doc.querySelector('setting-group[groupid="zoom"]');
  ok(!legacyGroup.checkVisibility(), "The legacy group is hidden");
  ok(!legacyGroup.dataset.category, "The legacy group category is removed");
  is(
    legacyGroup.getAttribute("data-hidden-from-search"),
    "true",
    "The legacy group is hidden from search"
  );
  ok(redesignGroup.checkVisibility(), "The redesign group is visible");
  is(
    redesignGroup.dataset.category,
    "paneGeneral",
    "The redesign group has a category"
  );
  gBrowser.removeCurrentTab();
});
