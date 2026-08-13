"use strict";

const ABOUT_URL = "about:url-classifier";

add_setup(async function ensure_service_initialized() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
    ],
  });
  Cc["@mozilla.org/content-classifier-service;1"].getService(
    Ci.nsIContentClassifierService
  );
});

async function openAboutUrlClassifier() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, ABOUT_URL);
  registerCleanupFunction(() => {
    if (tab) {
      BrowserTestUtils.removeTab(tab);
    }
  });
  return tab;
}

function fillProbeForm(tab, { url, feature } = {}) {
  let d = tab.linkedBrowser.contentDocument;
  if (url !== undefined) {
    d.getElementById("content-classifier-url").value = url;
  }
  if (feature !== undefined) {
    d.getElementById("content-classifier-feature").value = feature;
  }
}

// Simulate a plausible third-party subresource request: the probed URL is
// loaded by a page on a different site. Without a source/top-window URL,
// the classifier's TP rules match on empty context and produce false
// misses.
function setThirdPartyContext(tab, topWindowUrl = "https://example.net/") {
  let d = tab.linkedBrowser.contentDocument;
  d.getElementById("content-classifier-loading-url-enabled").click();
  d.getElementById("content-classifier-loading-url").value = topWindowUrl;
  d.getElementById("content-classifier-top-window-url-enabled").click();
  d.getElementById("content-classifier-top-window-url").value = topWindowUrl;
}

function clickButton(tab, id) {
  tab.linkedBrowser.contentDocument.getElementById(id).click();
}

async function clickProbe(tab, id) {
  let doc = tab.linkedBrowser.contentDocument;
  let verdict = doc.getElementById("content-classifier-verdict");
  verdict.removeAttribute("data-l10n-id");
  doc.getElementById(id).click();
  await TestUtils.waitForCondition(
    () => verdict.hasAttribute("data-l10n-id"),
    `verdict updated after ${id}`
  );
}

function verdictL10nId(tab) {
  return tab.linkedBrowser.contentDocument
    .getElementById("content-classifier-verdict")
    .getAttribute("data-l10n-id");
}

function resultRows(tab) {
  return Array.from(
    tab.linkedBrowser.contentDocument.querySelectorAll(
      "#content-classifier-results-body tr"
    )
  ).map(tr => {
    let cells = tr.querySelectorAll("td");
    return {
      featureName: cells[0].textContent,
      matched: cells[1].textContent === "true",
      exception: cells[2].textContent === "true",
      important: cells[3].textContent === "true",
      engineResult: cells[4].textContent,
    };
  });
}

