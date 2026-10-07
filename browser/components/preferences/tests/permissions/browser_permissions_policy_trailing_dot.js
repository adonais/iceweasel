/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PERMISSIONS_URL =
  "chrome://browser/content/preferences/dialogs/sitePermissions.xhtml";

// A policy site list sets the permission for a host and its trailing dot
// form, which are distinct permission origins.
add_task(async function test_policy_trailing_dot_host_listed_once() {
  let prefsTab;
  registerCleanupFunction(async () => {
    // The dialog has to go first: its permission observer doesn't handle the
    // "cleared" notification removeAll sends.
    if (prefsTab) {
      BrowserTestUtils.removeTab(prefsTab);
    }
    await EnterprisePolicyTesting.setupPolicyEngineWithJson("");
    // EXPIRE_POLICY permissions can't be removed individually, so clear the
    // whole permissions table.
    Services.perms.removeAll();
  });

  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: {
      Permissions: {
        Notifications: {
          Allow: ["https://dot-allow.example.com."],
          Block: ["https://dot-block.example.com"],
        },
      },
    },
  });

  // A trailing dot host that isn't a duplicate of a bare host permission
  // stays listed.
  PermissionTestUtils.add(
    "https://dot-only.example.com.",
    "desktop-notification",
    Ci.nsIPermissionManager.DENY_ACTION,
    Ci.nsIPermissionManager.EXPIRE_POLICY
  );

  await openPermissionsPane({ leaveOpen: true });
  prefsTab = gBrowser.selectedTab;

  let dialogWin = await openAndLoadSubDialog(PERMISSIONS_URL, null, {
    permissionType: "desktop-notification",
  });
  await dialogWin.document.mozSubdialogReady;

  let origins = Array.from(
    dialogWin.document.querySelectorAll("#permissionsBox richlistitem"),
    item => item.getAttribute("origin")
  ).sort();

  Assert.deepEqual(
    origins,
    [
      "https://dot-allow.example.com",
      "https://dot-block.example.com",
      "https://dot-only.example.com.",
    ],
    "Each policy site is listed once, under its bare host"
  );
});
