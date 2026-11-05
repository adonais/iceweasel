/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A geolocation override installed with
// BrowsingContext.setGeolocationServiceOverride must be served entirely from
// the override: the platform geolocation provider must not be started for it,
// neither for getCurrentPosition nor for watchPosition. Starting the provider
// would access the real location and, on some platforms, prompt the user for
// the system geolocation permission.
//
// The parent process notifies "geolocation-device-events" with "starting"
// whenever the provider is started, so we count those notifications. A
// request served by the real (test) provider afterwards acts as a control
// and orders the check: any provider start caused by the overridden requests
// would have been processed before it.

const GEO_URL =
  "http://mochi.test:8888/tests/dom/geolocation/test/mochitest/network_geolocation.sjs";

const PAGE_URL =
  "https://example.com/browser/dom/tests/browser/file_empty.html";

const required_preferences = [
  ["geo.provider.network.url", GEO_URL],
  ["geo.timeout", 100],
];

function makeOverride(latitude, longitude, accuracy) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: NaN,
      altitudeAccuracy: NaN,
      heading: NaN,
      speed: NaN,
    },
    timestamp: Date.now(),
  };
}

add_task(async function test_override_does_not_start_device() {
  await SpecialPowers.pushPrefEnv({ set: required_preferences });

  let deviceStarts = 0;
  const observer = (subject, topic, data) => {
    if (data == "starting") {
      deviceStarts++;
    }
  };
  Services.obs.addObserver(observer, "geolocation-device-events");
  registerCleanupFunction(() => {
    Services.obs.removeObserver(observer, "geolocation-device-events");
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE_URL);
  const browser = tab.linkedBrowser;

  await SpecialPowers.spawn(
    browser,
    [makeOverride(10, 10, 5)],
    async override => {
      await SpecialPowers.pushPermissions([
        {
          type: "geo",
          allow: SpecialPowers.Services.perms.ALLOW_ACTION,
          context: content.document,
        },
      ]);

      const bc = content.browsingContext;
      bc.setGeolocationServiceOverride(override);

      info("getCurrentPosition with an override");
      const current = await new Promise((resolve, reject) =>
        content.window.navigator.geolocation.getCurrentPosition(
          position => resolve(position.coords.toJSON()),
          reject
        )
      );
      is(current.latitude, 10, "Overridden latitude is returned");

      info("watchPosition with an override");
      const watched = new Promise(resolve => {
        const watchId = content.window.navigator.geolocation.watchPosition(
          position => {
            content.window.navigator.geolocation.clearWatch(watchId);
            resolve(position.coords.toJSON());
          }
        );
      });
      is((await watched).latitude, 10, "Overridden latitude is watched");
    }
  );

  is(deviceStarts, 0, "No device start was observed");

  BrowserTestUtils.removeTab(tab);
});
