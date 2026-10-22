"use strict";

// Bug 2074019: A first-party load of a listed host must receive first-party
// classification flags without a content blocking event, and must never be
// cancelled. The antitracking redirect, navigation and popup heuristics read
// these flags off the top-level document channel, so this mirrors
// url-classifier, whose annotation features run on every channel while its
// blocking features only consider third-party ones.

const LISTED_DOMAIN = "https://example.com/";
const LISTED_TOP_PAGE = LISTED_DOMAIN + TEST_PATH + "page.html";
const LISTED_IMAGE_PREFIX =
  LISTED_DOMAIN +
  "browser/toolkit/components/antitracking/test/browser/raptor.jpg";

// Publishes example.com on the trackers list and enables the trackers engine
// for both cancel and annotate, so a wrongly ungated cancel pass would show up
// as a blocked top-level load.
async function setupTrackersEngine() {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "trackers",
      name: "disconnect-tracker-base",
      rules: ["||example.com^"],
    },
  ]);
  await pushEnginePrefs({ protection: "trackers", annotation: "trackers" });
  return { client, records };
}

function getDocumentClassification(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    let channel = content.docShell.currentDocumentChannel.QueryInterface(
      Ci.nsIClassifiedChannel
    );
    return {
      documentURI: content.document.documentURI,
      firstParty: channel.firstPartyClassificationFlags,
      thirdParty: channel.thirdPartyClassificationFlags,
    };
  });
}

// Resolves with the classification flags of the parent-process channel whose
// URL starts with urlPrefix, once that channel stops.
function waitForChannelClassification(urlPrefix) {
  return new Promise(resolve => {
    let observer = subject => {
      let channel = subject.QueryInterface(Ci.nsIHttpChannel);
      if (!channel.URI.spec.startsWith(urlPrefix)) {
        return;
      }
      Services.obs.removeObserver(observer, "http-on-stop-request");
      let classified = channel.QueryInterface(Ci.nsIClassifiedChannel);
      resolve({
        firstParty: classified.firstPartyClassificationFlags,
        thirdParty: classified.thirdPartyClassificationFlags,
      });
    };
    Services.obs.addObserver(observer, "http-on-stop-request");
  });
}

add_task(async function test_top_level_document_gets_first_party_flags() {
  let { client, records } = await setupTrackersEngine();
  await syncAndWaitForLists(client, records);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    LISTED_TOP_PAGE
  );
  let browser = tab.linkedBrowser;

  let classification = await getDocumentClassification(browser);
  is(
    classification.documentURI,
    LISTED_TOP_PAGE,
    "Top-level load of a listed host is not cancelled"
  );
  ok(
    classification.firstParty & Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING,
    "Document channel carries the first-party tracking flag"
  );
  is(
    classification.thirdParty,
    0,
    "Document channel carries no third-party flags"
  );

  let log = JSON.parse(await browser.getContentBlockingLog());
  ok(
    !log[LISTED_DOMAIN.replace(/\/$/, "")],
    "A first-party load produces no content blocking event"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_same_site_subresource_gets_first_party_flags() {
  let { client, records } = await setupTrackersEngine();
  await syncAndWaitForLists(client, records);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    LISTED_TOP_PAGE
  );
  let browser = tab.linkedBrowser;

  let classified = waitForChannelClassification(LISTED_IMAGE_PREFIX);
  let loaded = await loadThirdPartyImage(browser, LISTED_DOMAIN);
  ok(loaded, "Same-site image from a listed host loads");

  let classification = await classified;
  ok(
    classification.firstParty & Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING,
    "Same-site image channel carries the first-party tracking flag"
  );
  is(
    classification.thirdParty,
    0,
    "Same-site image channel carries no third-party flags"
  );

  BrowserTestUtils.removeTab(tab);
});
