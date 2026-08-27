async function maximizeWindow(win) {
  if (win.windowState != win.STATE_MAXIMIZED) {
    let sizeModeChanged = BrowserTestUtils.waitForEvent(win, "sizemodechange");
    win.maximize();
    await sizeModeChanged;
  }
  // Let the maximize settle and force a layout flush before measuring.
  await win.promiseDocumentFlushed(() => {});
  return win.windowState == win.STATE_MAXIMIZED;
}

async function withMaximizedWindow(
  { prefs = [], privateWindow = false, density = gUIDensity.MODE_NORMAL },
  taskFn
) {
  // Pin the density rather than relying on the default.
  await SpecialPowers.pushPrefEnv({
    set: [...prefs, ["browser.uidensity", density]],
  });
  let win = await BrowserTestUtils.openNewBrowserWindow({
    private: privateWindow,
  });
  try {
    win.gUIDensity?.update?.();
    let maximized = await maximizeWindow(win);
    if (!maximized) {
      info(
        `Window did not reach STATE_MAXIMIZED on this platform ` +
          `(state=${win.windowState}); skipping assertions.`
      );
      ok(true, "maximize unsupported on this platform - skipped");
      return;
    }
    await taskFn(win);
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
}
