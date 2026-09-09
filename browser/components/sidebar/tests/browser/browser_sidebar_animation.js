/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Animations never play to completion -they are paused as soon as they exist.
const ANIMATION_DURATION_MS = 300000;

// Opening four extra windows can be slow
requestLongerTimeout(2);

const ANIMATION_ENABLED_PREF = "sidebar.animation.enabled";
const ANIMATION_DURATION_PREF = "sidebar.animation.duration-ms";

// The launcher contents counter-animate to keep the buttons in place, which
// depends on which side the launcher is docked to but *not* on the UI
// direction.
const POSITION_CASES = [
  { rtl: false, positionStart: true },
  { rtl: false, positionStart: false },
  { rtl: true, positionStart: true },
  { rtl: true, positionStart: false },
];

/**
 * The elements `_animateSidebarContainer` animates, plus the subset which also
 * carries the `sidebar-ongoing-animations` attribute that CSS keys off.
 *
 * @returns {{animated: Element[], flagged: Element[]}}
 */
function getAnimatedElements() {
  const tabbox = document.getElementById("tabbrowser-tabbox");
  const { sidebarContainer, sidebarMain, _box, _splitter } = SidebarController;
  return {
    animated: [sidebarContainer, _box, _splitter, tabbox],
    flagged: [sidebarContainer, sidebarMain, _box, tabbox],
  };
}

function toggleWithToolbarButton(win = window) {
  // Equivalent to clicking the sidebar button, which isn't guaranteed to be
  // present in the toolbar.
  win.SidebarController.handleToolbarButtonClick();
}

/**
 * Wait for the controller's batch of in-flight animations to reach some state.
 *
 * A toggle awaits a Lit update before creating the animations.
 *
 * @param {ChromeWindow} win
 * @param {(animations: Animation[]) => boolean} predicate
 *   Called with `_ongoingAnimations` until it returns true.
 * @param {string} description
 *   What is being waited for, phrased to follow "Waiting for".
 * @returns {Promise<Animation[]>} The batch as of when the predicate held.
 */
async function waitForAnimationBatch(win, predicate, description) {
  const { SidebarController: controller } = win;

  await TestUtils.waitForCondition(
    () => predicate(controller._ongoingAnimations),
    `Waiting for ${description}`
  );
  return controller._ongoingAnimations;
}

/**
 * Wait for a toggle to create its animations, then pause them at their first
 * frame. We can then assert on which elements animate, the timing and the
 * keyframes without a timing dependency.
 *
 * @param {object} [options]
 * @param {ChromeWindow} [options.win]
 * @param {Animation[]} [options.replacing]
 *   A batch that must have been superseded, for when a second toggle interrupts
 *   the first. Without it, the batch already in flight would satisfy the wait.
 * @param {string} [options.description]
 * @returns {Promise<Animation[]>}
 */
async function waitForPausedAnimations({
  win = window,
  replacing = null,
  description = "the launcher to start animating",
} = {}) {
  const animations = await waitForAnimationBatch(
    win,
    batch => batch.length && batch !== replacing,
    description
  );
  animations.forEach(animation => animation.pause());
  return animations;
}

/**
 * Finish any in-flight animations and wait for the controller to tidy up after
 * itself. `finish()` resolves a paused animation too, so this releases the
 * animations frozen by `waitForPausedAnimations`.
 *
 * @param {ChromeWindow} [win]
 */
async function finishOngoingAnimations(win = window) {
  const { SidebarController: controller } = win;
  controller._ongoingAnimations.forEach(animation => animation.finish());
  await waitForAnimationBatch(
    win,
    batch => !batch.length,
    "the ongoing animations to be cleared"
  );
  await controller.waitUntilStable();
}

/**
 * The horizontal component of a computed keyframe's `translate`.
 *
 * @param {object} keyframe
 * @returns {number}
 */
function keyframeTranslateX(keyframe) {
  return parseFloat(keyframe.translate) || 0;
}

