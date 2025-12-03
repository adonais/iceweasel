/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PREF = "browser.newtabpage.shouldInitialize";

add_task(async function test_aboutnewtab_init_gate() {
  ok(AboutNewTab.initialized, "AboutNewTab should initialize by default");

  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });

  // Reset for a clean start.
  AboutNewTab.uninit();

  // Call init(); with pref=false, we should bail out early.
  AboutNewTab.init();

  ok(
    !AboutNewTab.initialized,
    "AboutNewTab should not be initialized when pref is false"
  );

  // Cleanup and reset.
  await SpecialPowers.popPrefEnv();
  AboutNewTab.init();
  await AboutNewTab.onBrowserReady();
});
