"use strict";

async function background(test) {
  let action = browser.action || browser.browserAction;

  async function pinToToolbar(shouldPinToToolbar) {
    const identifier = `${shouldPinToToolbar ? "pin-to-toolbar" : "unpin-from-toolbar"}-${crypto.randomUUID()}`;

    const promise = new Promise(resolve => {
      function listener(id) {
        if (id !== identifier) {
          browser.test.fail(`unexpected message received: ${id}`);
        }

        browser.test.onMessage.removeListener(listener);
        resolve(id);
      }
      browser.test.onMessage.addListener(listener);
    });

    browser.test.sendMessage("pinToToolbar", {
      identifier,
      shouldPinToToolbar,
    });

    await promise;
  }

  function waitForUserSettingsChanged() {
    return new Promise(resolve => {
      function listener(changed) {
        action.onUserSettingsChanged.removeListener(listener);
        resolve(changed);
      }
      action.onUserSettingsChanged.addListener(listener);
    });
  }

  let tests = {};

  tests.onUserSettingsChanged = async function () {
    let userSettingsChanged = waitForUserSettingsChanged();
    await pinToToolbar(true);
    let userSettings = await userSettingsChanged;
    browser.test.assertTrue(
      userSettings.isOnToolbar,
      "isOnToolbar should be true after pinning to toolbar"
    );
    browser.test.assertDeepEq(
      userSettings,
      await action.getUserSettings(),
      "The output of action.getUserSettings() and the onUserSettingsChanged event should be identical"
    );

    userSettingsChanged = waitForUserSettingsChanged();
    await pinToToolbar(false);
    userSettings = await userSettingsChanged;
    browser.test.assertFalse(
      userSettings.isOnToolbar,
      "isOnToolbar should be false after unpinning from toolbar"
    );
    browser.test.assertDeepEq(
      userSettings,
      await action.getUserSettings(),
      "The output of action.getUserSettings() and the onUserSettingsChanged event should be identical"
    );

    userSettingsChanged = waitForUserSettingsChanged();
    await pinToToolbar(true);
    userSettings = await userSettingsChanged;
    browser.test.assertTrue(
      userSettings.isOnToolbar,
      "isOnToolbar should be true after pinning to toolbar"
    );
    browser.test.assertDeepEq(
      userSettings,
      await action.getUserSettings(),
      "The output of action.getUserSettings() and the onUserSettingsChanged event should be identical"
    );

    userSettingsChanged = waitForUserSettingsChanged();
    await pinToToolbar(false);
    userSettings = await userSettingsChanged;
    browser.test.assertFalse(
      userSettings.isOnToolbar,
      "isOnToolbar should be false after unpinning from toolbar"
    );
    browser.test.assertDeepEq(
      userSettings,
      await action.getUserSettings(),
      "The output of action.getUserSettings() and the onUserSettingsChanged event should be identical"
    );

    await browser.test.notifyPass("onUserSettingsChanged");
  };

  tests.default_area_onUserSettingsChanged = async function () {
    let userSettingsChanged = waitForUserSettingsChanged();
    await pinToToolbar(false);
    let userSettings = await userSettingsChanged;
    browser.test.assertFalse(
      userSettings.isOnToolbar,
      "isOnToolbar should be false after unpinning from toolbar"
    );
    browser.test.assertDeepEq(
      userSettings,
      await action.getUserSettings(),
      "The output of action.getUserSettings() and the onUserSettingsChanged event should be identical"
    );

    await browser.test.notifyPass("onUserSettingsChanged");
  };

  tests[test]();
}

function pinToToolbar(shouldPinToToolbar, extension) {
  let newArea = shouldPinToToolbar
    ? CustomizableUI.AREA_NAVBAR
    : CustomizableUI.AREA_ADDONS;
  let newPosition = shouldPinToToolbar ? undefined : 0;
  let widget = getBrowserActionWidget(extension);
  CustomizableUI.addWidgetToArea(widget.id, newArea, newPosition);
}

async function loadExtension(extensionData) {
  let extension = ExtensionTestUtils.loadExtension(extensionData);
  extension.onMessage("pinToToolbar", ({ identifier, shouldPinToToolbar }) => {
    pinToToolbar(shouldPinToToolbar, extension);
    extension.sendMessage(identifier);
  });
  await extension.startup();
  return extension;
}

add_task(async function browserAction_onUserSettingsChanged() {
  let extensionData = {
    manifest: {
      manifest_version: 2,
      browser_action: {},
    },
    background: `(${background})('onUserSettingsChanged')`,
  };
  let extension = await loadExtension(extensionData);
  await extension.awaitFinish("onUserSettingsChanged");
  await extension.unload();
});

add_task(async function action_onUserSettingsChanged() {
  let extensionData = {
    manifest: {
      manifest_version: 3,
      action: {},
    },
    background: `(${background})('onUserSettingsChanged')`,
  };
  let extension = await loadExtension(extensionData);
  await extension.awaitFinish("onUserSettingsChanged");
  await extension.unload();
});

add_task(async function browserAction_onUserSettingsChanged_default_area() {
  for (let default_area of ["navbar", "tabstrip", "personaltoolbar"]) {
    info(`Testing with browser_action.default_area=${default_area}`);
    let extensionData = {
      manifest: {
        manifest_version: 2,
        browser_action: {
          default_area,
        },
      },
      background: `(${background})('default_area_onUserSettingsChanged')`,
    };
    let extension = await loadExtension(extensionData);
    await extension.awaitFinish("onUserSettingsChanged");
    await extension.unload();
  }
});

add_task(async function action_onUserSettingsChanged_default_area() {
  for (let default_area of ["navbar", "tabstrip", "personaltoolbar"]) {
    info(`Testing with browser_action.default_area=${default_area}`);
    let extensionData = {
      manifest: {
        manifest_version: 3,
        action: {
          default_area,
        },
      },
      background: `(${background})('default_area_onUserSettingsChanged')`,
    };
    let extension = await loadExtension(extensionData);
    await extension.awaitFinish("onUserSettingsChanged");
    await extension.unload();
  }
});
