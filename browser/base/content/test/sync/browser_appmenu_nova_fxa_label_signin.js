/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  // gSync.init() is called in a requestIdleCallback. Force its initialization.
  gSync.init();
  await SpecialPowers.pushPrefEnv({
    set: [["identity.fxaccounts.toolbar.accessed", true]],
  });
  registerCleanupFunction(() => {
    document.documentElement.removeAttribute("fxastatus");
    PanelUI.hide();
  });
});

add_task(async function testFxaLabel2SignInCallsOpenFxAEmailFirstPage() {
  document.documentElement.setAttribute("fxastatus", "not_configured");

  let openFxAEmailFirstPageCalled = false;
  let originalFn = gSync.openFxAEmailFirstPageFromFxaMenu.bind(gSync);
  gSync.openFxAEmailFirstPageFromFxaMenu = () => {
    openFxAEmailFirstPageCalled = true;
  };

  let promiseViewShown = BrowserTestUtils.waitForEvent(
    PanelUI.panel,
    "ViewShown"
  );
  PanelUI.show();
  await promiseViewShown;

  let signInButton = PanelMultiView.getViewNode(
    document,
    "appMenu-nova-fxa-label"
  );
  ok(signInButton, "appMenu-nova-fxa-label button should exist");

  let panelHidden = BrowserTestUtils.waitForEvent(PanelUI.panel, "popuphidden");
  signInButton.click();
  await panelHidden;

  ok(
    openFxAEmailFirstPageCalled,
    "openFxAEmailFirstPageFromFxaMenu should be called when appMenu-fxa-label2 is clicked"
  );

  gSync.openFxAEmailFirstPageFromFxaMenu = originalFn;
});
