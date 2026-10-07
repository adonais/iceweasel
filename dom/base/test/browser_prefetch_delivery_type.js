"use strict";

const BASE = "https://example.com/browser/dom/base/test/";

function targetURL(token, { noStore = false } = {}) {
  // A fresh URL per trial, so trials cannot share a cache entry.
  return (
    `${BASE}file_pageload_prefetch_target.sjs?v=${token}` +
    (noStore ? "&nostore=1" : "")
  );
}

function sourceURL(file, target) {
  return `${BASE}${file}?target=${encodeURIComponent(target)}`;
}

// Navigates source -> target and returns the target's deliveryType.
async function deliveryTypeAfterNavigating(source, target, expectPrefetch) {
  // The prefetch can finish before the source page fires load.
  const prefetched = expectPrefetch
    ? TestUtils.topicObserved(
        "http-on-stop-request",
        subject => subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === target
      )
    : Promise.resolve();

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: source,
    waitForLoad: true,
  });
  await prefetched;

  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, target);

  const deliveryType = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => content.performance.getEntriesByType("navigation")[0].deliveryType
  );

  BrowserTestUtils.removeTab(tab);
  return deliveryType;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.speculation_rules.enabled", true],
      // Off by default until "cache" is implemented too (bug 1914120).
      ["dom.performance.deliverytype.enabled", true],
    ],
  });
});

add_task(async function test_navigation_served_from_prefetch() {
  const target = targetURL("hit");
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      true
    ),
    "navigational-prefetch",
    "A navigation served from a prefetch reports deliveryType."
  );
});

// A no-store target is prefetched and matches, but still comes from the network.
add_task(async function test_matched_prefetch_not_served_from_cache() {
  const target = targetURL("nostore", { noStore: true });
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      true
    ),
    "",
    "A matched prefetch that did not serve the navigation reports no deliveryType."
  );
});

add_task(async function test_navigation_without_prefetch() {
  const target = targetURL("miss");
  Assert.equal(
    await deliveryTypeAfterNavigating(
      // Same flow, but the source page carries no speculation rules.
      sourceURL("file_pageload_prefetch_plain.html", target),
      target,
      false
    ),
    "",
    "A navigation with no prefetch reports no deliveryType."
  );
});
