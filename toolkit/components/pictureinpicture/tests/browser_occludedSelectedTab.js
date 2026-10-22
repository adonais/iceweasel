/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const ENABLE_WHEN_OCCLUDED_PREF =
  "media.videocontrols.picture-in-picture.enable-when-occluded.enabled";

// Minimizing only hides a visible page, and the page turns visible a little
// after its window does.
async function waitForPageVisible(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.visibilityState == "visible",
      "The page is visible"
    );
  });
}

// Opens a window with an unmuted video playing in its selected tab. It's a
// separate window so minimizing it leaves the harness window alone.
async function openWindowWithPlayingVideo() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    win.gBrowser,
    TEST_PAGE
  );
  let browser = tab.linkedBrowser;
  await ensureVideosReady(browser);
  await SpecialPowers.spawn(browser, ["with-controls"], async id => {
    let video = content.document.getElementById(id);
    video.muted = false;
    await video.play();
  });
  await waitForPageVisible(browser);
  return { win, browser };
}

async function minimize(win) {
  let sizeModeChanged = BrowserTestUtils.waitForEvent(win, "sizemodechange");
  win.minimize();
  await sizeModeChanged;
}

async function closeWindowAndPlayers(win) {
  for (let pip of Services.wm.getEnumerator(WINDOW_TYPE)) {
    await BrowserTestUtils.closeWindow(pip);
  }
  await BrowserTestUtils.closeWindow(win);
}

// With enable-when-occluded on, minimizing the window opens the player though
// the tab is still selected, and restoring the window closes it.
add_task(async function autopip_when_minimized_and_selected() {
  await SpecialPowers.pushPrefEnv({
    set: [[ENABLE_WHEN_OCCLUDED_PREF, true]],
  });
  let { win, browser } = await openWindowWithPlayingVideo();
  try {
    let pipOpened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
    await minimize(win);
    let pipWin = await pipOpened;
    ok(pipWin, "The player opened when the window was minimized");
    is(
      win.gBrowser.selectedBrowser,
      browser,
      "The video tab is still the selected tab"
    );

    let pipClosed = BrowserTestUtils.domWindowClosed(pipWin);
    win.restore();
    await pipClosed;
    ok(true, "The player closed when the window was shown again");
  } finally {
    await closeWindowAndPlayers(win);
    await SpecialPowers.popPrefEnv();
  }
});

// With enable-when-occluded off (the default), minimizing opens nothing.
add_task(async function no_autopip_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [[ENABLE_WHEN_OCCLUDED_PREF, false]],
  });
  let { win } = await openWindowWithPlayingVideo();
  try {
    let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null).then(
      () => true
    );
    await minimize(win);
    ok(win.document.hidden, "The minimized window is hidden");
    let didOpen = await Promise.race([
      opened,
      // Leave time for a wrong auto-open.
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      new Promise(resolve => setTimeout(() => resolve(false), 1000)),
    ]);
    ok(!didOpen, "No player opened when enable-when-occluded is off");
  } finally {
    await closeWindowAndPlayers(win);
    await SpecialPowers.popPrefEnv();
  }
});

// Shift-closing the player while its window is minimized must not reopen it,
// the loop bug 2057730 fixed for background tabs. Shift keeps the video
// playing, so the page reports hidden again after the close.
add_task(async function no_reopen_after_deliberate_close_while_minimized() {
  await SpecialPowers.pushPrefEnv({
    set: [[ENABLE_WHEN_OCCLUDED_PREF, true]],
  });
  let { win, browser } = await openWindowWithPlayingVideo();
  try {
    let pipOpened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
    await minimize(win);
    let pipWin = await pipOpened;
    ok(win.document.hidden, "The minimized window is hidden");

    let reopened = BrowserTestUtils.domWindowOpenedAndLoaded(null).then(
      () => true
    );
    let pipClosed = BrowserTestUtils.domWindowClosed(pipWin);
    EventUtils.synthesizeMouseAtCenter(
      pipWin.document.getElementById("close"),
      { shiftKey: true },
      pipWin
    );
    await pipClosed;
    let didReopen = await Promise.race([
      reopened,
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      new Promise(resolve => setTimeout(() => resolve(false), 2000)),
    ]);
    ok(!didReopen, "Closing the player on purpose does not reopen it");

    // The suppression ends once the window is shown, so minimizing again
    // reopens the player.
    win.restore();
    await waitForPageVisible(browser);
    pipOpened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
    await minimize(win);
    ok(
      await pipOpened,
      "Minimizing again after the window was shown reopens it"
    );
  } finally {
    await closeWindowAndPlayers(win);
    await SpecialPowers.popPrefEnv();
  }
});
