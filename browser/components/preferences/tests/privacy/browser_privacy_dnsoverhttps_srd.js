"use strict";

ChromeUtils.defineESModuleGetters(this, {
  DoHConfigController: "moz-src:///toolkit/components/doh/DoHConfig.sys.mjs",
  DoHController: "moz-src:///toolkit/components/doh/DoHController.sys.mjs",
  DoHTestUtils: "resource://testing-common/DoHTestUtils.sys.mjs",
});

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const gDNSOverride = Cc[
  "@mozilla.org/network/native-dns-override;1"
].getService(Ci.nsINativeDNSResolverOverride);

const TRR_MODE_PREF = "network.trr.mode";
const TRR_URI_PREF = "network.trr.uri";
const TRR_CUSTOM_URI_PREF = "network.trr.custom_uri";
const FIRST_RESOLVER_VALUE = DoHTestUtils.providers[0].uri;

// See bug 1741554. Override the IP to a local address so that any background
// connection attempts to the DoH endpoint don't try to reach a real server.
gDNSOverride.addIPOverride("mozilla.cloudflare-dns.com", "127.0.0.1");

Services.prefs.setStringPref("network.trr.confirmationNS", "skip");

// Mock parental controls service in order to enable it
let parentalControlsService = {
  parentalControlsEnabled: true,
  QueryInterface: ChromeUtils.generateQI(["nsIParentalControlsService"]),
};
let mockParentalControlsServiceCid = undefined;

async function setMockParentalControlEnabled(aEnabled) {
  parentalControlsService.parentalControlsEnabled = aEnabled;
}

async function resetPrefs() {
  await DoHTestUtils.resetRemoteSettingsConfig();
  await DoHController._uninit();
  Services.prefs.clearUserPref(TRR_MODE_PREF);
  Services.prefs.clearUserPref(TRR_URI_PREF);
  Services.prefs.clearUserPref(TRR_CUSTOM_URI_PREF);
  Services.prefs.getChildList("doh-rollout.").forEach(pref => {
    Services.prefs.clearUserPref(pref);
  });
  Services.fog.testResetFOG();
  await DoHController.init();
}

registerCleanupFunction(async () => {
  await resetPrefs();
  Services.prefs.clearUserPref("network.trr.confirmationNS");
  if (mockParentalControlsServiceCid != undefined) {
    MockRegistrar.unregister(mockParentalControlsServiceCid);
    mockParentalControlsServiceCid = undefined;
    Services.dns.reloadParentalControlEnabled();
  }
});

add_setup(async function setup() {
  mockParentalControlsServiceCid = MockRegistrar.register(
    "@mozilla.org/parental-controls-service;1",
    parentalControlsService
  );
  Services.dns.reloadParentalControlEnabled();

  await SpecialPowers.pushPrefEnv({
    set: [["toolkit.telemetry.testing.overrideProductsCheck", true]],
  });

  await DoHTestUtils.resetRemoteSettingsConfig();

  gDNSOverride.addIPOverride("use-application-dns.net.", "4.1.1.1");

  setMockParentalControlEnabled(false);
});

// Regression test for Bug 2037133: the dohStatusBox in the settings-redesign
// DoH advanced sub-pane was falsely showing the "bad URL" error because a
// missed `name` -> `displayName` rename caused `!name` to always be true.
add_task(async function testStatusBoxRedesignPane() {
  await DoHTestUtils.loadRemoteSettingsConfig({
    providers: "example-1, example-2",
    rolloutEnabled: true,
    steeringEnabled: false,
    steeringProviders: "",
    autoDefaultEnabled: false,
    autoDefaultProviders: "",
    id: "global",
  });

  async function withStatusBox(fn) {
    await openPreferencesViaOpenPreferencesAPI("dnsOverHttps", {
      leaveOpen: true,
    });
    let doc = gBrowser.selectedBrowser.contentDocument;
    let statusBox = await TestUtils.waitForCondition(() =>
      doc.getElementById("dohStatusBox")
    );
    await fn(statusBox, doc);
    gBrowser.removeCurrentTab();
  }

  info("Active DoH should show the active status with the provider name");
  Services.prefs.setIntPref(TRR_MODE_PREF, Ci.nsIDNSService.MODE_TRRFIRST);
  Services.prefs.setStringPref(TRR_URI_PREF, FIRST_RESOLVER_VALUE);
  await withStatusBox(async statusBox => {
    let expectedName = DoHConfigController.currentConfig.providerList[0].UIName;
    await TestUtils.waitForCondition(
      () =>
        statusBox.getAttribute("data-l10n-id") ==
          "preferences-doh-status-item-active" &&
        JSON.parse(statusBox.getAttribute("data-l10n-args") || "{}").name ==
          expectedName,
      "waiting for the status box to be marked active with the provider name"
    );
    is(
      statusBox.getAttribute("data-l10n-id"),
      "preferences-doh-status-item-active",
      "Status should be active, not the bad-url error (Bug 2037133)"
    );
    let args = JSON.parse(statusBox.getAttribute("data-l10n-args"));
    is(args.name, expectedName, "Active status carries the provider name");
  });

  info("Parental controls should produce a populated name in the l10n args");
  await setMockParentalControlEnabled(true);
  await withStatusBox(async statusBox => {
    let expectedName = DoHConfigController.currentConfig.providerList[0].UIName;
    await TestUtils.waitForCondition(
      () =>
        statusBox.getAttribute("data-l10n-id") ==
        "preferences-doh-status-item-not-active"
    );
    let args = JSON.parse(statusBox.getAttribute("data-l10n-args"));
    is(
      args.name,
      expectedName,
      "Parental-controls status carries the provider name (Bug 2037133)"
    );
    is(
      args.reason,
      "TRR_PARENTAL_CONTROL",
      "Parental-controls status carries the expected reason"
    );
  });
  await setMockParentalControlEnabled(false);

  await resetPrefs();
  await DoHTestUtils.loadRemoteSettingsConfig({
    providers: "",
    rolloutEnabled: false,
    steeringEnabled: false,
    steeringProviders: "",
    autoDefaultEnabled: false,
    autoDefaultProviders: "",
    id: "global",
  });
  await SpecialPowers.popPrefEnv();
});
