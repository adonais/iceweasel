/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { AboutWelcomeTelemetry } = ChromeUtils.importESModule(
  "resource:///modules/aboutwelcome/AboutWelcomeTelemetry.sys.mjs"
);
const { AttributionCode } = ChromeUtils.importESModule(
  "moz-src:///browser/components/attribution/AttributionCode.sys.mjs"
);
const { TelemetryController } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryController.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const TELEMETRY_PREF = "browser.newtabpage.activity-stream.telemetry";

add_setup(async () => {
  do_get_profile();
  Services.fog.initializeFOG();
  await TelemetryController.testSetup();
});

add_task(function test_enabled() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(TELEMETRY_PREF);
  });
  Services.prefs.setBoolPref(TELEMETRY_PREF, true);

  const AWTelemetry = new AboutWelcomeTelemetry();

  equal(AWTelemetry.telemetryEnabled, true, "Telemetry should be on");

  Services.prefs.setBoolPref(TELEMETRY_PREF, false);

  equal(AWTelemetry.telemetryEnabled, false, "Telemetry should be off");
});

add_task(async function test_pingPayload() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(TELEMETRY_PREF);
    sinon.restore();
  });
  Services.prefs.setBoolPref(TELEMETRY_PREF, true);
  const AWTelemetry = new AboutWelcomeTelemetry();
  sinon.stub(AWTelemetry, "_createPing").resolves({ event: "MOCHITEST" });

  let pingSubmitted = false;
  GleanPings.messagingSystem.testBeforeNextSubmit(() => {
    pingSubmitted = true;
    Assert.equal(Glean.messagingSystem.event.testGetValue(), "MOCHITEST");
  });
  await AWTelemetry.sendTelemetry();

  ok(pingSubmitted, "Glean ping was submitted");
});

add_task(async function test_mayAttachAttribution() {
  const sandbox = sinon.createSandbox();
  Services.prefs.setBoolPref(TELEMETRY_PREF, true);
  registerCleanupFunction(() => {
    sandbox.restore();
    Services.prefs.clearUserPref(TELEMETRY_PREF);
  });

  const AWTelemetry = new AboutWelcomeTelemetry();

  sandbox.stub(AttributionCode, "getCachedAttributionData").returns(null);

  let ping = AWTelemetry._maybeAttachAttribution({});

  equal(ping.attribution, undefined, "Should not set attribution if it's null");

  sandbox.restore();
  sandbox.stub(AttributionCode, "getCachedAttributionData").returns({});
  ping = AWTelemetry._maybeAttachAttribution({});

  equal(
    ping.attribution,
    undefined,
    "Should not set attribution if it's empty"
  );

  const attr = {
    source: "google.com",
    medium: "referral",
    campaign: "Firefox-Brand-US-Chrome",
    content: "(not set)",
    experiment: "(not set)",
    variation: "(not set)",
    ua: "chrome",
    dltoken: "(not set)",
    msstoresignedin: "false",
    msclkid: "(not set)",
    dlsource: "(not set)",

    invalid: "unused",
  };
  sandbox.restore();
  sandbox.stub(AttributionCode, "getCachedAttributionData").returns(attr);
  ping = AWTelemetry._maybeAttachAttribution({});

  equal(ping.attribution, attr, "Should set attribution if it presents");

  await GleanPings.messagingSystem.testSubmission(
    () => {
      const glAttr = Glean.messagingSystemAttribution;
      Assert.equal(glAttr.source.testGetValue(), attr.source);
      Assert.equal(glAttr.medium.testGetValue(), attr.medium);
      Assert.equal(glAttr.campaign.testGetValue(), attr.campaign);
      Assert.equal(glAttr.content.testGetValue(), attr.content);
      Assert.equal(glAttr.experiment.testGetValue(), attr.experiment);
      Assert.equal(glAttr.variation.testGetValue(), attr.variation);
      Assert.equal(glAttr.ua.testGetValue(), attr.ua);
      Assert.equal(glAttr.dltoken.testGetValue(), attr.dltoken);
      Assert.equal(glAttr.msstoresignedin.testGetValue(), attr.msstoresignedin);
      Assert.equal(glAttr.msclkid.testGetValue(), attr.msclkid);
      Assert.equal(glAttr.dlsource.testGetValue(), attr.dlsource);

      Assert.equal(glAttr.unknownKeys.invalid.testGetValue(), 1);
    },
    async () => {
      await AWTelemetry.sendTelemetry({ event: "MOCHITEST" });
    }
  );
});
