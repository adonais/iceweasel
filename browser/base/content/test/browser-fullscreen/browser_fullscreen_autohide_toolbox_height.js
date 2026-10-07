/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The nav toolbox is autohidden in fullscreen by pulling it up with a negative
// margin equal to its own height. Anything that changes that height afterwards
// must not leave part of the toolbars on screen. On Windows the "fullscreen"
// event that collapses the toolbox runs before the resize event that makes
// automatic density re-evaluate, so entering fullscreen from compact mode grows
// the toolbox right after it was measured (bug 2058900).

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.fullscreen.autohide", true]],
  });
});

registerCleanupFunction(async () => {
  await exitFullscreen();
});

// Where the bottom edge of the collapsed toolbox sits relative to the top of the
// window. Positive means toolbars are left on screen; negative means the toolbox
// was pulled up further than its own height, which drags the content area up and
// clips its top. Deriving this from the applied margin and the toolbox height
// rather than reading the toolbox position keeps it independent of the collapse
// animation, which doesn't change the height.
function collapsedToolboxOffset() {
  return (
    parseFloat(gNavToolbox.style.marginTop) +
    gNavToolbox.getBoundingClientRect().height
  );
}

// The margin is updated from a ResizeObserver via promiseDocumentFlushed, so it
// lands a tick or two after the height changed.
async function assertToolboxFlushWithWindowTop(msg) {
  try {
    await TestUtils.waitForCondition(
      () => Math.abs(collapsedToolboxOffset()) <= 1,
      msg
    );
  } catch (e) {
    // Fall through to the assertion below, which reports the actual numbers.
  }
  Assert.lessOrEqual(
    Math.abs(collapsedToolboxOffset()),
    1,
    `${msg} (marginTop ${gNavToolbox.style.marginTop}, height ${
      gNavToolbox.getBoundingClientRect().height
    }px)`
  );
}

async function enterFullscreenWithCollapsedToolbox() {
  // Collapsing bails out while a chrome input has focus, which the urlbar may
  // still have from earlier in the test run.
  gBrowser.selectedBrowser.focus();

  // Start observing before triggering so we can't miss the notification whether
  // it fires synchronously during fullscreen entry or later.
  let onToolboxHidden = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "hidden"
  );
  let onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onFullscreen;
  await SimpleTest.promiseFocus(window);
  await onToolboxHidden;
  ok(FullScreen.navToolboxHidden, "Nav toolbox is collapsed in fullscreen");
}

async function exitFullscreen() {
  if (!window.fullScreen) {
    return;
  }
  let onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onFullscreen;
}

// A notification bar is the most direct way to grow the collapsed toolbox:
// #notifications-toolbar is the last child of #navigator-toolbox and carries
// fullscreentoolbar="true", so unlike the menubar or bookmarks toolbar it isn't
// collapsed away in fullscreen.
add_task(async function test_notification_shown_while_collapsed() {
  await enterFullscreenWithCollapsedToolbox();
  await assertToolboxFlushWithWindowTop(
    "Toolbox is fully hidden once collapsed"
  );

  let heightBefore = gNavToolbox.getBoundingClientRect().height;

  info("Showing a notification while the toolbox is collapsed");
  let notification = await gNotificationBox.appendNotification(
    "test-fullscreen-toolbox-height",
    {
      label: "Test notification",
      priority: gNotificationBox.PRIORITY_INFO_HIGH,
    }
  );

  await TestUtils.waitForCondition(
    () => gNavToolbox.getBoundingClientRect().height > heightBefore,
    "Notification makes the toolbox taller"
  );

  await assertToolboxFlushWithWindowTop(
    "Toolbox is still fully hidden after a notification grew it"
  );

  gNotificationBox.removeNotification(notification);
  await exitFullscreen();
});

// In the wild it is automatic density that grows the toolbox here: fullscreen
// takes the window past the auto-compact thresholds, and gUIDensity re-evaluates
// them from its resize listener, which runs after the toolbox was collapsed.
// Drive the density from the pref instead of relying on that ordering - an
// explicit browser.uidensity value is also what stops the resize listener from
// re-evaluating auto-compact and changing the density out from under the test.
add_task(async function test_density_change_while_collapsed() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.uidensity", gUIDensity.MODE_COMPACT]],
  });

  await enterFullscreenWithCollapsedToolbox();
  await assertToolboxFlushWithWindowTop(
    "Toolbox is fully hidden once collapsed in compact mode"
  );

  let compactHeight = gNavToolbox.getBoundingClientRect().height;

  info("Leaving compact mode while the toolbox is collapsed");
  await SpecialPowers.pushPrefEnv({
    set: [["browser.uidensity", gUIDensity.MODE_NORMAL]],
  });
  Assert.greater(
    gNavToolbox.getBoundingClientRect().height,
    compactHeight,
    "Leaving compact mode makes the toolbox taller"
  );

  await assertToolboxFlushWithWindowTop(
    "Toolbox is still fully hidden after leaving compact mode"
  );

  await exitFullscreen();
});
