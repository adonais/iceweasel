Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/components/passwordmgr/test/browser/browser_relay_utils.js",
  this
);

const TEST_URL_PATH = `https://example.org${DIRECTORY_PATH}form_basic_signup.html`;

add_task(
  async function test_site_on_denyList_does_not_show_Relay_to_signed_in_browser() {
    const sandbox = stubFxAccountsToSimulateSignedIn();
    // Set up denylist for "example.org"
    const rsSandbox = await stubRemoteSettingsDenyList([
      { domain: "example.org" },
    ]);
    for (const scenario of ["available", "offered", "enabled", "disabled"]) {
      await setupRelayScenario(scenario);
      await BrowserTestUtils.withNewTab(
        {
          gBrowser,
          url: TEST_URL_PATH,
        },
        async function (browser) {
          const popup = document.getElementById("PopupAutoComplete");
          await openACPopup(popup, browser, "#form-basic-username");

          const relayItem = getRelayItemFromACPopup(popup);
          Assert.ok(
            !relayItem,
            "Relay item SHOULD NOT be present in the autocomplete popup when the site is on the deny-list, even if the user is signed into the browser."
          );
        }
      );
    }
    sandbox.restore();
    rsSandbox.restore();
  }
);
