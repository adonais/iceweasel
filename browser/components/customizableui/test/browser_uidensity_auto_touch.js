/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_UI_DENSITY = "browser.uidensity";
const PREF_NOVA = "browser.nova.enabled";
const PREF_AUTO_TOUCH = "browser.touchmode.auto";
const PREF_THRESHOLD = "browser.compactmode.auto.threshold";

const gUIDensity = window.gUIDensity;

// CustomizableUI owns the startup logic that sets browser.touchmode.auto's
// default based on nova (see _setAutoTouchModeDefault). Reach it to re-derive
// the default on demand for the default-value assertions below.
const CustomizableUIInternal = CustomizableUI.getTestOnlyInternalProp(
  "CustomizableUIInternal"
);

async function withTabletMode({ prefs, inTablet }, callback) {
  let original = gUIDensity._inTabletMode;
  gUIDensity._inTabletMode = () => inTablet;
  await SpecialPowers.pushPrefEnv(prefs);
  try {
    gUIDensity.update();
    await callback();
  } finally {
    gUIDensity._inTabletMode = original;
    await SpecialPowers.popPrefEnv();
    gUIDensity.update();
  }
}

function isTouch() {
  return document.documentElement.getAttribute("uidensity") == "touch";
}

add_task(async function test_startup_default_reflects_nova() {
  is(
    Services.prefs.getDefaultBranch("").getBoolPref(PREF_AUTO_TOUCH),
    !Services.prefs.getBoolPref(PREF_NOVA, false),
    "browser.touchmode.auto default is the inverse of the nova value"
  );
});

add_task(async function test_automatic_switches_to_touch_in_tablet_mode() {
  await withTabletMode(
    {
      // The auto-touch checkbox is off: automatic must still switch to touch.
      prefs: {
        set: [
          [PREF_NOVA, true],
          [PREF_THRESHOLD, "0"],
          [PREF_AUTO_TOUCH, false],
        ],
        clear: [[PREF_UI_DENSITY]],
      },
      inTablet: true,
    },
    () => {
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_TOUCH,
        "Automatic density switches to touch in tablet mode even when " +
          "browser.touchmode.auto is false"
      );
      Assert.ok(
        density.overridden,
        "The touch density is reported as overridden"
      );
      Assert.ok(isTouch(), "The document is marked touch");
    }
  );
});

add_task(async function test_automatic_touch_leaves_tablet_mode() {
  await withTabletMode(
    {
      prefs: {
        set: [
          [PREF_NOVA, true],
          [PREF_THRESHOLD, "0"],
          [PREF_AUTO_TOUCH, false],
        ],
        clear: [[PREF_UI_DENSITY]],
      },
      inTablet: false,
    },
    () => {
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_NORMAL,
        "Automatic density is normal when not in tablet mode"
      );
      Assert.ok(
        !density.overridden,
        "The density is not reported as overridden"
      );
      Assert.ok(!isTouch(), "The document is not marked touch");
    }
  );
});

add_task(async function test_standard_ignores_tablet_mode_without_optin() {
  await withTabletMode(
    {
      // Standard is an explicit uidensity value (MODE_NORMAL), so it is not
      // "automatic" and must not switch to touch unless the user opted in.
      prefs: {
        set: [
          [PREF_NOVA, true],
          [PREF_THRESHOLD, "0"],
          [PREF_UI_DENSITY, 0],
          [PREF_AUTO_TOUCH, false],
        ],
      },
      inTablet: true,
    },
    () => {
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_NORMAL,
        "Standard density stays normal in tablet mode without the opt-in"
      );
      Assert.ok(
        !density.overridden,
        "The density is not reported as overridden"
      );
      Assert.ok(!isTouch(), "The document is not marked touch");
    }
  );
});

add_task(async function test_standard_optin_switches_to_touch_in_tablet_mode() {
  await withTabletMode(
    {
      // The user opted into auto-touch-mode for the standard density.
      prefs: {
        set: [
          [PREF_NOVA, true],
          [PREF_THRESHOLD, "0"],
          [PREF_UI_DENSITY, 0],
          [PREF_AUTO_TOUCH, true],
        ],
      },
      inTablet: true,
    },
    () => {
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_TOUCH,
        "Standard density switches to touch in tablet mode when the user " +
          "opted into auto-touch-mode"
      );
      Assert.ok(
        density.overridden,
        "The touch density is reported as overridden"
      );
      Assert.ok(isTouch(), "The document is marked touch");
    }
  );
});

