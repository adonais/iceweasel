/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Check that when enabling the revamped sidebar while a sidebar is already open, the
 * current sidebar panel opens
 */
add_task(async function test_enable_revamp_with_open_sidebar() {
  await SpecialPowers.pushPrefEnv({ set: [["sidebar.revamp", false]] });

  // lets keep sidebar state changes in a temp. new window
  // so we don't potentially pollute any results in subsequent tests
  const newWin = await BrowserTestUtils.openNewBrowserWindow();
  const { document, SidebarController } = newWin;
  const sidebarContainer = document.getElementById("sidebar-container");
  const sidebarHeader = document.getElementById("sidebar-header");

  if (SidebarController.currentID !== "viewHistorySidebar") {
    await SidebarController.show("viewHistorySidebar");
  }
  Assert.ok(SidebarController.isOpen, "isOpen is true");
  Assert.ok(sidebarContainer.hidden, "The sidebar launcher is hidden");
  Assert.ok(!sidebarHeader.hidden, "The sidebar header is visible");

  // the switcher from the old sidebar should be hidden now
  info("Waiting for the legacy sidebar header to be hidden");
  let headerHidden = BrowserTestUtils.waitForMutationCondition(
    sidebarHeader,
    { attributes: true, attributeFilter: ["hidden"] },
    () => sidebarHeader.hidden
  );

  // restore the revamp pref to true
  await SpecialPowers.popPrefEnv();
  await headerHidden;
  await SidebarController.waitUntilStable();

  Assert.ok(SidebarController.isOpen, "The panel is still open");
  Assert.equal(
    SidebarController.currentID,
    "viewHistorySidebar",
    "The open panel carried over to the revamped sidebar"
  );
  Assert.ok(sidebarHeader.hidden, "The sidebar header is hidden");
  // The launcher is the user's to reveal in this visibility mode, and the
  // panel opening doesn't do it for them.
  Assert.ok(sidebarContainer.hidden, "The sidebar launcher stays hidden");
  await SidebarTestUtils.ensureLauncherVisible(
    newWin,
    "The launcher can still be revealed with the toolbar button"
  );

  await BrowserTestUtils.closeWindow(newWin);
});
