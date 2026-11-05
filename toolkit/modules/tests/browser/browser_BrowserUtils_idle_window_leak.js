/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// A browser window's per-window idle tasks must not keep it alive after it
// closes when the idle queue is starved (bug 2082943).
add_task(async function test_closed_window_freed_with_pending_idle_tasks() {
  // Keep a normal priority task pending at all times so idle tasks can't run.
  let starve = true;
  let spin = () => {
    if (starve) {
      Services.tm.dispatchToMainThread(spin);
    }
  };
  registerCleanupFunction(() => (starve = false));
  let idleRan = false;
  ChromeUtils.idleDispatch(() => (idleRan = true));
  spin();

  let win = await BrowserTestUtils.openNewBrowserWindow();
  // The per-window idle tasks are queued once session restore is done.
  await BrowserTestUtils.waitForMutationCondition(
    win.document.documentElement,
    { attributeFilter: ["sessionrestored"] },
    () => win.document.documentElement.hasAttribute("sessionrestored")
  );
  let weakWin = Cu.getWeakReference(win);
  await BrowserTestUtils.closeWindow(win);
  win = null;

  let freed = await TestUtils.waitForCondition(
    () => {
      // Shrinking, to also discard JIT code that can keep the closed window's
      // realm alive (bug 2041420).
      Cu.forceShrinkingGC();
      Cu.forceCC();
      return !weakWin.get();
    },
    "Waiting for the closed window to be freed",
    100,
    10
  ).then(
    () => true,
    () => false
  );
  starve = false;

  Assert.ok(!idleRan, "Idle tasks were starved while the window was closed");
  Assert.ok(freed, "The closed window was freed despite pending idle tasks");
});
