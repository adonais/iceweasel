/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that scroll animations on the page:
// - don't crash the panel
// - are not visible in the animation panel (we don't have
//   UI to support scroll timeline at the moment)

add_task(async function () {
  await pushPref("layout.css.scroll-driven-animations.enabled", true);
  const tab = await addTab(URL_ROOT + "doc_scroll_animation.html");

  const { panel } = await openAnimationInspector();

  // Wait for a bit so the animation could be reported to DevTools
  await wait(1000);

  isnot(
    panel.querySelector(".devtools-sidepanel-no-result"),
    null,
    "The animation panel doesn't list any animation"
  );

  info(
    "Set up scroll animation on element to make sure this doesn't cause any issue"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async function () {
    const win = content.wrappedJSObject;
    win.document
      .querySelector(".target:not(.scroll-animated)")
      .classList.toggle("scroll-animated");
  });

  // Wait for a bit so the animation could be reported to DevTools
  await wait(1000);
  isnot(
    panel.querySelector(".devtools-sidepanel-no-result"),
    null,
    "The panel still doesn't list any animation"
  );
});
