/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(function () {
  do_get_profile();
  Services.fog.initializeFOG();
});

add_task(function test_ping_enabled_state_survives_reset() {
  const ping = GleanPings.disabledPing;
  const counter = Glean.testOnly.disabledCounter;

  counter.add(1);
  Assert.equal(undefined, counter.testGetValue(), "Disabled by default");

  for (const enabled of [true, false, true]) {
    ping.setEnabled(enabled);
    counter.add(42);
    Assert.equal(
      enabled ? 42 : undefined,
      counter.testGetValue(),
      `Recording follows setEnabled(${enabled}) before reset`
    );
    Services.fog.testResetFOG();
    Assert.equal(undefined, counter.testGetValue(), "Reset clears metric data");
    counter.add(7);
    Assert.equal(
      enabled ? 7 : undefined,
      counter.testGetValue(),
      `Recording follows setEnabled(${enabled}) after reset`
    );
    Services.fog.testResetFOG();
  }
});

add_task(function test_enabled_ping_can_stay_disabled_after_reset() {
  GleanPings.testPing.setEnabled(false);
  Services.fog.testResetFOG();
  Glean.testOnly.cheesyString.set("discarded");
  Assert.equal(
    undefined,
    Glean.testOnly.cheesyString.testGetValue("test-ping"),
    "An explicitly disabled ping stays disabled"
  );
  GleanPings.testPing.setEnabled(true);
  Services.fog.testResetFOG();
});

add_task(function test_server_knobs_still_reset() {
  GleanPings.disabledPing.setEnabled(false);
  Services.fog.applyServerKnobsConfig(
    JSON.stringify({ pings_enabled: { "disabled-ping": true } })
  );
  Glean.testOnly.disabledCounter.add(3);
  Assert.equal(3, Glean.testOnly.disabledCounter.testGetValue());

  Services.fog.testResetFOG();
  Glean.testOnly.disabledCounter.add(5);
  Assert.equal(
    undefined,
    Glean.testOnly.disabledCounter.testGetValue(),
    "Reset clears server-knob overrides without enabling the ping"
  );
});
