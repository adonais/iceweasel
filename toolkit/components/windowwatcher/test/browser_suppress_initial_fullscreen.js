/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Firefox remembers the last window sizemode in the XUL store. If that value
// is "fullscreen", the next window opened comes up fullscreen too, which on
// macOS puts it on a Space of its own where the user never sees it.
// nsAppShellService skips the restore when the caller passes
// CHROME_SUPPRESS_INITIAL_FULLSCREEN, or when the parent window is fullscreen.

const STORE = "chrome://browser/content/browser.xhtml";
const BASE_FEATURES = "chrome,dialog=no,all";

function storedSizemode() {
  return Services.xulStore.getValue(STORE, "main-window", "sizemode");
}

// A closing window writes its own sizemode back to the store, so each case has
// to set the stored value again rather than relying on the one before it.
async function openWindow(features, parent = null) {
  Services.xulStore.setValue(STORE, "main-window", "sizemode", "fullscreen");
  let opened = BrowserTestUtils.domWindowOpened();
  Services.ww.openWindow(
    parent,
    AppConstants.BROWSER_CHROME_URL,
    "_blank",
    features,
    null
  );
  let win = await opened;
  await BrowserTestUtils.waitForEvent(win, "load");
  return win;
}

add_setup(async function () {
  let previous = storedSizemode() || "normal";
  registerCleanupFunction(() => {
    Services.xulStore.setValue(STORE, "main-window", "sizemode", previous);
  });
});

add_task(async function withoutTheFlag_restoresFullscreen() {
  // This is the control: with no flag the window is expected to go fullscreen.
  // On macOS, use emulated fullscreen instead of the native one, because the
  // native transition often never finishes in automation and the test would
  // hang waiting for it. Either kind of fullscreen sets sizemode, which is all
  // this case checks.
  await SpecialPowers.pushPrefEnv({
    set: [["full-screen-api.macos-native-full-screen", false]],
  });
  let win = await openWindow(BASE_FEATURES);
  try {
    // Going fullscreen is a request to the window manager, which answers when
    // it likes. Firefox then rewrites sizemode from the window's real state, so
    // the attribute below reports what actually happened, not what was asked
    // for. Wait for the answer instead of reading it the instant the window
    // loads.
    await TestUtils.waitForCondition(
      () =>
        win.document.documentElement.getAttribute("sizemode") == "fullscreen",
      "waiting for the window to be put into fullscreen"
    );
    is(
      win.document.documentElement.getAttribute("sizemode"),
      "fullscreen",
      "without the flag the stored sizemode is restored"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function withTheFlag_doesNotRestoreFullscreen() {
  let win = await openWindow(`${BASE_FEATURES},suppressinitialfullscreen`);
  let { chromeFlags } = win.docShell.treeOwner
    .QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsIAppWindow);
  ok(
    chromeFlags & Ci.nsIWebBrowserChrome.CHROME_SUPPRESS_INITIAL_FULLSCREEN,
    "the feature reaches the chrome flags"
  );
  isnot(
    win.document.documentElement.getAttribute("sizemode"),
    "fullscreen",
    "the flag suppresses the restored sizemode"
  );
  ok(!win.fullScreen, "the window is not fullscreen");
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function chromelessShape_withASize_doesNotRestoreFullscreen() {
  // The shape an onboarding flow opens: chromeless, with an explicit size.
  let win = await openWindow(
    "chrome,dialog=no,resizable,minimizable,titlebar,close," +
      "suppressinitialfullscreen,width=960,height=720"
  );
  isnot(
    win.document.documentElement.getAttribute("sizemode"),
    "fullscreen",
    "a sized chromeless window does not come up fullscreen either"
  );
  await BrowserTestUtils.closeWindow(win);
});