add_task(async function test_auto_touch_ignored_for_explicit_compact() {
  await withTabletMode(
    {
      // Compact is an explicit choice. The auto-touch-mode pref is the standard
      // density's opt-in, so it must not override compact to touch even when on.
      prefs: {
        set: [
          [PREF_NOVA, true],
          [PREF_THRESHOLD, "0"],
          [PREF_UI_DENSITY, 1],
          [PREF_AUTO_TOUCH, true],
        ],
      },
      inTablet: true,
    },
    () => {
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_COMPACT,
        "Explicit compact stays compact in tablet mode even with " +
          "browser.touchmode.auto enabled"
      );
      Assert.ok(
        !density.overridden,
        "The density is not reported as overridden"
      );
      Assert.ok(!isTouch(), "The document is not marked touch");
    }
  );
});

add_task(async function test_explicit_touchmode_pref_without_nova() {
  await withTabletMode(
    {
      // Without nova there is no "Automatic" density, so tablet-mode touch is
      // driven purely by the auto-touch-mode pref. Here it is explicitly off.
      prefs: {
        set: [
          [PREF_NOVA, false],
          [PREF_THRESHOLD, "0"],
          [PREF_AUTO_TOUCH, false],
        ],
        clear: [[PREF_UI_DENSITY]],
      },
      inTablet: true,
    },
    async () => {
      is(
        gUIDensity.getCurrentDensity().mode,
        gUIDensity.MODE_NORMAL,
        "Without nova, tablet mode does not switch to touch when " +
          "browser.touchmode.auto is explicitly false"
      );
      Assert.ok(!isTouch(), "The document is not marked touch");

      // Turning it on switches to touch without nova.
      await SpecialPowers.pushPrefEnv({ set: [[PREF_AUTO_TOUCH, true]] });
      gUIDensity.update();
      is(
        gUIDensity.getCurrentDensity().mode,
        gUIDensity.MODE_TOUCH,
        "Without nova, enabling browser.touchmode.auto switches to touch"
      );
      Assert.ok(isTouch(), "The document is marked touch");
      await SpecialPowers.popPrefEnv();
    }
  );
});

add_task(async function test_auto_touch_default_follows_nova() {
  const defaultBranch = Services.prefs.getDefaultBranch("");
  const original = defaultBranch.getBoolPref(PREF_AUTO_TOUCH);
  registerCleanupFunction(() =>
    defaultBranch.setBoolPref(PREF_AUTO_TOUCH, original)
  );

  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA, false]] });
  CustomizableUIInternal._setAutoTouchModeDefault();
  is(
    defaultBranch.getBoolPref(PREF_AUTO_TOUCH),
    true,
    "browser.touchmode.auto defaults on when nova is disabled"
  );
  await SpecialPowers.popPrefEnv();

  await SpecialPowers.pushPrefEnv({ set: [[PREF_NOVA, true]] });
  CustomizableUIInternal._setAutoTouchModeDefault();
  is(
    defaultBranch.getBoolPref(PREF_AUTO_TOUCH),
    false,
    "browser.touchmode.auto defaults off when nova is enabled"
  );
  await SpecialPowers.popPrefEnv();

  CustomizableUIInternal._setAutoTouchModeDefault();
});

add_task(async function test_non_nova_default_switches_to_touch_in_tablet() {
  const defaultBranch = Services.prefs.getDefaultBranch("");
  const original = defaultBranch.getBoolPref(PREF_AUTO_TOUCH);
  registerCleanupFunction(() =>
    defaultBranch.setBoolPref(PREF_AUTO_TOUCH, original)
  );

  await withTabletMode(
    {
      // No explicit browser.touchmode.auto user value: rely on the nova-derived
      // default (on, pre-nova).
      prefs: {
        set: [
          [PREF_NOVA, false],
          [PREF_THRESHOLD, "0"],
        ],
        clear: [[PREF_UI_DENSITY], [PREF_AUTO_TOUCH]],
      },
      inTablet: true,
    },
    () => {
      CustomizableUIInternal._setAutoTouchModeDefault();
      is(
        Services.prefs.getBoolPref(PREF_AUTO_TOUCH),
        true,
        "Pre-nova, browser.touchmode.auto is on by default"
      );
      gUIDensity.update();
      let density = gUIDensity.getCurrentDensity();
      is(
        density.mode,
        gUIDensity.MODE_TOUCH,
        "Pre-nova auto-switches to touch in tablet mode with the default pref"
      );
      Assert.ok(
        density.overridden,
        "The touch density is reported as overridden"
      );
      Assert.ok(isTouch(), "The document is marked touch");
    }
  );
});
