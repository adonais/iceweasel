"use strict";

// Bug 2079661: url-classifier's fingerprinting features skip passive content
// (image and media loads). The content classifier fingerprinters engine must
// do the same in both the cancel and the annotate pass, while still
// classifying other loads, including imageset ones that url-classifier does
// not treat as passive.

const FINGERPRINTER = TEST_ANNOTATED_3RD_PARTY_DOMAIN;
const ANTITRACKING_PATH =
  "browser/toolkit/components/antitracking/test/browser/";

async function loadThirdParty(browser, kind, domain) {
  let url;
  switch (kind) {
    case "imageset":
      url = domain + ANTITRACKING_PATH + "raptor.jpg?" + Math.random();
      break;
    case "media":
      url = domain + ANTITRACKING_PATH + "short.mp4?" + Math.random();
      break;
  }
  return SpecialPowers.spawn(browser, [kind, url], async (aKind, aUrl) => {
    let element;
    let loadEvent = "load";
    if (aKind == "imageset") {
      element = new content.Image();
      element.srcset = `${aUrl} 1x`;
    } else {
      element = content.document.createElement("video");
      element.preload = "auto";
      element.src = aUrl;
      loadEvent = "loadedmetadata";
    }
    return new content.Promise(resolve => {
      element.addEventListener(loadEvent, () => resolve(true));
      element.addEventListener("error", () => resolve(false));
    });
  });
}

async function setupFingerprinters(engines) {
  let client = getRSClient();
  let records = await populateMultipleRS(client.db, [
    {
      id: "fingerprinters",
      name: "disconnect-fingerprinters-base",
      rules: [`||${new URL(FINGERPRINTER).host}^`],
    },
  ]);
  await pushEnginePrefs(engines);
  let tab = await openTestTab();
  await syncAndWaitForLists(client, records);
  return tab;
}

add_task(async function test_passive_content_not_blocked() {
  let tab = await setupFingerprinters({ protection: "fingerprinters" });
  let browser = tab.linkedBrowser;

  await assertImageLoaded(
    browser,
    FINGERPRINTER,
    "An image from a fingerprinter loads"
  );
  ok(
    await loadThirdParty(browser, "media", FINGERPRINTER),
    "A media load from a fingerprinter loads"
  );
  ok(
    !(await loadThirdParty(browser, "imageset", FINGERPRINTER)),
    "An imageset load from a fingerprinter is blocked"
  );
  await assertScriptBlocked(
    browser,
    FINGERPRINTER,
    "A script from a fingerprinter is blocked"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_passive_content_not_annotated() {
  let tab = await setupFingerprinters({ annotation: "fingerprinters" });
  let browser = tab.linkedBrowser;

  await assertImageLoaded(
    browser,
    FINGERPRINTER,
    "An image from a fingerprinter loads"
  );
  await assertLacksBlockingState(
    browser,
    FINGERPRINTER,
    Ci.nsIWebProgressListener.STATE_LOADED_FINGERPRINTING_CONTENT,
    "An image from a fingerprinter is not annotated"
  );

  await assertScriptLoaded(
    browser,
    FINGERPRINTER,
    "A script from a fingerprinter loads with annotation only"
  );
  await assertHasBlockingState(
    browser,
    FINGERPRINTER,
    Ci.nsIWebProgressListener.STATE_LOADED_FINGERPRINTING_CONTENT,
    "A script from a fingerprinter is annotated"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
