"use strict";

const BASE = "https://example.com/browser/dom/base/test/";
const TARGET = `${BASE}file_pageload_prefetch_target.sjs`;
// Unique per run, so repeated runs (e.g. --verify) share neither the HTTP
// cache entry nor the server's hit counter.
const RUN = Date.now();

function targetURL(token, { noStore = false, slowMs = 0, status = 0 } = {}) {
  // A fresh URL per trial, so trials cannot share a cache entry.
  return (
    `${TARGET}?v=${token}-${RUN}` +
    (noStore ? "&nostore=1" : "") +
    (slowMs ? `&slow=${slowMs}` : "") +
    (status ? `&status=${status}` : "")
  );
}

function sourceURL(file, target) {
  return `${BASE}${file}?target=${encodeURIComponent(target)}`;
}

// How many times the server has been asked for the token's target.
async function hitCount(token) {
  const response = await fetch(`${TARGET}?count=${token}-${RUN}`);
  return Number(await response.text());
}

function targetChannelObserved(topic, target) {
  return TestUtils.topicObserved(
    topic,
    subject => subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === target
  );
}

// Purges unreferenced entries from the memory cache, as memory pressure or the
// cache's own expired-entry sweep would.
async function purgeMemoryCache() {
  const purged = TestUtils.topicObserved("cacheservice:purge-memory-pools");
  Services.cache2.purgeFromMemory(Ci.nsICacheStorageService.PURGE_EVERYTHING);
  await purged;
}

// Navigates source -> target and returns the target's deliveryType.
// `prefetch` says what to wait for before navigating: "complete" for the
// prefetch response to have arrived, "started" for the request to have gone
// out but not returned, or "none" when the source page has no rules.
// `method` "POST" submits a form from the source page instead of loading the
// target from the browser. `purge` purges the memory cache before navigating.
async function deliveryTypeAfterNavigating(
  source,
  target,
  prefetch,
  { method = "GET", purge = false } = {}
) {
  // Register before the source page loads: an immediate prefetch can finish
  // before the source page fires load.
  const ready =
    prefetch == "complete"
      ? targetChannelObserved("http-on-stop-request", target)
      : prefetch == "started"
        ? targetChannelObserved("http-on-modify-request", target)
        : Promise.resolve();

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: source,
    waitForLoad: true,
  });
  await ready;
  if (purge) {
    await purgeMemoryCache();
  }

  const loaded = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    target
  );
  if (method == "POST") {
    await SpecialPowers.spawn(tab.linkedBrowser, [target], url => {
      const form = content.document.createElement("form");
      form.method = "POST";
      form.action = url;
      content.document.body.appendChild(form);
      form.submit();
    });
  } else {
    BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
  }
  await loaded;

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
      "complete"
    ),
    "navigational-prefetch",
    "A navigation served from a prefetch reports deliveryType."
  );
  Assert.equal(await hitCount("hit"), 1, "The target was fetched once.");
});

// A no-store prefetch still serves the navigation it was activated for.
add_task(async function test_nostore_prefetch_served_from_cache() {
  const target = targetURL("nostore", { noStore: true });
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      "complete"
    ),
    "navigational-prefetch",
    "A navigation served from a no-store prefetch reports deliveryType."
  );
});

// The prefetch record keeps its no-store cache entry alive, so a purge of the
// memory cache before the navigation does not lose it.
add_task(async function test_nostore_prefetch_survives_cache_purge() {
  const target = targetURL("purge", { noStore: true });
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      "complete",
      { purge: true }
    ),
    "navigational-prefetch",
    "The navigation is served from the prefetch after a cache purge."
  );
  Assert.equal(await hitCount("purge"), 1, "The target was fetched once.");
});

add_task(async function test_navigation_without_prefetch() {
  const target = targetURL("miss");
  Assert.equal(
    await deliveryTypeAfterNavigating(
      // Same flow, but the source page carries no speculation rules.
      sourceURL("file_pageload_prefetch_plain.html", target),
      target,
      "none"
    ),
    "",
    "A navigation with no prefetch reports no deliveryType."
  );
});

// Prefetch records only serve top-level navigations without a request body:
// https://wicg.github.io/nav-speculation/prefetch.html#create-a-navigation-request
add_task(async function test_post_navigation_does_not_wait_for_prefetch() {
  const target = targetURL("post", { slowMs: 1500 });
  const first = Promise.race([
    targetChannelObserved("http-on-stop-request", target).then(
      () => "prefetch response"
    ),
    TestUtils.topicObserved("http-on-modify-request", subject => {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      return channel.URI.spec === target && channel.requestMethod == "POST";
    }).then(() => "POST request"),
  ]);
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      "started",
      { method: "POST" }
    ),
    "",
    "A form POST to a prefetched URL reports no deliveryType."
  );
  Assert.equal(
    await first,
    "POST request",
    "The POST went out without waiting for the in-flight prefetch."
  );
  Assert.equal(await hitCount("post"), 2, "The POST reached the server.");
});

