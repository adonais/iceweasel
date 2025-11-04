/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/**
 * Tests telemetry for pref_switch_tabs_search_all_containers Glean metric
 */

"use strict";

const PREF = "browser.urlbar.switchTabs.searchAllContainers";

add_setup(async function () {
  Services.fog.initializeFOG();
});

add_task(async function test_switchTabs_searchAllContainers_pref() {
  for (let value of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [[PREF, value]],
    });

    let newWin = await BrowserTestUtils.openNewBrowserWindow();

    let result = Glean.urlbar.prefSwitchTabsSearchAllContainers.testGetValue();
    Assert.equal(
      result,
      value,
      `Setting pref to ${value} should make the metric ${value}`
    );

    newWin.close();
  }
});
