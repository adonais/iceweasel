/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPMode } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPChannelFilter.sys.mjs"
);

const PREF_INCLUSION_PATTERNS = "browser.ipProtection.inclusion.match_patterns";

function stubVPNState(initialActive, initialMode = IPPMode.MODE_FULL) {
  const sandbox = sinon.createSandbox();
  let active = !!initialActive;
  let mode = initialMode;
  sandbox
    .stub(IPPProxyManager, "state")
    .get(() => (active ? IPPProxyStates.ACTIVE : IPPProxyStates.NOT_READY));
  sandbox.stub(IPPProxyManager, "mode").get(() => (active ? mode : null));
  return {
    sandbox,
    setActive(value) {
      active = !!value;
      IPPProxyManager.dispatchEvent(
        new CustomEvent("IPPProxyManager:StateChanged", {
          detail: { state: IPPProxyManager.state },
        })
      );
    },
    setMode(value) {
      mode = value;
      IPPProxyManager.dispatchEvent(
        new CustomEvent("IPPProxyManager:ModeChanged", {
          detail: { mode },
        })
      );
    },
    restore() {
      sandbox.restore();
    },
  };
}

add_setup(async function () {
  registerCleanupFunction(() => {
    resetState();
    Services.prefs.clearUserPref(PREF_INCLUSION_PATTERNS);
  });
});

add_task(async function test_vpn_active_matches() {
  const vpn = stubVPNState(true);
  try {
    await checkNotification({ type: "vpn", active: true }, true);
  } finally {
    vpn.restore();
  }
});

add_task(async function test_vpn_inactive_no_match() {
  const vpn = stubVPNState(false);
  try {
    await checkNotification({ type: "vpn", active: true }, false);
  } finally {
    vpn.restore();
  }
});

add_task(async function test_vpn_transition_off_to_on() {
  const vpn = stubVPNState(false);
  try {
    await checkNotification({ type: "vpn", active: true }, false, async tab => {
      vpn.setActive(true);
      await waitForNotification(tab);
    });
  } finally {
    vpn.restore();
  }
});

add_task(async function test_vpn_transition_on_to_off() {
  const vpn = stubVPNState(true);
  try {
    await checkNotification({ type: "vpn", active: true }, true, async tab => {
      vpn.setActive(false);
      await waitForNoNotification(tab);
    });
  } finally {
    vpn.restore();
  }
});

add_task(async function test_vpn_inclusion_mode_site_not_included() {
  const vpn = stubVPNState(true, IPPMode.MODE_INCLUSION);
  try {
    await checkNotification({ type: "vpn", active: true }, false);
  } finally {
    vpn.restore();
  }
});

add_task(async function test_vpn_inclusion_mode_site_included() {
  Services.prefs.setStringPref(
    PREF_INCLUSION_PATTERNS,
    JSON.stringify([`*://${TEST_DOMAIN}/*`])
  );
  const vpn = stubVPNState(true, IPPMode.MODE_INCLUSION);
  try {
    await checkNotification({ type: "vpn", active: true }, true, async tab => {
      Services.prefs.clearUserPref(PREF_INCLUSION_PATTERNS);
      await waitForNoNotification(tab);
    });
  } finally {
    vpn.restore();
    Services.prefs.clearUserPref(PREF_INCLUSION_PATTERNS);
  }
});

add_task(async function test_vpn_mode_inclusion_to_full() {
  const vpn = stubVPNState(true, IPPMode.MODE_INCLUSION);
  try {
    await checkNotification({ type: "vpn", active: true }, false, async tab => {
      vpn.setMode(IPPMode.MODE_FULL);
      await waitForNotification(tab);
    });
  } finally {
    vpn.restore();
  }
});