/**
 * Put the launcher back in its default visible state without animating, so that
 * each task starts from the same place and toggling is reliably a hide.
 *
 * @param {ChromeWindow} [win]
 * @param {string} [message]
 */
async function ensureLauncherVisibleWithoutAnimating(win = window, message) {
  await SpecialPowers.pushPrefEnv({
    set: [[ANIMATION_ENABLED_PREF, false]],
  });
  await SidebarTestUtils.ensureLauncherVisible(win, message);
  await SpecialPowers.popPrefEnv();
}

add_setup(async () => {
  await SidebarTestUtils.waitForInitialized(window);
  // Windows CI machines have prefers-reduced-motion set, which suppresses the
  // animations under test. Opt back in rather than depend on the host setting.
  gReduceMotionOverride = false;
  await SpecialPowers.pushPrefEnv({
    set: [[ANIMATION_DURATION_PREF, ANIMATION_DURATION_MS]],
  });
});

registerCleanupFunction(() => {
  gReduceMotionOverride = undefined;
  // Switching to the bidi pseudo-locale sets this as a side effect.
  Services.prefs.clearUserPref("bidi.browser.ui");
});

add_task(async function test_toolbar_button_toggle_animates() {
  const { animated, flagged } = getAnimatedElements();
  const wasHidden = SidebarController.sidebarContainer.hidden;

  toggleWithToolbarButton();
  const animations = await waitForPausedAnimations();

  isnot(
    SidebarController.sidebarContainer.hidden,
    wasHidden,
    "Launcher visibility was toggled"
  );
  for (const el of animated) {
    Assert.greater(
      el.getAnimations().length,
      0,
      `${el.id || el.localName} is animating`
    );
  }
  for (const el of flagged) {
    ok(
      el.hasAttribute("sidebar-ongoing-animations"),
      `${el.id || el.localName} is marked as animating`
    );
  }
  for (const animation of animations) {
    is(
      animation.effect.getTiming().duration,
      ANIMATION_DURATION_MS,
      "Animation uses the configured duration"
    );
  }

  await finishOngoingAnimations();

  for (const el of animated) {
    is(
      el.getAnimations().length,
      0,
      `${el.id || el.localName} has no animations left`
    );
    is(el.style.minWidth, "", "min-width was reset");
    is(el.style.maxWidth, "", "max-width was reset");
    is(el.style.marginLeft, "", "margin-left was reset");
    is(el.style.marginRight, "", "margin-right was reset");
    is(el.style.display, "", "display was reset");
  }
  for (const el of flagged) {
    ok(
      !el.hasAttribute("sidebar-ongoing-animations"),
      `${el.id || el.localName} is no longer marked as animating`
    );
  }

  await ensureLauncherVisibleWithoutAnimating();
});

add_task(async function test_retoggle_cancels_ongoing_animation() {
  toggleWithToolbarButton();
  const firstAnimations = await waitForPausedAnimations({
    description: "the first animation to start",
  });

  toggleWithToolbarButton();
  await waitForPausedAnimations({
    replacing: firstAnimations,
    description: "the interrupted animation to be replaced",
  });

  for (const animation of firstAnimations) {
    is(
      animation.playState,
      "idle",
      "Animation from the interrupted toggle was cancelled"
    );
  }

  await finishOngoingAnimations();

  const { flagged } = getAnimatedElements();
  for (const el of flagged) {
    ok(
      !el.hasAttribute("sidebar-ongoing-animations"),
      `${el.id || el.localName} is no longer marked as animating`
    );
  }
});

add_task(async function test_no_animation_when_pref_disabled() {
  const spy = sinon.spy(SidebarController, "_animateSidebarContainer");
  await SpecialPowers.pushPrefEnv({
    set: [[ANIMATION_ENABLED_PREF, false]],
  });

  const wasHidden = SidebarController.sidebarContainer.hidden;
  toggleWithToolbarButton();
  await SidebarController.waitUntilStable();
  await waitForElementHidden(SidebarController.sidebarContainer, !wasHidden);

  ok(!spy.called, "No animation is run when the animation pref is disabled");
  for (const el of getAnimatedElements().animated) {
    is(
      el.getAnimations().length,
      0,
      `${el.id || el.localName} is not animating`
    );
  }

  await SpecialPowers.popPrefEnv();
  spy.restore();
  await ensureLauncherVisibleWithoutAnimating();
});

