/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const PREF_DYNAMIC_START_ENABLED = "remote.experimental.dynamicstart.enabled";
const PREF_POLICY_DISABLED = "remote.policy.disabled";

// Set before importing the components: Marionette reads MOZ_MARIONETTE in its
// constructor, which runs at import time.
Services.prefs.setBoolPref(PREF_POLICY_DISABLED, true);
Services.prefs.setBoolPref(PREF_DYNAMIC_START_ENABLED, true);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(PREF_POLICY_DISABLED);
  Services.prefs.clearUserPref(PREF_DYNAMIC_START_ENABLED);
});

const { Marionette } = ChromeUtils.importESModule(
  "chrome://remote/content/components/Marionette.sys.mjs"
);
const { RemoteAgent } = ChromeUtils.importESModule(
  "chrome://remote/content/components/RemoteAgent.sys.mjs"
);

add_task(function test_marionette_cannot_be_enabled() {
  Marionette.enabled = true;

  Assert.ok(!Marionette.enabled, "Marionette stayed disabled");
});

add_task(async function test_startAtRuntime_is_refused() {
  Assert.equal(await Marionette.startAtRuntime(), -1, "Marionette refused");
  Assert.equal(await RemoteAgent.startAtRuntime(), -1, "Remote Agent refused");
});

add_task(async function test_command_line_flags_are_ignored() {
  const consumed = [];
  const cmdLine = {
    handleFlag(name) {
      consumed.push(name);
      return true;
    },
    handleFlagWithParam(name) {
      consumed.push(name);
      return name == "remote-debugging-port" ? "9222" : "localhost";
    },
  };

  Services.obs.addObserver(RemoteAgent, "command-line-startup");
  await RemoteAgent.observe(cmdLine, "command-line-startup");

  Assert.deepEqual(consumed, [], "No command line flag was read");
});
