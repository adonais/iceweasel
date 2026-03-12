/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test that various navigation methods can't framebust

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.disable_open_during_load", true],
      ["dom.security.framebusting_intervention.enabled", true],
      ["dom.disable_open_click_delay", 0],
    ],
  });
});

add_task(async function test_framebusting_navigation() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  // top.location =
  await triggerFramebustingIntervention(tab, "", {
    exception: true,
    notification: true,
  });

  // top.open()
  await triggerFramebustingIntervention(tab, "?initiator=open", {
    exception: true,
    notification: false,
  });

  // <form> with target="_top"
  await triggerFramebustingIntervention(tab, "?initiator=form", {
    exception: true,
    notification: true,
  });

  // <a> with target="_top"
  await triggerFramebustingIntervention(tab, "?initiator=link", {
    exception: false,
    notification: true,
  });

  // top.location = mailto:
  await triggerFramebustingIntervention(tab, "?initiator=mailto", {
    exception: true,
    notification: true,
  });

  BrowserTestUtils.removeTab(tab);
});
