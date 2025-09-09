/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtection } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtection.sys.mjs"
);

/**
 * Tests that we can set a state and pass it to a fake element.
 */
add_task(function test_update_icon_status() {
  const browser = Services.appShell.createWindowlessBrowser(true);
  const principal = Services.scriptSecurityManager.getSystemPrincipal();
  browser.docShell.createAboutBlankDocumentViewer(principal, principal);
  const document = browser.docShell.docViewer.DOMDocument;
  let fakeToolbarItem = document.createXULElement("toolbaritem");

  Assert.equal(
    fakeToolbarItem.classList.length,
    0,
    "Toolbaritem class list should be empty"
  );

  let ipProtectionOn = {
    isActive: true,
    isError: false,
  };
  IPProtection.updateIconStatus(fakeToolbarItem, ipProtectionOn);

  Assert.ok(
    fakeToolbarItem.classList.contains("ipprotection-on"),
    "Toolbaritem classlist should include ipprotection-on"
  );

  // isError should override the active status even if isActive is set to true
  let ipProtectionError = {
    isActive: true,
    isError: true,
  };
  IPProtection.updateIconStatus(fakeToolbarItem, ipProtectionError);

  Assert.ok(
    fakeToolbarItem.classList.contains("ipprotection-error"),
    "Toolbaritem classlist should include ipprotection-error"
  );
  Assert.ok(
    !fakeToolbarItem.classList.contains("ipprotection-on"),
    "Toolbaritem classlist should not include ipprotection-on"
  );

  let ipProtectionOff = {
    isActive: false,
    isError: false,
  };
  IPProtection.updateIconStatus(fakeToolbarItem, ipProtectionOff);

  Assert.ok(
    !fakeToolbarItem.classList.contains("ipprotection-error"),
    "Toolbaritem classlist should not include ipprotection-error"
  );
  Assert.ok(
    !fakeToolbarItem.classList.contains("ipprotection-on"),
    "Toolbaritem classlist should not include ipprotection-on"
  );
});