add_task(async function test_no_animation_when_reduce_motion() {
  const spy = sinon.spy(SidebarController, "_animateSidebarContainer");
  gReduceMotionOverride = true;

  const wasHidden = SidebarController.sidebarContainer.hidden;
  toggleWithToolbarButton();
  await SidebarController.waitUntilStable();
  await waitForElementHidden(SidebarController.sidebarContainer, !wasHidden);

  ok(!spy.called, "No animation is run when motion is reduced");
  for (const el of getAnimatedElements().animated) {
    is(
      el.getAnimations().length,
      0,
      `${el.id || el.localName} is not animating`
    );
  }

  gReduceMotionOverride = false;
  spy.restore();
  await ensureLauncherVisibleWithoutAnimating();
});

/**
 * The launcher contents are counter-animated so that the buttons stay put while
 * the launcher itself slides. That compensation is only needed when the
 * launcher is docked to the start of the window, which is the right-hand side
 * under RTL - so it must key off `sidebar.position_start` rather than off which
 * physical side the launcher happens to be on.
 */
add_task(async function test_launcher_compensation_by_position() {
  for (const { rtl, positionStart } of POSITION_CASES) {
    const label = `${rtl ? "RTL" : "LTR"}, position ${
      positionStart ? "start" : "end"
    }`;
    info(`Testing ${label}`);
    await SpecialPowers.pushPrefEnv({
      set: [
        [POSITION_SETTING_PREF, positionStart],
        ["intl.l10n.pseudo", rtl ? "bidi" : ""],
      ],
    });

    const win = await BrowserTestUtils.openNewBrowserWindow();
    try {
      await SidebarTestUtils.waitForInitialized(win);
      // A fresh window suppresses motion until an idle task reads the real
      // setting, so opt back in rather than race that task.
      win.gReduceMotionOverride = false;
      const { sidebarContainer, sidebarMain } = win.SidebarController;

      is(win.RTL_UI, rtl, `${label}: window is in the expected direction`);

      await ensureLauncherVisibleWithoutAnimating(
        win,
        `${label}: launcher starts visible`
      );

      // Hiding the launcher shrinks it, which is the case that produces a
      // non-zero translate to compensate for.
      toggleWithToolbarButton(win);
      await waitForPausedAnimations({
        win,
        description: `${label}: the launcher to start animating`,
      });

      const mainAnimations = sidebarMain.getAnimations();
      is(
        mainAnimations.length,
        positionStart ? 1 : 0,
        `${label}: launcher contents ${
          positionStart ? "counter-animate" : "do not counter-animate"
        }`
      );

      if (mainAnimations.length) {
        const [containerFrom, containerTo] = sidebarContainer
          .getAnimations()[0]
          .effect.getKeyframes()
          .map(keyframeTranslateX);
        const [mainFrom, mainTo] = mainAnimations[0].effect
          .getKeyframes()
          .map(keyframeTranslateX);
        // One end of the counter-animation is anchored in place and the other
        // negates the launcher's own translate.
        const [anchored, compensating, launcherTranslate] =
          mainFrom === 0
            ? [mainFrom, mainTo, containerTo]
            : [mainTo, mainFrom, containerFrom];
        is(anchored, 0, `${label}: counter-animation is anchored at one end`);
        isnot(
          launcherTranslate,
          0,
          `${label}: launcher translates while hiding`
        );
        is(
          compensating,
          -launcherTranslate,
          `${label}: launcher contents counter-translate`
        );
      }

      await finishOngoingAnimations(win);
    } finally {
      await BrowserTestUtils.closeWindow(win);
      await SpecialPowers.popPrefEnv();
    }
  }
});
