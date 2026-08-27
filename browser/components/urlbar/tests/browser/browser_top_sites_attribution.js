/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that picking a Top Site whose payload has sendAttributionRequest sends
// a partner attribution request and records a click.

ChromeUtils.defineESModuleGetters(this, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  PartnerLinkAttribution: "resource:///modules/PartnerLinkAttribution.sys.mjs",
  TopSites: "resource:///modules/topsites/TopSites.sys.mjs",
});

const TEST_URL = "https://example.com/attribution";
const CAMPAIGN_ID = "test_campaign";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.partnerlink.campaign.topsites", CAMPAIGN_ID]],
  });
});

/**
 * @param {Window} win
 * @param {boolean} sendAttributionRequest
 *   The value to set on the stubbed Top Site.
 * @returns {Promise<object>}
 *   The sinon stub of PartnerLinkAttribution.makeRequest.
 */
async function pickTopSite(win, sendAttributionRequest) {
  let sandbox = sinon.createSandbox();
  let sites = [{ url: TEST_URL, title: "Attribution", sendAttributionRequest }];
  sandbox.stub(AboutNewTab, "getTopSites").returns(sites);
  sandbox.stub(TopSites, "getSites").resolves(sites);
  let makeRequest = sandbox.stub(PartnerLinkAttribution, "makeRequest");

  let urlbar = win.gURLBar;
  urlbar.value = "";
  await UrlbarTestUtils.promisePopupOpen(win, () => {
    EventUtils.synthesizeMouseAtCenter(urlbar.inputField, {}, win);
  });
  await UrlbarTestUtils.promiseSearchComplete(win);
  Assert.equal(UrlbarTestUtils.getResultCount(win), 1, "One Top Site result");

  let row = await UrlbarTestUtils.waitForAutocompleteResultAt(win, 0);
  let stopped = BrowserTestUtils.waitForDocLoadAndStopIt(
    TEST_URL,
    win.gBrowser.selectedBrowser
  );
  await UrlbarTestUtils.promisePopupClose(win, () => {
    EventUtils.synthesizeMouseAtCenter(row, {}, win);
  });
  await stopped;

  sandbox.restore();
  return makeRequest;
}

add_task(async function test_attributionRequest() {
  Services.fog.testResetFOG();
  let makeRequest = await pickTopSite(window, true);
  Assert.ok(makeRequest.calledOnce, "makeRequest was called once");
  Assert.deepEqual(
    makeRequest.firstCall.args[0],
    {
      targetURL: TEST_URL,
      source: "urlbar",
      campaignID: CAMPAIGN_ID,
    },
    "makeRequest got the picked URL, the SAP name and the campaign ID"
  );
  Assert.equal(
    Glean.contextualServicesTopsites.click.urlbar_1.testGetValue(),
    1,
    "A click was recorded for the first row"
  );
});

add_task(async function test_noAttributionRequest() {
  Services.fog.testResetFOG();
  let makeRequest = await pickTopSite(window, false);
  Assert.ok(makeRequest.notCalled, "makeRequest was not called");
  Assert.equal(
    Glean.contextualServicesTopsites.click.urlbar_1.testGetValue(),
    null,
    "No click was recorded"
  );
});

add_task(async function test_privateWindow() {
  Services.fog.testResetFOG();
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let makeRequest = await pickTopSite(win, true);
  Assert.ok(makeRequest.calledOnce, "makeRequest was called once");
  Assert.equal(
    Glean.contextualServicesTopsites.click.urlbar_1.testGetValue(),
    null,
    "No click was recorded in a private window"
  );
  await BrowserTestUtils.closeWindow(win);
});
