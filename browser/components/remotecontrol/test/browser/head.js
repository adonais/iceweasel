/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { setRemoteControlServers } = ChromeUtils.importESModule(
  "moz-src:///browser/components/remotecontrol/RemoteControlServers.sys.mjs"
);

const DYNAMIC_START_ID = "remote-control-dynamic-start";
const CONNECTED_ID = "remote-control-connected";
const STOPPED_ID = "remote-control-stopped";

/**
 * Stand-in for the RemoteControlServers implementation backed by the Marionette
 * and Remote Agent components, which cannot be driven from a test because the
 * mochitest harness always starts Marionette for browser automation.
 */
class FakeRemoteControlServers {
  constructor() {
    this.enabled = false;
    this.hasActiveSession = false;
    this.runningDynamically = false;
    this.startCount = 0;
    this.stopCount = 0;

    this._listeners = new Set();
  }

  addListener(listener) {
    this._listeners.add(listener);
  }

  removeListener(listener) {
    this._listeners.delete(listener);
  }

  /**
   * Notify the UI that the state of the servers or of the sessions changed.
   * Should be called after updating any of the state properties directly.
   */
  emit() {
    for (const listener of [...this._listeners]) {
      listener();
    }
  }

  async start() {
    this.startCount++;
    this.runningDynamically = true;
    this.emit();
  }

  async stop() {
    this.stopCount++;
    this.runningDynamically = false;
    this.hasActiveSession = false;
    this.emit();
  }
}

/**
 * Run a callback with a UI component wired to a FakeRemoteControlServers
 * instance instead of the real Marionette and Remote Agent components.
 *
 * @param {object} component
 *     The RemoteControlBanner or RemoteControlPanel singleton.
 * @param {Function} callback
 *     Async function called with the FakeRemoteControlServers instance.
 * @param {object=} initialState
 *     Properties to set on the fake before the component is initialized.
 */
async function withFakeServers(component, callback, initialState = {}) {
  component.uninit();

  const servers = Object.assign(new FakeRemoteControlServers(), initialState);
  setRemoteControlServers(servers);
  component.init();

  try {
    await callback(servers);
  } finally {
    component.uninit();
    setRemoteControlServers(null);
    component.init();
  }
}

function getBanner(id, win = window) {
  return win.gNotificationBox.getNotificationWithValue(id);
}

async function waitForBanner(id, win = window) {
  await TestUtils.waitForCondition(
    () => getBanner(id, win),
    `Waiting for the "${id}" banner`
  );

  const banner = getBanner(id, win);
  await banner.updateComplete;
  return banner;
}

async function waitForNoBanner(id, win = window) {
  await TestUtils.waitForCondition(
    () => !getBanner(id, win),
    `Waiting for the "${id}" banner to be removed`
  );
}

function getBannerButton(banner, l10nId) {
  return banner.buttonContainer.querySelector(`[data-l10n-id=${l10nId}]`);
}