// Blocking-side probes share one pref env and one open tab so we exercise
// the ContentClassifier UI without pushing / popping engine prefs between
// probes (which races the async engine rebuild).
add_task(async function test_blocking_probes() {
  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", true],
      [
        "privacy.trackingprotection.content.protection.test_list_urls",
        BLOCK_LIST_URL,
      ],
      ["privacy.trackingprotection.content.protection.engines", "test_block"],
      ["privacy.trackingprotection.content.annotation.enabled", false],
      ["privacy.trackingprotection.content.annotation.test_list_urls", ""],
    ],
  });

  let warmupTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.net/browser/toolkit/components/content-classifier/test/browser/page.html"
  );
  await listsLoaded;
  BrowserTestUtils.removeTab(warmupTab);

  let tab = await openAboutUrlClassifier();
  let section =
    tab.linkedBrowser.contentDocument.getElementById("content-classifier");
  isnot(
    section.style.display,
    "none",
    "Content Classifier section is visible when protection is enabled"
  );

  let select = tab.linkedBrowser.contentDocument.getElementById(
    "content-classifier-feature"
  );
  Assert.greater(select.options.length, 0, "Feature dropdown is populated");
  ok(
    Array.from(select.options).some(o => o.value === "test_block"),
    "Feature dropdown includes the test_block feature"
  );

  setThirdPartyContext(tab);

  info("probeBlocking on example.org should hit");
  fillProbeForm(tab, { url: "https://example.org/foo" });
  await clickProbe(tab, "content-classifier-probe-blocking");
  is(
    verdictL10nId(tab),
    "url-classifier-content-classifier-verdict-hit",
    "Hit verdict shown for example.org"
  );
  let hitRow = resultRows(tab).find(
    r => r.featureName === "test_block" && r.matched
  );
  ok(hitRow, "test_block reports matched=true for example.org");

  info("probeBlocking on example.net should miss");
  fillProbeForm(tab, { url: "https://example.net/foo" });
  await clickProbe(tab, "content-classifier-probe-blocking");
  is(
    verdictL10nId(tab),
    "url-classifier-content-classifier-verdict-miss",
    "Miss verdict shown for non-listed URL"
  );
  ok(
    resultRows(tab).every(r => !r.matched),
    "No engine reports matched=true on a Miss"
  );

  info("probeFeature returns a single result row");
  fillProbeForm(tab, {
    url: "https://example.org/foo",
    feature: "test_block",
  });
  await clickProbe(tab, "content-classifier-probe-feature");
  is(
    verdictL10nId(tab),
    "url-classifier-content-classifier-verdict-hit",
    "probeFeature returns Hit verdict for test_block on example.org"
  );
  let rows = resultRows(tab);
  is(rows.length, 1, "probeFeature renders exactly one row");
  is(rows[0].featureName, "test_block", "Row is for the selected feature");

  info("Invalid URL yields the error verdict");
  fillProbeForm(tab, { url: "not a url" });
  await clickProbe(tab, "content-classifier-probe-blocking");
  is(
    verdictL10nId(tab),
    "url-classifier-content-classifier-verdict-error-with-code",
    "Probe with an invalid URL surfaces the error verdict"
  );
  is(resultRows(tab).length, 0, "Results body is cleared on error");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_annotate_probe() {
  let listsLoaded = TestUtils.topicObserved(LISTS_LOADED_TOPIC);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.testing", true],
      ["privacy.trackingprotection.content.protection.enabled", false],
      ["privacy.trackingprotection.content.protection.test_list_urls", ""],
      ["privacy.trackingprotection.content.annotation.enabled", true],
      [
        "privacy.trackingprotection.content.annotation.test_list_urls",
        ANNOTATE_LIST_URL,
      ],
      [
        "privacy.trackingprotection.content.annotation.engines",
        "test_annotate",
      ],
    ],
  });

  let warmupTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.net/browser/toolkit/components/content-classifier/test/browser/page.html"
  );
  await listsLoaded;
  BrowserTestUtils.removeTab(warmupTab);

  let tab = await openAboutUrlClassifier();
  setThirdPartyContext(tab);
  fillProbeForm(tab, { url: "https://example.com/foo" });
  await clickProbe(tab, "content-classifier-probe-annotate");
  is(
    verdictL10nId(tab),
    "url-classifier-content-classifier-verdict-hit",
    "probeAnnotate returns Hit verdict for example.com"
  );
  let hitRow = resultRows(tab).find(
    r => r.featureName === "test_annotate" && r.matched
  );
  ok(hitRow, "test_annotate reports matched=true for example.com");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_section_hidden_when_prefs_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.trackingprotection.content.protection.enabled", false],
      ["privacy.trackingprotection.content.annotation.enabled", false],
    ],
  });

  let tab = await openAboutUrlClassifier();
  let section =
    tab.linkedBrowser.contentDocument.getElementById("content-classifier");
  is(
    section.style.display,
    "none",
    "Content Classifier section is hidden when both prefs are disabled"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_url_checkboxes_toggle_input_disabled() {
  // Force protection enabled - the previous section-hidden task pops its
  // env but SpecialPowers cleanup can race with the tab open below, and
  // the tab must be opened with the pref enabled or the section (and
  // its checkboxes) render with zero bounds.
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.trackingprotection.content.protection.enabled", true]],
  });
  let tab = await openAboutUrlClassifier();
  let d = tab.linkedBrowser.contentDocument;
  isnot(
    d.getElementById("content-classifier").style.display,
    "none",
    "Content Classifier section is visible for the checkbox test"
  );

  for (let [checkboxId, inputId] of [
    [
      "content-classifier-loading-url-enabled",
      "content-classifier-loading-url",
    ],
    [
      "content-classifier-top-window-url-enabled",
      "content-classifier-top-window-url",
    ],
  ]) {
    let cb = d.getElementById(checkboxId);
    let input = d.getElementById(inputId);
    ok(
      input.disabled,
      `${inputId} starts disabled when ${checkboxId} is unchecked`
    );
    // cb.click() toggles the checkbox and fires the native change event.
    cb.click();
    ok(!input.disabled, `${inputId} is enabled after checking ${checkboxId}`);
    cb.click();
    ok(
      input.disabled,
      `${inputId} is disabled again after unchecking ${checkboxId}`
    );
  }

  BrowserTestUtils.removeTab(tab);
});
