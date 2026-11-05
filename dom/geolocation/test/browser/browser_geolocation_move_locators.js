/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression tests for bug 2024432: MoveLocators must update each
// Geolocation::mService back-pointer and clear the source array when an
// override service is removed, so that Geolocation::Shutdown deregisters
// from the correct (global) service and no dangling pointer is left.

const GEO_URL =
  "http://mochi.test:8888/tests/dom/geolocation/test/mochitest/network_geolocation.sjs";

const PAGE_URL =
  "https://example.com/browser/dom/tests/browser/file_empty.html";

const required_preferences = [
  ["geo.provider.network.url", GEO_URL],
  ["geo.timeout", 100],
];

const GLOBAL_COORDS = {
  latitude: 37.41857,
  longitude: -122.08769,
  accuracy: 42,
};

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

async function withGeoTab(fn) {
  await SpecialPowers.pushPrefEnv({ set: required_preferences });

  let pageLoaded;
  let browser;
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    () => {
      gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, PAGE_URL);
      browser = gBrowser.selectedBrowser;
      pageLoaded = BrowserTestUtils.browserLoaded(browser, true);
    },
    false
  );
  await pageLoaded;

  await SpecialPowers.spawn(browser, [], async () => {
    await SpecialPowers.pushPermissions([
      {
        type: "geo",
        allow: SpecialPowers.Services.perms.ALLOW_ACTION,
        context: content.document,
      },
    ]);
  });

  await fn(browser);
  BrowserTestUtils.removeTab(tab);
}

// An iframe accesses geolocation while an override is active, so its
// Geolocation registers with the override service. Clearing the override
// triggers MoveLocators. Removing the iframe afterwards must not leave a
// dangling pointer in the global service.
add_task(async function test_move_locators_iframe() {
  const override = makeOverride(10, 10, 5);
  await withGeoTab(async browser => {
    await SpecialPowers.spawn(
      browser,
      [override, GLOBAL_COORDS],
      async (overrideObj, expected) => {
        const bc = content.browsingContext;
        bc.setGeolocationServiceOverride(overrideObj);

        const iframe = content.document.createElement("iframe");
        const loaded = new Promise(resolve =>
          iframe.addEventListener("load", resolve, { once: true })
        );
        content.document.body.appendChild(iframe);
        await loaded;

        const iframeCoords = await new Promise((resolve, reject) => {
          iframe.contentWindow.navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords.toJSON()),
            reject
          );
        });
        is(iframeCoords.latitude, 10, "Iframe sees overridden latitude");
        is(iframeCoords.longitude, 10, "Iframe sees overridden longitude");

        bc.setGeolocationServiceOverride();
        iframe.remove();

        SpecialPowers.forceGC();
        SpecialPowers.forceCC();
        SpecialPowers.forceGC();

        const mainCoords = await new Promise((resolve, reject) => {
          content.window.navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords.toJSON()),
            reject
          );
        });
        is(
          mainCoords.latitude,
          expected.latitude,
          "Correct latitude after move"
        );
        is(
          mainCoords.longitude,
          expected.longitude,
          "Correct longitude after move"
        );
        is(
          mainCoords.accuracy,
          expected.accuracy,
          "Correct accuracy after move"
        );
      }
    );
  });
});

// Same scenario with two iframes to exercise MoveLocators with multiple
// entries.
add_task(async function test_move_locators_multiple_iframes() {
  const override = makeOverride(20, 20, 10);
  await withGeoTab(async browser => {
    await SpecialPowers.spawn(
      browser,
      [override, GLOBAL_COORDS],
      async (overrideObj, expected) => {
        const bc = content.browsingContext;
        bc.setGeolocationServiceOverride(overrideObj);

        const iframes = [];
        for (let i = 0; i < 2; i++) {
          const iframe = content.document.createElement("iframe");
          const loaded = new Promise(resolve =>
            iframe.addEventListener("load", resolve, { once: true })
          );
          content.document.body.appendChild(iframe);
          await loaded;

          const coords = await new Promise((resolve, reject) => {
            iframe.contentWindow.navigator.geolocation.getCurrentPosition(
              pos => resolve(pos.coords.toJSON()),
              reject
            );
          });
          is(coords.latitude, 20, `Iframe ${i} sees overridden latitude`);
          iframes.push(iframe);
        }

        bc.setGeolocationServiceOverride();
        for (const iframe of iframes) {
          iframe.remove();
        }

        SpecialPowers.forceGC();
        SpecialPowers.forceCC();
        SpecialPowers.forceGC();

        const mainCoords = await new Promise((resolve, reject) => {
          content.window.navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords.toJSON()),
            reject
          );
        });
        is(
          mainCoords.latitude,
          expected.latitude,
          "Correct latitude after move"
        );
        is(
          mainCoords.longitude,
          expected.longitude,
          "Correct longitude after move"
        );
      }
    );
  });
});

// The main page itself accesses geolocation while the override is active,
// then the override is cleared. The page's own Geolocation is moved by
// MoveLocators and must continue to work with the global service.
add_task(async function test_move_locators_main_page() {
  const override = makeOverride(30, 30, 15);
  await withGeoTab(async browser => {
    await SpecialPowers.spawn(
      browser,
      [override, GLOBAL_COORDS],
      async (overrideObj, expected) => {
        const bc = content.browsingContext;
        bc.setGeolocationServiceOverride(overrideObj);

        const overriddenCoords = await new Promise((resolve, reject) => {
          content.window.navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords.toJSON()),
            reject
          );
        });
        is(overriddenCoords.latitude, 30, "Override latitude returned");
        is(overriddenCoords.longitude, 30, "Override longitude returned");
        is(overriddenCoords.accuracy, 15, "Override accuracy returned");

        bc.setGeolocationServiceOverride();

        const globalCoords = await new Promise((resolve, reject) => {
          content.window.navigator.geolocation.getCurrentPosition(
            pos => resolve(pos.coords.toJSON()),
            reject
          );
        });
        is(
          globalCoords.latitude,
          expected.latitude,
          "Global latitude after move"
        );
        is(
          globalCoords.longitude,
          expected.longitude,
          "Global longitude after move"
        );
        is(
          globalCoords.accuracy,
          expected.accuracy,
          "Global accuracy after move"
        );
      }
    );
  });
});
