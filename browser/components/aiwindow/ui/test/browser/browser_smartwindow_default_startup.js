/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const PREF_IS_DEFAULT_WINDOW = "browser.smartwindow.isDefaultWindow";

/* test that onFirstWindowReady promotes the window to Smart when the
default-window pref is on and the user is signed in */
add_task(async function test_onFirstWindowReady_promotes_when_default_active() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_IS_DEFAULT_WINDOW, true]],
  });

  const restoreSignIn = skipSignIn();
  const win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    await AIWindow.onFirstWindowReady(win);

    Assert.ok(
      win.document.documentElement.hasAttribute("ai-window"),
      "Window is promoted to Smart when default-window pref is on and user is signed in"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await SpecialPowers.popPrefEnv();
  }
});

/* test that onFirstWindowReady leaves the window classic when the
default-window pref is off */
add_task(
  async function test_onFirstWindowReady_does_not_promote_when_pref_off() {
    await SpecialPowers.pushPrefEnv({
      set: [[PREF_IS_DEFAULT_WINDOW, false]],
    });

    const win = await BrowserTestUtils.openNewBrowserWindow();

    try {
      await AIWindow.onFirstWindowReady(win);

      Assert.ok(
        !win.document.documentElement.hasAttribute("ai-window"),
        "Window stays classic when default-window pref is off"
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
      await SpecialPowers.popPrefEnv();
    }
  }
);

/* test that onFirstWindowReady leaves the window classic when the user
declines sign-in */
add_task(
  async function test_onFirstWindowReady_does_not_promote_when_auth_fails() {
    await SpecialPowers.pushPrefEnv({
      set: [[PREF_IS_DEFAULT_WINDOW, true]],
    });

    // Simulate a user who declines sign-in: ensureAIWindowAccess returns false.
    const authStub = sinon
      .stub(AIWindowAccountAuth, "ensureAIWindowAccess")
      .resolves(false);
    const win = await BrowserTestUtils.openNewBrowserWindow();

    try {
      await AIWindow.onFirstWindowReady(win);

      Assert.ok(
        !win.document.documentElement.hasAttribute("ai-window"),
        "Window stays classic when the user declines sign-in"
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
      authStub.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

/* test that onFirstWindowReady skips private browsing windows */
add_task(async function test_onFirstWindowReady_skips_private_windows() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_IS_DEFAULT_WINDOW, true]],
  });

  const restoreSignIn = skipSignIn();
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  try {
    await AIWindow.onFirstWindowReady(win);

    Assert.ok(
      !win.document.documentElement.hasAttribute("ai-window"),
      "Private windows are not promoted to Smart even when the default pref is on"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await SpecialPowers.popPrefEnv();
  }
});
