Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/components/passwordmgr/test/browser/browser_relay_utils.js",
  this
);

const TEST_URL_PATH = `https://example.org${DIRECTORY_PATH}form_basic_signup.html`;

async function openRelayAC(browser) {
  // In rare cases, especially in chaos mode in verify tests, some events creep in.
  // Clear them out before we start.
  Services.fog.testResetFOG();
  const popup = document.getElementById("PopupAutoComplete");
  await openACPopup(popup, browser, "#form-basic-username");
  const firstRichlistitem = document.querySelector("richlistitem");
  const popupItem = firstRichlistitem.querySelector(
    "autocomplete-row-item"
  ).value;

  Assert.ok(
    gRelayACOptionsTitles.some(title => title.value === popupItem),
    "AC Popup has an item Relay option shown in popup"
  );

  const promiseHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.firstChild.getItemAtIndex(0).click();
  await promiseHidden;
}

// Bug 1832782: On OSX opt verify mode, the test exceeds the default timeout.
requestLongerTimeout(2);

add_setup(async function () {
  await setUpMockRelayServer();

  Services.fog.testResetFOG();

  stubFxAccountsToSimulateSignedIn();
});

add_task(async function test_pref_toggle() {
  Services.fog.testResetFOG();
  await setupRelayScenario("available");
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "about:preferences#privacy",
    },
    async _browser => {
      const relayIntegrationCheckbox = Services.prefs.getBoolPref(
        "browser.settings-redesign.enabled",
        false
      )
        ? content.document.querySelector("moz-checkbox#relayIntegration")
        : content.document.querySelector("checkbox#relayIntegration");
      relayIntegrationCheckbox.click();
      if (relayIntegrationCheckbox.updateComplete) {
        await relayIntegrationCheckbox.updateComplete;
      }
      relayIntegrationCheckbox.click();
      Assert.equal(
        Glean.relayIntegration.disabledPrefChange.testGetValue().length,
        1,
        "One disabled event"
      );
      Assert.equal(
        Glean.relayIntegration.enabledPrefChange.testGetValue().length,
        1,
        "One enabled event"
      );
    }
  );
});

add_task(async function test_popup_option_optin_enabled() {
  Services.fog.testResetFOG();
  await setupRelayScenario("available");
  setupServerScenario();
  const rsSandbox = await stubRemoteSettingsAllowList();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);
      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );
      const notificationHidden = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "hidden"
      );

      await notificationShown;

      notificationPopup
        .querySelector("moz-button.popup-notification-primary-button")
        .click();

      await Promise.all([
        notificationHidden,
        BrowserTestUtils.waitForEvent(ConfirmationHint._panel, "popuphidden"),
        TestUtils.waitForPrefChange("signon.firefoxRelay.feature"),
      ]);

      Assert.greaterOrEqual(
        Glean.relayIntegration.shownOfferRelay.testGetValue().length,
        1,
        "At least one shown event"
      );
      Assert.equal(
        Glean.relayIntegration.shownOfferRelay.testGetValue()[0].extra.scenario,
        "SignUpFormScenario",
        "Shown event is for sign-up form"
      );
      Assert.equal(
        Glean.relayIntegration.clickedOfferRelay.testGetValue().length,
        1,
        "One clicked event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedOfferRelay.testGetValue()[0].extra
          .scenario,
        "SignUpFormScenario",
        "Clicked event is for sign-up form"
      );
      Assert.equal(
        Glean.relayIntegration.shownOptInPanel.testGetValue().length,
        1,
        "One opt-in panel shown event"
      );
      Assert.equal(
        Glean.relayIntegration.enabledOptInPanel.testGetValue().length,
        1,
        "One opt-in panel enabled event"
      );
      Services.fog.testResetFOG();

      // Retrigger AC popup
      await SpecialPowers.spawn(browser, [], async function () {
        const usernameInput = content.document.querySelector(
          "#form-basic-username"
        );
        usernameInput.blur();
        usernameInput.focus();
      });

      await TestUtils.waitForCondition(() => {
        return (
          Glean.relayIntegration.shownFillUsername.testGetValue()?.length == 1
        );
      }, "Waiting for the username to fill.");
      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue()[0].extra
          .error_code,
        "0",
        "Error code is 0"
      );
    }
  );
  rsSandbox.restore();
});

add_task(async function test_popup_option_optin_postponed() {
  Services.fog.testResetFOG();
  await setupRelayScenario("available");
  const rsSandbox = await stubRemoteSettingsAllowList();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);
      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );
      const notificationHidden = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "hidden"
      );

      await notificationShown;

      notificationPopup
        .querySelector("moz-button.popup-notification-secondary-button")
        .click();

      await notificationHidden;

      Assert.equal(
        Glean.relayIntegration.shownOfferRelay.testGetValue().length,
        1,
        "One offer shown event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedOfferRelay.testGetValue().length,
        1,
        "One offer clicked event"
      );
      Assert.equal(
        Glean.relayIntegration.shownOptInPanel.testGetValue().length,
        1,
        "One opt-in shown event"
      );
      Assert.equal(
        Glean.relayIntegration.postponedOptInPanel.testGetValue().length,
        1,
        "One opt-in postponed event"
      );
    }
  );
  rsSandbox.restore();
});

