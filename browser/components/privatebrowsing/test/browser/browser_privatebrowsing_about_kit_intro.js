/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const REDESIGN_PREF = "browser.privateWindowRedesign.enabled";
const SHOWN_PREF = "browser.privatebrowsing.introAnimationShown";
// The redesign styles are nested inside @media -moz-pref(browser.nova.enabled),
// so nothing applies unless both are on.
const NOVA_PREF = "browser.nova.enabled";

add_setup(async function () {
  registerCleanupFunction(async () => {
    await ASRouter.resetMessageState();
  });
});

// Without the experiment the intro stays hidden and the static logo shows.
add_task(async function test_intro_absent_without_experiment() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, false],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    const logo = content.document.getElementById("about-private-browsing-logo");
    ok(intro, "The intro component exists in the markup");
    ok(intro.hidden, "The intro is hidden when the experiment is off");
    ok(
      !logo.hidden,
      "The static mask logo is shown when the experiment is off"
    );
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

// With the experiment on and unseen, the intro replaces the logo and plays.
add_task(async function test_intro_plays_on_first_run() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      [SHOWN_PREF, false],
      ["ui.prefersReducedMotion", 0],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    const logo = content.document.getElementById("about-private-browsing-logo");
    ok(!intro.hidden, "The intro is shown when the experiment is on");
    ok(logo.hidden, "The static mask logo is hidden when the experiment is on");
    ok(intro.wrappedJSObject.play, "The intro plays on the first run");

    await intro.wrappedJSObject.updateComplete;
    const circle = intro.shadowRoot.querySelector(".circle");
    ok(
      circle.classList.contains("playing"),
      "The circle is in the playing state"
    );
    ok(
      content.document.documentElement.classList.contains("intro-playing"),
      "The sequential fade-in of the rest of the page is driven"
    );
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

// Once the seen-once flag is set, the intro shows its final state and does not replay.
add_task(async function test_intro_does_not_replay_when_seen() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      [SHOWN_PREF, true],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    ok(!intro.hidden, "The intro is still shown (final mask state)");
    ok(
      !intro.wrappedJSObject.play,
      "The intro does not play once already seen"
    );

    await intro.wrappedJSObject.updateComplete;
    const circle = intro.shadowRoot.querySelector(".circle");
    ok(
      !circle.classList.contains("playing"),
      "The circle is not in the playing state"
    );
    ok(
      !content.document.documentElement.classList.contains("intro-playing"),
      "The rest of the page is not faded in again"
    );
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

// Playing the intro persists the seen-once flag (via the RPMSetPref write path).
add_task(async function test_intro_persists_seen_flag() {
  Services.prefs.clearUserPref(SHOWN_PREF);
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      ["ui.prefersReducedMotion", 0],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    ok(intro.wrappedJSObject.play, "The intro plays on the first run");
  });

  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(SHOWN_PREF, false),
    "The seen-once flag is persisted when the intro plays"
  );
  ok(
    Services.prefs.getBoolPref(SHOWN_PREF, false),
    "introAnimationShown is true after the intro plays"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
  Services.prefs.clearUserPref(SHOWN_PREF);
});

