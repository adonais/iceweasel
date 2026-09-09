/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that network markers identify Speculation Rules prefetches, both the
 * speculative fetch itself and the navigation that is later served from it.
 */

add_task(async function test_network_markers_prefetch() {
  await ProfilerTestUtils.assertProfilerInactive();

  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.enabled", true]],
  });

  const prefetchedUrl = `${BASE_URL_HTTPS}simple.html?prefetched=${Math.random()}`;
  const rulesUrl =
    `${BASE_URL_HTTPS}speculation_rules_prefetch.html` +
    `?target=${encodeURIComponent(prefetchedUrl)}`;

  await ProfilerTestUtils.startProfilerForMarkerTests();

  // The prefetch runs in the parent process and can finish before the rules
  // page fires load, so start observing before the tab opens.
  const prefetchStopped = TestUtils.topicObserved(
    "http-on-stop-request",
    subject =>
      subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === prefetchedUrl
  );

  await BrowserTestUtils.withNewTab(rulesUrl, async contentBrowser => {
    await prefetchStopped;

    BrowserTestUtils.startLoadingURIString(contentBrowser, prefetchedUrl);
    await BrowserTestUtils.browserLoaded(contentBrowser, false, prefetchedUrl);

    const contentPid = await SpecialPowers.spawn(
      contentBrowser,
      [],
      () => Services.appinfo.processID
    );

    const { parentThread, contentThread } =
      await stopProfilerNowAndGetThreads(contentPid);

    const stopMarkersFor = thread =>
      ProfilerTestUtils.getInflatedNetworkMarkers(thread).filter(
        marker =>
          marker.data.URI === prefetchedUrl &&
          marker.data.status === "STATUS_STOP"
      );

    const parentMarkers = stopMarkersFor(parentThread);
    info(JSON.stringify(parentMarkers, null, 2));

    // The speculative fetch and the navigation that consumes it share a URL,
    // so they are told apart by the fields under test.
    const prefetch = parentMarkers.find(marker => marker.data.secPurpose);
    const activation = parentMarkers.find(marker => marker.data.deliveryType);
    Assert.ok(prefetch, "The speculative fetch produced a network marker.");
    Assert.ok(activation, "The activated navigation produced a marker.");
    if (!prefetch || !activation) {
      return;
    }

    Assert.objectContains(prefetch.data, {
      secPurpose: "prefetch",
      cache: "Missed",
    });
    Assert.ok(
      !("deliveryType" in prefetch.data),
      "The speculative fetch is not itself a prefetch activation."
    );

    Assert.objectContains(activation.data, {
      deliveryType: "navigational-prefetch",
      cache: "Hit",
    });
    Assert.ok(
      !("secPurpose" in activation.data),
      "The activated navigation is not itself a prefetch."
    );

    // The flag travels to the content process on the load info, so the
    // content-side markers for the same navigation carry it too.
    const contentMarkers = stopMarkersFor(contentThread);
    info(JSON.stringify(contentMarkers, null, 2));

    Assert.equal(
      contentMarkers.length,
      1,
      "The content process saw the activated navigation."
    );
    Assert.objectContains(contentMarkers[0]?.data ?? {}, {
      deliveryType: "navigational-prefetch",
    });
  });
});