add_task(async function test_popup_option_optin_disabled() {
  Services.fog.testResetFOG();
  await setupRelayScenario("available");
  const rsSandbox = await stubRemoteSettingsAllowList();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);
      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );
      const notificationHidden = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "hidden"
      );

      await notificationShown;
      const menupopup = notificationPopup.querySelector("menupopup");
      const menuitem = menupopup.querySelector("menuitem");

      menuitem.click();
      await notificationHidden;

      Assert.equal(
        Glean.relayIntegration.shownOfferRelay.testGetValue().length,
        1,
        "One offer shown event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedOfferRelay.testGetValue().length,
        1,
        "One offer clicked event"
      );
      Assert.equal(
        Glean.relayIntegration.shownOptInPanel.testGetValue().length,
        1,
        "One panel shown event"
      );
      Assert.equal(
        Glean.relayIntegration.disabledOptInPanel.testGetValue().length,
        1,
        "One panel disabled event"
      );
    }
  );
  rsSandbox.restore();
});

add_task(async function test_popup_option_fillusername() {
  Services.fog.testResetFOG();
  await setupRelayScenario("enabled");
  const rsAllowSandbox = await stubRemoteSettingsAllowList();
  const rsDenySandbox = await stubRemoteSettingsDenyList();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);
      await BrowserTestUtils.waitForEvent(
        ConfirmationHint._panel,
        "popuphidden"
      );
      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue().length,
        1,
        "One fill show event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedFillUsername.testGetValue().length,
        1,
        "One fill clicked event"
      );
    }
  );
  rsAllowSandbox.restore();
  rsDenySandbox.restore();
});

add_task(async function test_fillusername_free_tier_limit() {
  Services.fog.testResetFOG();
  await setupRelayScenario("enabled");
  setupServerScenario("free_tier_limit");
  const rsSandbox = await stubRemoteSettingsAllowList();

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);

      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );
      const notificationHidden = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "hidden"
      );

      await notificationShown;
      notificationPopup.querySelector(".reusable-relay-masks button").click();
      await notificationHidden;

      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue().length,
        2,
        "Two fill shown events"
      );
      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue()[1].extra
          .error_code,
        "free_tier_limit",
        "Second shown event hit free tier limit"
      );
      Assert.equal(
        Glean.relayIntegration.clickedFillUsername.testGetValue().length,
        1,
        "One fill clicked event"
      );
      Assert.equal(
        Glean.relayIntegration.shownReusePanel.testGetValue().length,
        1,
        "One show reuse event"
      );
      Assert.equal(
        Glean.relayIntegration.reuseMaskReusePanel.testGetValue().length,
        1,
        "One reuse mask event"
      );

      await SpecialPowers.spawn(browser, [], async function () {
        const username = content.document.getElementById("form-basic-username");
        Assert.equal(
          username.value,
          "email1@mozilla.com",
          "Username field should be filled with the first mask"
        );
      });
    }
  );
  rsSandbox.restore();
});

add_task(async function test_fillusername_error() {
  Services.fog.testResetFOG();
  await setupRelayScenario("enabled");
  setupServerScenario("unknown_error");
  const rsSandbox = await stubRemoteSettingsAllowList();

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);

      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );

      await notificationShown;
      Assert.equal(
        notificationPopup.querySelector("popupnotification").id,
        "relay-integration-error-notification",
        "Error message should be displayed"
      );

      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue().length,
        1,
        "One show fill event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedFillUsername.testGetValue().length,
        1,
        "One clicked fill event"
      );
      Assert.equal(
        Glean.relayIntegration.shownReusePanel.testGetValue().length,
        1,
        "One reuse shown event"
      );
      Assert.equal(
        Glean.relayIntegration.shownReusePanel.testGetValue()[0].extra
          .error_code,
        "408",
        "Reuse shown with error code 408"
      );
    }
  );
  rsSandbox.restore();
});

add_task(async function test_auth_token_error() {
  Services.fog.testResetFOG();
  setupRelayScenario("enabled");
  const rsSandbox = await stubRemoteSettingsAllowList();
  gFxAccounts.getOAuthToken.restore();
  const oauthTokenStub = sinon.stub(gFxAccounts, "getOAuthToken").throws();
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_URL_PATH,
    },
    async function (browser) {
      await openRelayAC(browser);
      const notificationPopup = document.getElementById("notification-popup");
      const notificationShown = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "shown"
      );
      const notificationHidden = BrowserTestUtils.waitForPopupEvent(
        notificationPopup,
        "hidden"
      );

      await notificationShown;

      notificationPopup
        .querySelector("moz-button.popup-notification-primary-button")
        .click();

      await notificationHidden;

      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue().length,
        2,
        "Two fill shown events"
      );
      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue()[0].extra
          .error_code,
        "0",
        "First error code 0"
      );
      Assert.equal(
        Glean.relayIntegration.shownFillUsername.testGetValue()[1].extra
          .error_code,
        "418",
        "Second error code 418"
      );
      Assert.equal(
        Glean.relayIntegration.clickedFillUsername.testGetValue().length,
        1,
        "One clicked event"
      );
      Assert.equal(
        Glean.relayIntegration.clickedFillUsername.testGetValue()[0].extra
          .error_code,
        "0",
        "Clicked error_code 0"
      );
    }
  );
  rsSandbox.restore();
  oauthTokenStub.restore();
});