// Reduced motion: the intro is shown but does not animate.
add_task(async function test_intro_respects_reduced_motion() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      [SHOWN_PREF, false],
      ["ui.prefersReducedMotion", 1],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    ok(!intro.hidden, "The intro is shown under reduced motion");
    ok(
      !intro.wrappedJSObject.play,
      "The intro does not play under reduced motion"
    );
    ok(
      !content.document.documentElement.classList.contains("intro-playing"),
      "The page is not staggered in under reduced motion"
    );
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

// Asserts the relationships between the delays, not their values.
add_task(async function test_intro_sequence_is_ordered() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      [SHOWN_PREF, false],
      ["ui.prefersReducedMotion", 0],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    await intro.wrappedJSObject.updateComplete;

    const timing = el => {
      const style = content.getComputedStyle(el);
      return {
        delay: parseFloat(style.animationDelay),
        duration: parseFloat(style.animationDuration),
        fill: style.animationFillMode,
      };
    };

    // Shadow DOM and page: nothing but this check keeps the two in step.
    const mask = timing(intro.shadowRoot.querySelector(".mask"));
    const header = timing(content.document.querySelector(".nova-tagline"));
    is(
      mask.delay,
      header.delay,
      "The mask and the header start fading in together"
    );
    is(
      mask.duration,
      header.duration,
      "The mask and the header fade over the same duration"
    );

    const steps = [
      ["header", content.document.querySelector(".nova-tagline")],
      ["sub-header", content.document.querySelector(".nova-subheader")],
      ["search bar", content.document.querySelector(".search-inner-wrapper")],
    ];

    let previous = null;
    for (const [name, el] of steps) {
      const step = timing(el);
      Assert.greater(step.duration, 0, `The ${name} has an intro animation`);
      is(
        step.fill,
        "backwards",
        `The ${name} is held at its start state through its delay`
      );

      if (previous) {
        Assert.greater(
          step.delay,
          previous.timing.delay,
          `The ${name} starts after the ${previous.name} (${step.delay}s > ${previous.timing.delay}s)`
        );
        // No dead air: each step starts by the time the previous one ends.
        // Overlap is intentional where the tail of an animation reveals
        // little, so only a positive gap is a failure.
        const gap =
          step.delay - (previous.timing.delay + previous.timing.duration);
        Assert.lessOrEqual(
          gap,
          0,
          `The ${name} starts before the ${previous.name} finishes (gap ${gap}s)`
        );
      }
      previous = { name, timing: step };
    }

    Assert.greaterOrEqual(
      steps.length,
      3,
      `Checked ${steps.length} steps of the sequence`
    );

    // The wipe must finish exactly at the paragraph's bottom edge. Ending past
    // it reveals the text early and wastes the rest of the duration.
    const subheader = content.document.querySelector(".nova-subheader");
    const [revealAnim] = subheader.getAnimations();
    const lastFrame = revealAnim.effect.getKeyframes().at(-1);
    ok(
      !lastFrame.clipPath.includes("-"),
      `The sub-header wipe ends at its bottom edge (${lastFrame.clipPath})`
    );

    const searchBar = timing(
      content.document.querySelector(".search-inner-wrapper")
    );
    const basicsLink = timing(
      content.document.getElementById("private-window-basics")
    );
    is(
      basicsLink.delay,
      searchBar.delay,
      "The basics link starts with the search bar"
    );
    is(
      basicsLink.duration,
      searchBar.duration,
      "The basics link fades over the same duration as the search bar"
    );

    const promo = content.document.querySelector(".nova-promo-wrapper");
    ok(
      !promo ||
        !content.getComputedStyle(promo).animationName.startsWith("intro-"),
      "The promo takes no part in the sequence"
    );
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

// Suppressing the promo must not spend its frequency allocation.
add_task(async function test_no_promo_alongside_the_intro() {
  await ASRouter.resetMessageState();

  const promoId = `PB_NEWTAB_INTRO_PROMO_${Math.random()}`;
  let cleanupExperiment = await setupMSExperimentWithMessage({
    id: promoId,
    template: "pb_newtab",
    content: {
      hideDefault: true,
      promoEnabled: true,
      promoLinkText: "fluent:about-private-browsing-prominent-cta",
      promoLinkType: "link",
      promoButton: {
        action: {
          type: "OPEN_URL",
          data: { args: "https://example.com/", where: "tabshifted" },
        },
      },
    },
  });

  // By id, not template: hideDefault removes the default ones legitimately.
  const enrolledInState = () =>
    ASRouter.state.messages.filter(m => m.id.includes(promoId)).length;

  Assert.greater(enrolledInState(), 0, "The enrolled message is in state");

  let suppressed = await ASRouter.sendPBNewTabMessage({
    hideDefault: true,
    introPlaying: true,
  });
  ok(!suppressed.message, "No message is served while the intro is playing");
  Assert.greater(
    enrolledInState(),
    0,
    "Suppressing leaves the message in state, so it is not stranded"
  );
  is(
    Object.keys(ASRouter.state.messageImpressions).length,
    0,
    "Suppressing the promo records no impression, so its allocation is intact"
  );

  let served = await ASRouter.sendPBNewTabMessage({
    hideDefault: true,
    introPlaying: false,
  });
  Assert.greater(
    enrolledInState(),
    0,
    "The pb_newtab message is back in state on the next request"
  );
  ok(served.message, "A message is served once the intro is not playing");
  is(
    served.message.template,
    "pb_newtab",
    "The message served on the second run is the pb_newtab one"
  );

  let again = await ASRouter.sendPBNewTabMessage({
    hideDefault: true,
    introPlaying: false,
  });
  ok(again.message, "The message is still served on subsequent runs");

  await cleanupExperiment();
  await ASRouter.resetMessageState();
});

// Nothing anywhere on the page animates on a later run, in the page or in the
// component's shadow tree, and everything is left in its final visible state.
add_task(async function test_nothing_animates_after_the_first_run() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [NOVA_PREF, true],
      [REDESIGN_PREF, true],
      [SHOWN_PREF, true],
      ["ui.prefersReducedMotion", 0],
    ],
  });

  let { win, tab } = await openTabAndWaitForRender();
  await SpecialPowers.spawn(tab, [], async function () {
    const intro = content.document.querySelector("private-browsing-mask-intro");
    await intro.wrappedJSObject.updateComplete;

    ok(
      !content.document.documentElement.classList.contains("intro-playing"),
      "The page is not in the intro state"
    );
    ok(!intro.wrappedJSObject.play, "The kit does not play");

    const targets = [
      [".nova-tagline", content.document.querySelector(".nova-tagline")],
      [".nova-subheader", content.document.querySelector(".nova-subheader")],
      [
        ".search-inner-wrapper",
        content.document.querySelector(".search-inner-wrapper"),
      ],
      [
        "#private-window-basics",
        content.document.getElementById("private-window-basics"),
      ],
      [".circle", intro.shadowRoot.querySelector(".circle")],
      [".kit", intro.shadowRoot.querySelector(".kit")],
      [".mask", intro.shadowRoot.querySelector(".mask")],
    ].filter(([, el]) => el);

    for (const [name, el] of targets) {
      const running = el.getAnimations().map(a => a.animationName ?? "?");
      is(
        running.length,
        0,
        `${name} has no animation (${running.join(", ") || "none"})`
      );
    }

    // The mask and the page content must still be fully visible, not stranded
    // in the hidden state the intro starts from.
    for (const [name, el] of targets) {
      const style = content.getComputedStyle(el);
      isnot(style.visibility, "hidden", `${name} is not hidden`);
      isnot(style.opacity, "0", `${name} is not transparent`);
    }
  });

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});
