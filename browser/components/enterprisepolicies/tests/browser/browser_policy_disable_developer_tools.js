/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await setupPolicyEngineWithJson({
    policies: {
      DisableDeveloperTools: true,
    },
  });
});

add_task(async function test_developer_tools_disabled() {
  is(
    Services.policies.isAllowed("devtools"),
    false,
    "devtools should be disabled by policy."
  );

  is(
    Services.prefs.getBoolPref("devtools.policy.disabled"),
    true,
    "devtools dedicated disabled pref is set to true"
  );

  Services.prefs.setBoolPref("devtools.policy.disabled", false);

  is(
    Services.prefs.getBoolPref("devtools.policy.disabled"),
    true,
    "devtools dedicated disabled pref can not be updated"
  );
});

add_task(async function test_remote_automation_disabled() {
  is(
    Services.prefs.getBoolPref("remote.policy.disabled"),
    true,
    "remote automation is disabled alongside the chrome debugger"
  );
});

add_task(async function test_devtools_pages_blocked() {
  await testPageBlockedByPolicy("about:devtools-toolbox");
  await testPageBlockedByPolicy("about:debugging");
  await testPageBlockedByPolicy("about:profiling");
});

add_task(async function test_developer_tools_menu_trimmed() {
  let testURL = "data:text/html;charset=utf-8,test";
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    testURL,
    false
  );

  let menuButton = document.getElementById("PanelUI-menu-button");
  menuButton.click();
  await BrowserTestUtils.waitForEvent(window.PanelUI.mainView, "ViewShown");
  document.getElementById("appMenu-more-button2").click();
  await BrowserTestUtils.waitForEvent(
    document.getElementById("appmenu-moreTools"),
    "ViewShown"
  );
  is(
    document.getElementById("appmenu-developer-tools-view").children.length,
    2,
    "The developer tools are properly populated"
  );
  window.PanelUI.hide();

  BrowserTestUtils.removeTab(tab);
});
