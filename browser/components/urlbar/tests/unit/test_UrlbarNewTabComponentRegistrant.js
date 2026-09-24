/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that the newtab <moz-urlbar> and the handoff search bar take turns
// registering as New Tab's search component, depending on the urlbar's newtab
// feature gate.

"use strict";

const { AboutNewTabComponentRegistry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/newtab/AboutNewTabComponents.sys.mjs"
);

function searchComponentOf(registry) {
  return registry.values.find(
    config => config.type == AboutNewTabComponentRegistry.TYPES.SEARCH
  );
}

add_setup(function () {
  // Nova is off by default outside Nightly, and the New Tab search bar stands
  // down with it.
  Services.prefs.setBoolPref("browser.nova.enabled", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.nova.enabled");
  });
});

async function setFeatureGate(registry, enabled) {
  let updated = registry.once(AboutNewTabComponentRegistry.UPDATED_EVENT);
  UrlbarPrefs.set("newtab.featureGate", enabled);
  await updated;
}

add_task(async function test_featureGate() {
  UrlbarPrefs.set("newtab.featureGate", false);
  let registry = new AboutNewTabComponentRegistry();
  registerCleanupFunction(() => {
    registry.destroy();
    Services.prefs.clearUserPref("browser.urlbar.newtab.featureGate");
  });

  Assert.equal(
    searchComponentOf(registry).tagName,
    "content-search-handoff-ui",
    "The handoff search bar is registered while the feature gate is disabled"
  );

  await setFeatureGate(registry, true);
  let component = searchComponentOf(registry);
  Assert.equal(
    component.tagName,
    "moz-urlbar",
    "<moz-urlbar> supersedes the handoff search bar once the gate is enabled"
  );
  Assert.equal(
    component.componentURL,
    "chrome://browser/content/urlbar/UrlbarInput.mjs",
    "<moz-urlbar> is delivered from the module that defines it"
  );
  Assert.equal(
    component.attributes["sap-name"],
    "newtab_searchbar",
    "<moz-urlbar> reports the newtab search access point"
  );

  await setFeatureGate(registry, false);
  Assert.equal(
    searchComponentOf(registry).tagName,
    "content-search-handoff-ui",
    "The handoff search bar comes back once the gate is disabled again"
  );
});

add_task(async function test_nova() {
  UrlbarPrefs.set("newtab.featureGate", false);
  let registry = new AboutNewTabComponentRegistry();
  registerCleanupFunction(() => {
    registry.destroy();
    Services.prefs.clearUserPref("browser.urlbar.newtab.featureGate");
  });

  await setFeatureGate(registry, true);
  Assert.equal(
    searchComponentOf(registry).tagName,
    "moz-urlbar",
    "<moz-urlbar> is registered while Nova is enabled"
  );

  let updated = registry.once(AboutNewTabComponentRegistry.UPDATED_EVENT);
  Services.prefs.setBoolPref("browser.nova.enabled", false);
  await updated;

  Assert.equal(
    searchComponentOf(registry).tagName,
    "content-search-handoff-ui",
    "The handoff search bar takes over once Nova is disabled"
  );

  updated = registry.once(AboutNewTabComponentRegistry.UPDATED_EVENT);
  Services.prefs.setBoolPref("browser.nova.enabled", true);
  await updated;

  Assert.equal(
    searchComponentOf(registry).tagName,
    "moz-urlbar",
    "<moz-urlbar> comes back once Nova is enabled again"
  );
});

add_task(async function test_nimbusRollout() {
  UrlbarPrefs.set("newtab.featureGate", false);
  let registry = new AboutNewTabComponentRegistry();
  registerCleanupFunction(() => {
    registry.destroy();
    Services.prefs.clearUserPref("browser.urlbar.newtab.featureGate");
  });

  Assert.equal(
    searchComponentOf(registry).tagName,
    "content-search-handoff-ui",
    "The handoff search bar is registered while the gate is disabled"
  );

  let updated = registry.once(AboutNewTabComponentRegistry.UPDATED_EVENT);
  let unenroll = await UrlbarTestUtils.initNimbusFeature({
    newtabFeatureGate: true,
  });
  await updated;

  Assert.equal(
    searchComponentOf(registry).tagName,
    "moz-urlbar",
    "A Nimbus rollout enables <moz-urlbar> over the disabled pref"
  );

  updated = registry.once(AboutNewTabComponentRegistry.UPDATED_EVENT);
  await unenroll();
  await updated;

  Assert.equal(
    searchComponentOf(registry).tagName,
    "content-search-handoff-ui",
    "The handoff search bar comes back once the rollout ends"
  );
});
