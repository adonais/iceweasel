/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { RemoteControlBanner } = ChromeUtils.importESModule(
  "moz-src:///browser/components/remotecontrol/RemoteControlBanner.sys.mjs"
);

const PREF_DYNAMIC_START_ENABLED = "remote.experimental.dynamicstart.enabled";
const PREF_BANNER_ENABLED = "remote.experimental.dynamicstart.banner.enabled";
const PREF_CONNECTION_BANNER_ENABLED =
  "remote.experimental.dynamicstart.connectionbanner.enabled";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_BANNER_ENABLED, true],
      [PREF_CONNECTION_BANNER_ENABLED, true],
    ],
  });
});

add_task(async function test_noBannerWhenNotRunning() {
  await withFakeServers(RemoteControlBanner, async servers => {
    servers.emit();

    ok(!getBanner(DYNAMIC_START_ID), "No dynamic start banner");
    ok(!getBanner(CONNECTED_ID), "No connected banner");
    ok(!getBanner(STOPPED_ID), "No stopped banner");
  });
});

add_task(async function test_dynamicStartBanner() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();

    const banner = await waitForBanner(DYNAMIC_START_ID);
    is(
      banner.messageL10nId,
      "remote-control-dynamic-start-banner-message",
      "The dynamic start message is displayed"
    );
    ok(
      getBannerButton(
        banner,
        "remote-control-dynamic-start-banner-stop-button"
      ),
      "The stop button is displayed"
    );
    ok(
      getBannerButton(
        banner,
        "remote-control-dynamic-start-banner-disable-button"
      ),
      "The disable button is displayed"
    );

    servers.runningDynamically = false;
    servers.emit();

    await waitForNoBanner(DYNAMIC_START_ID);
  });
});

add_task(async function test_connectedBanner() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();
    await waitForBanner(DYNAMIC_START_ID);

    servers.hasActiveSession = true;
    servers.emit();

    const banner = await waitForBanner(CONNECTED_ID);
    is(
      banner.messageL10nId,
      "remote-control-connected-banner-message",
      "The connected message is displayed"
    );
    ok(
      getBannerButton(
        banner,
        "remote-control-connected-banner-disconnect-button"
      ),
      "The disconnect button is displayed"
    );
    ok(!getBanner(DYNAMIC_START_ID), "The dynamic start banner was removed");

    servers.hasActiveSession = false;
    servers.emit();

    await waitForBanner(DYNAMIC_START_ID);
    ok(!getBanner(CONNECTED_ID), "The connected banner was removed");
  });
});

add_task(async function test_stopButton() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();

    const banner = await waitForBanner(DYNAMIC_START_ID);
    getBannerButton(
      banner,
      "remote-control-dynamic-start-banner-stop-button"
    ).click();

    const stoppedBanner = await waitForBanner(STOPPED_ID);
    is(servers.stopCount, 1, "The servers were stopped");
    is(
      stoppedBanner.messageL10nId,
      "remote-control-dynamic-start-banner-stopped-message",
      "The stopped confirmation is displayed"
    );
    is(
      stoppedBanner.buttonContainer.childElementCount,
      0,
      "The confirmation has no button"
    );
    ok(!getBanner(DYNAMIC_START_ID), "The dynamic start banner was removed");
  });
});

add_task(async function test_disableButton() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();

    const banner = await waitForBanner(DYNAMIC_START_ID);
    getBannerButton(
      banner,
      "remote-control-dynamic-start-banner-disable-button"
    ).click();

    const stoppedBanner = await waitForBanner(STOPPED_ID);
    is(servers.stopCount, 1, "The servers were stopped");
    is(
      stoppedBanner.messageL10nId,
      "remote-control-dynamic-start-banner-disabled-message",
      "The disabled confirmation is displayed"
    );
    ok(
      !Services.prefs.getBoolPref(PREF_DYNAMIC_START_ENABLED),
      "The dynamic start preference was flipped to false"
    );
  });

  Services.prefs.setBoolPref(PREF_DYNAMIC_START_ENABLED, true);
});

add_task(async function test_disconnectButton() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();
    servers.hasActiveSession = true;
    servers.emit();

    const banner = await waitForBanner(CONNECTED_ID);
    getBannerButton(
      banner,
      "remote-control-connected-banner-disconnect-button"
    ).click();

    await waitForBanner(STOPPED_ID);
    is(servers.stopCount, 1, "The servers were stopped");
    ok(!getBanner(CONNECTED_ID), "The connected banner was removed");
  });
});

add_task(async function test_bannerPreferences() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await SpecialPowers.pushPrefEnv({ set: [[PREF_BANNER_ENABLED, false]] });

    await servers.start();
    ok(!getBanner(DYNAMIC_START_ID), "The dynamic start banner is disabled");

    servers.hasActiveSession = true;
    servers.emit();
    await waitForBanner(CONNECTED_ID);
    ok(true, "The connected banner is still displayed");

    await SpecialPowers.pushPrefEnv({
      set: [[PREF_CONNECTION_BANNER_ENABLED, false]],
    });
    await waitForNoBanner(CONNECTED_ID);
    ok(true, "The connected banner is disabled");

    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_allWindows() {
  await withFakeServers(RemoteControlBanner, async servers => {
    await servers.start();
    await waitForBanner(DYNAMIC_START_ID);

    const win = await BrowserTestUtils.openNewBrowserWindow();
    await waitForBanner(DYNAMIC_START_ID, win);
    ok(true, "The banner is displayed in the new window");

    getBannerButton(
      getBanner(DYNAMIC_START_ID, win),
      "remote-control-dynamic-start-banner-stop-button"
    ).click();

    await waitForBanner(STOPPED_ID, win);
    await waitForBanner(STOPPED_ID, window);
    ok(true, "The confirmation is displayed in all windows");

    await BrowserTestUtils.closeWindow(win);
  });
});