add_task(async function test_subframe_navigation_not_served_from_prefetch() {
  const target = targetURL("subframe");
  const prefetched = targetChannelObserved("http-on-stop-request", target);
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: sourceURL("file_pageload_prefetch_source.html", target),
    waitForLoad: true,
  });
  await prefetched;

  const deliveryType = await SpecialPowers.spawn(
    tab.linkedBrowser,
    [target],
    async url => {
      const frame = content.document.createElement("iframe");
      await new Promise(resolve => {
        frame.onload = resolve;
        frame.src = url;
        content.document.body.appendChild(frame);
      });
      return frame.contentWindow.performance.getEntriesByType("navigation")[0]
        .deliveryType;
    }
  );
  // The subframe may be a plain HTTP cache hit ("cache"), but never a
  // prefetch activation.
  Assert.notEqual(
    deliveryType,
    "navigational-prefetch",
    "A subframe navigation to a URL prefetched by its parent is not served from the prefetch."
  );
  BrowserTestUtils.removeTab(tab);
});

// "Wait for a matching prefetch record": navigating while the prefetch is
// still in flight waits for it instead of fetching the target again.
add_task(async function test_navigation_waits_for_in_flight_prefetch() {
  const target = targetURL("inflight", { slowMs: 1500 });
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      "started"
    ),
    "navigational-prefetch",
    "A navigation that waited for an in-flight prefetch is served from it."
  );
  Assert.equal(
    await hitCount("inflight"),
    1,
    "The navigation reused the in-flight prefetch instead of refetching."
  );
});

// A prefetch that fails while a navigation waits for it, here because the
// server rate-limits it with a 429, releases the navigation at once rather
// than after dom.speculation_rules.wait_timeout_ms.
add_task(async function test_navigation_proceeds_when_prefetch_fails() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.wait_timeout_ms", 30000]],
  });
  const target = targetURL("failed", { slowMs: 1000, status: 429 });
  const prefetchStarted = targetChannelObserved(
    "http-on-modify-request",
    target
  );
  const first = Promise.race([
    targetChannelObserved("http-on-stop-request", target).then(
      () => "prefetch failed"
    ),
    TestUtils.topicObserved("http-on-modify-request", subject => {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      return (
        channel.URI.spec === target &&
        channel.loadInfo.externalContentPolicyType ==
          Ci.nsIContentPolicy.TYPE_DOCUMENT
      );
    }).then(() => "navigation request"),
  ]);

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: sourceURL("file_pageload_prefetch_source.html", target),
    waitForLoad: true,
  });
  // Navigate as soon as the prefetch request is out; its 429 is 1 s away.
  await prefetchStarted;
  const start = Date.now();
  const loaded = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    target
  );
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
  Assert.equal(
    await first,
    "prefetch failed",
    "The navigation waited: its request only went out after the prefetch failed."
  );
  await loaded;
  Assert.less(
    Date.now() - start,
    5000,
    "The failure released the navigation long before the timeout."
  );
  Assert.equal(
    await hitCount("failed"),
    2,
    "The navigation fetched the target itself after the prefetch failed."
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// A navigation parked on an in-flight prefetch is superseded by another
// navigation; when the prefetch later resolves it must not disturb the load
// that replaced it.
add_task(async function test_superseded_navigation_waiting_for_prefetch() {
  const target = targetURL("superseded", { slowMs: 1500 });
  // Slow, so it is still in flight when the parked navigation's wait ends.
  const other = targetURL("superseded-other", { slowMs: 4000 });
  const source = sourceURL("file_pageload_prefetch_source.html", target);
  const started = targetChannelObserved("http-on-modify-request", target);
  const prefetched = targetChannelObserved("http-on-stop-request", target);
  const otherStopped = targetChannelObserved("http-on-stop-request", other);
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: source,
    waitForLoad: true,
  });
  await started;

  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, other);
  await prefetched;

  Assert.equal(
    await hitCount("superseded"),
    1,
    "The superseded navigation never fetched the target itself."
  );

  // The superseding load must still be tracked, so stopping cancels it.
  tab.linkedBrowser.stop();
  const [channel] = await otherStopped;
  Assert.equal(
    channel.QueryInterface(Ci.nsIHttpChannel).status,
    Cr.NS_BINDING_ABORTED,
    "Stop cancelled the superseding navigation."
  );
  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    source,
    "The source page is still the current document."
  );

  const plain = sourceURL("file_pageload_prefetch_plain.html", other);
  const plainLoaded = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    plain
  );
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, plain);
  await plainLoaded;
  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    plain,
    "A later navigation still completes."
  );
  BrowserTestUtils.removeTab(tab);
});

// Once the wait times out the navigation falls back to a normal fetch.
add_task(async function test_navigation_stops_waiting_after_timeout() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.wait_timeout_ms", 100]],
  });
  const target = targetURL("timeout", { slowMs: 1500 });
  Assert.equal(
    await deliveryTypeAfterNavigating(
      sourceURL("file_pageload_prefetch_source.html", target),
      target,
      "started"
    ),
    "",
    "A navigation that gave up waiting is not served from the prefetch."
  );
  Assert.equal(
    await hitCount("timeout"),
    2,
    "The navigation fetched the target itself after the timeout."
  );
  await SpecialPowers.popPrefEnv();
});
