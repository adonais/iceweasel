/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Check that smart assist sidebar renders
 */
add_task(async function test_sidebar_render() {
  await SidebarController.show("viewGenaiSmartAssistSidebar");

  const { document } = SidebarController.browser.contentWindow;

  let smartAssistWrapper = document.getElementById("smart-assist-wrapper");

  Assert.ok(smartAssistWrapper, "Smart Assist sidebar has rendered");

  SidebarController.hide();
});
