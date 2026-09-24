/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { RemoteControlPanel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/remotecontrol/RemoteControlPanel.sys.mjs"
);

const PREF_DYNAMIC_START_ENABLED = "remote.experimental.dynamicstart.enabled";

const WIDGET_ID = "remote-control-toolbar-button";
const VIEW_ID = "remote-control-panel";
const TOGGLE_BUTTON_ID = `${VIEW_ID}-toggle-button`;
const STATUS_TEXT_ID = `${VIEW_ID}-status-text`;

function getToolbarButton() {
  return document.getElementById(WIDGET_ID);
}

async function openPanel() {
  const shown = BrowserTestUtils.waitForEvent(document, "popupshown", true);
  getToolbarButton().click();
  await shown;

  return document.getElementById(VIEW_ID);
}

async function closePanel(panelview) {
  const panel = panelview.closest("panel");
  const hidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  panel.hidePopup();
  await hidden;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_DYNAMIC_START_ENABLED, true]],
  });
});

add_task(async function test_widgetFollowsPreference() {
  await withFakeServers(RemoteControlPanel, async () => {
    ok(getToolbarButton(), "The toolbar button was created");

    await SpecialPowers.pushPrefEnv({
      set: [[PREF_DYNAMIC_START_ENABLED, false]],
    });
    ok(!getToolbarButton(), "The toolbar button was destroyed");

    await SpecialPowers.popPrefEnv();
    ok(getToolbarButton(), "The toolbar button was created again");
  });
});

add_task(async function test_noWidgetWhenServersAlreadyStarted() {
  await withFakeServers(
    RemoteControlPanel,
    async () => {
      ok(
        !getToolbarButton(),
        "No toolbar button when the servers were started from the command line"
      );
    },
    { enabled: true }
  );
});

add_task(async function test_buttonState() {
  await withFakeServers(RemoteControlPanel, async servers => {
    const button = getToolbarButton();
    ok(
      !button.hasAttribute("remote-control-running"),
      "The button is in the stopped state"
    );
    is(
      button.getAttribute("data-l10n-id"),
      "remote-control-toolbar-button",
      "The button has the stopped accessible name"
    );

    await servers.start();

    ok(
      button.hasAttribute("remote-control-running"),
      "The button is in the running state"
    );
    is(
      button.getAttribute("data-l10n-id"),
      "remote-control-toolbar-button-on",
      "The button has the running accessible name"
    );
  });
});

add_task(async function test_toggleServers() {
  await withFakeServers(RemoteControlPanel, async servers => {
    const panelview = await openPanel();
    const statusText = panelview.querySelector(`#${STATUS_TEXT_ID}`);
    const toggleButton = panelview.querySelector(`#${TOGGLE_BUTTON_ID}`);

    is(
      statusText.getAttribute("data-l10n-id"),
      "remote-control-panel-status-stopped",
      "The panel shows the stopped status"
    );
    is(
      toggleButton.getAttribute("data-l10n-id"),
      "remote-control-panel-turn-on-button",
      "The panel offers to turn the servers on"
    );

    toggleButton.click();
    await TestUtils.waitForCondition(
      () => servers.startCount,
      "Waiting for the servers to start"
    );

    is(
      statusText.getAttribute("data-l10n-id"),
      "remote-control-panel-status-running",
      "The panel shows the running status"
    );
    is(
      toggleButton.getAttribute("data-l10n-id"),
      "remote-control-panel-turn-off-button",
      "The panel offers to turn the servers off"
    );

    toggleButton.click();
    await TestUtils.waitForCondition(
      () => servers.stopCount,
      "Waiting for the servers to stop"
    );

    is(
      statusText.getAttribute("data-l10n-id"),
      "remote-control-panel-status-stopped",
      "The panel shows the stopped status again"
    );

    await closePanel(panelview);
  });
});
