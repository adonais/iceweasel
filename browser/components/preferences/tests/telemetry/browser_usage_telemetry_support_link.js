/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

let resetTelemetry = async () => {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
};

registerCleanupFunction(async () => {
  await resetTelemetry();
});

async function assertSupportLinkInteraction(linkId, expectedCount) {
  await TestUtils.waitForCondition(
    () =>
      Glean.browserUiInteraction.preferencesPaneGeneral?.[
        linkId
      ]?.testGetValue() == expectedCount,
    "wait for metric to be recorded"
  );
  Assert.equal(
    Glean.browserUiInteraction.preferencesPaneGeneral[linkId].testGetValue(),
    expectedCount,
    `support link click should have been counted ${expectedCount} time(s)`
  );
}

async function createSettingWithSupportLink(doc, win, settingId, config) {
  win.Preferences.addSetting({
    id: settingId,
    get: () => true,
    set: () => {},
  });

  let testGroup = doc.createElement("setting-group");
  testGroup.setAttribute("data-category", "paneGeneral");
  testGroup.config = { items: [config] };
  testGroup.getSetting = win.Preferences.getSetting.bind(win.Preferences);
  // doc.body.append(testGroup);
  doc.getElementById("mainPrefPane").append(testGroup);
  testGroup.scrollIntoView();

  await testGroup.updateComplete;
  await new Promise(r => win.requestAnimationFrame(r));

  return doc.getElementById(settingId);
}

// Finn Note
async function activateSupportLinkAndVerifyTelemetry(
  supportLink,
  linkId,
  win,
  useKeyboard = false
) {
  console.log("INNER STEP 1");
  let linkClickPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  console.log("INNER STEP 2");

  if (useKeyboard) {
    supportLink.focus();
    EventUtils.synthesizeKey("KEY_Enter", {}, win);
  } else {
    // debugger;
    EventUtils.synthesizeMouseAtCenter(supportLink, {}, win);
    // EventUtils.synthesizeMouse(supportLink, {}, win);
  }
  console.log("INNER STEP 3");

  let tab = await linkClickPromise;
  Assert.ok(tab, "support link should open a new tab");
  BrowserTestUtils.removeTab(tab);

  console.log("INNER STEP 4");
  let snapshot = TelemetryTestUtils.getProcessScalars("parent", true, true);
  console.log("INNER STEP 5");
  TelemetryTestUtils.assertKeyedScalar(
    snapshot,
    "browser.ui.interaction.preferences_paneGeneral",
    linkId,
    1
  );

  await assertSupportLinkInteraction(linkId, 1);
}

// Finn Note: This is the culprit
add_task(async function testSupportLinkTelemetry() {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await resetTelemetry();
  console.log("STEP 1");

  const doc = gBrowser.contentDocument;
  const win = doc.ownerGlobal;
  const SETTING_ID = "testSupportLinkSetting";
  const LINK_ID = `${SETTING_ID}Link`;

  let settingControl = await createSettingWithSupportLink(
    doc,
    win,
    SETTING_ID,
    {
      id: SETTING_ID,
      l10nId: "forms-suggest-passwords",
      supportPage: "how-generate-secure-password-firefox",
    }
  );
  console.log("STEP 3");
  Assert.ok(settingControl, "setting control should exist");

  let supportLink = settingControl.shadowRoot.querySelector(
    "a[is='moz-support-link']"
  );
  Assert.ok(supportLink, "support link should exist in shadow DOM");

  info("clicking support link");
  // Finn Note: This is the await where we're failing
  await activateSupportLinkAndVerifyTelemetry(supportLink, LINK_ID, win);
  console.log("STEP 4");

  await resetTelemetry();

  console.log("STEP 5");

  info("activating support link with keyboard");
  await activateSupportLinkAndVerifyTelemetry(supportLink, LINK_ID, win, true);

  console.log("STEP 6");

  gBrowser.removeCurrentTab();
});

add_task(async function testSupportLinkWithIdOverride() {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await resetTelemetry();

  const doc = gBrowser.contentDocument;
  const win = doc.ownerGlobal;
  const SETTING_ID = "testSupportLinkWithIdSetting";
  const LINK_ID = "customSupportLinkId";

  let settingControl = await createSettingWithSupportLink(
    doc,
    win,
    SETTING_ID,
    {
      id: SETTING_ID,
      l10nId: "forms-suggest-passwords",
      options: [
        {
          id: LINK_ID,
          supportPage: "how-generate-secure-password-firefox",
          control: "a",
          slot: "support-link",
          controlAttrs: {
            is: "moz-support-link",
          },
        },
      ],
    }
  );
  Assert.ok(settingControl, "setting control should exist");

  let supportLink = settingControl.querySelector("a[is='moz-support-link']");
  Assert.ok(supportLink, "support link should exist");

  info("clicking support link with custom id");
  await activateSupportLinkAndVerifyTelemetry(supportLink, LINK_ID, win);

  await resetTelemetry();

  info("activating support link with custom id using keyboard");
  await activateSupportLinkAndVerifyTelemetry(supportLink, LINK_ID, win, true);

  gBrowser.removeCurrentTab();
});
