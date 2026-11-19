"use strict";

const BASE = "https://example.com/browser/dom/base/test/";
const NAVIGATIONAL_PREFETCH = 1 << 1;
const NAVIGATIONAL_PREFETCH_ELIGIBLE = 1 << 2;

let gCollectPageloadEvents = true;
let gSubmittedPageloadEvents = [];

function keepSubmittedPageloadEvents() {
  if (!gCollectPageloadEvents) {
    return;
  }
  GleanPings.pageload.testBeforeNextSubmit(() => {
    if (!gCollectPageloadEvents) {
      return;
    }
    gSubmittedPageloadEvents.push(
      ...(Glean.perf.pageLoad.testGetValue() ?? [])
    );
    Promise.resolve().then(keepSubmittedPageloadEvents);
  });
}

async function resetPageloadTelemetry() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
  gSubmittedPageloadEvents = [];
  keepSubmittedPageloadEvents();
}

async function waitForPageloadEvent() {
  let records;
  await TestUtils.waitForCondition(() => {
    records = [
      ...gSubmittedPageloadEvents,
      ...(Glean.perf.pageLoad.testGetValue() ?? []),
    ];
    return records.length;
  }, "A pageload event was recorded.");
  Assert.equal(records.length, 1, "Only the expected document was reported.");
  return records;
}

function documentFeatures(records) {
  return records.map(r => parseInt(r.extra.document_features || "0", 10));
}

function targetURL(token, { noStore = false, large = false } = {}) {
  // A fresh URL per navigation, so tests cannot share a cache entry.
  return (
    `${BASE}file_pageload_prefetch_target.sjs?v=${token}-${Date.now()}` +
    (noStore ? "&nostore=1" : "") +
    (large ? "&large=1" : "")
  );
}

function sourceURL(file, target) {
  return `${BASE}${file}?target=${encodeURIComponent(target)}`;
}

// Navigates source -> target; returns the target's pageload event.
async function pageloadEventFor(source, target, expectPrefetch) {
  // The prefetch can finish before the source page fires load.
  const prefetched = expectPrefetch
    ? TestUtils.topicObserved(
        "http-on-stop-request",
        subject => subject.QueryInterface(Ci.nsIHttpChannel).URI.spec === target
      )
    : Promise.resolve();

  await resetPageloadTelemetry();

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: source,
    waitForLoad: true,
  });
  try {
    await prefetched;
    if (!expectPrefetch) {
      await TestUtils.waitForTick();
    }

    const loaded = BrowserTestUtils.browserLoaded(
      tab.linkedBrowser,
      false,
      target
    );
    BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
    await loaded;

    // Wait for the source event before clearing it, leaving only the target's.
    await waitForPageloadEvent();
    await resetPageloadTelemetry();
  } finally {
    await BrowserTestUtils.removeTab(tab);
  }

  return waitForPageloadEvent();
}

async function withPageloadEvent(name, trial, check) {
  check(await trial(name));
}

add_setup(async function () {
  registerCleanupFunction(() => {
    gCollectPageloadEvents = false;
    GleanPings.pageload.testBeforeNextSubmit(() => {});
    gSubmittedPageloadEvents = [];
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.speculation_rules.enabled", true],
      ["dom.pageload_event.testing.always_send_normal", true],
    ],
  });
});

add_task(async function test_navigation_served_from_prefetch() {
  if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
    Assert.ok(true, "Test skipped in artifact builds. See bug 1836686.");
    return;
  }

  await withPageloadEvent(
    "hit",
    token => {
      const target = targetURL(token);
      return pageloadEventFor(
        sourceURL("file_pageload_prefetch_source.html", target),
        target,
        true
      );
    },
    records =>
      Assert.ok(
        documentFeatures(records).some(
          f => f & NAVIGATIONAL_PREFETCH && f & NAVIGATIONAL_PREFETCH_ELIGIBLE
        ),
        "A navigation served from a prefetch is both eligible and served."
      )
  );
});

// Bug 2070841 skips cache validation for an activated record, so even a
// no-store response serves the navigation it was prefetched for.
add_task(async function test_nostore_prefetch_served_from_cache() {
  if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
    Assert.ok(true, "Test skipped in artifact builds. See bug 1836686.");
    return;
  }

  await withPageloadEvent(
    "nostore",
    token => {
      const target = targetURL(token, { noStore: true });
      return pageloadEventFor(
        sourceURL("file_pageload_prefetch_source.html", target),
        target,
        true
      );
    },
    records => {
      const features = documentFeatures(records);
      Assert.ok(
        features.some(f => f & NAVIGATIONAL_PREFETCH_ELIGIBLE),
        "A no-store prefetch is eligible."
      );
      Assert.ok(
        features.some(f => f & NAVIGATIONAL_PREFETCH),
        "A navigation served from a no-store prefetch is marked served."
      );
    }
  );
});

add_task(async function test_canceled_prefetch_is_still_eligible() {
  if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
    Assert.ok(true, "Test skipped in artifact builds. See bug 1836686.");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.max_body_bytes", 64]],
  });

  try {
    await withPageloadEvent(
      "canceled",
      token => {
        const target = targetURL(token, { large: true });
        return pageloadEventFor(
          sourceURL("file_pageload_prefetch_source.html", target),
          target,
          true
        );
      },
      records => {
        const features = documentFeatures(records);
        Assert.ok(
          features.some(f => f & NAVIGATIONAL_PREFETCH_ELIGIBLE),
          "A candidate stays eligible after a treatment-side fetch failure."
        );
        Assert.ok(
          features.every(f => !(f & NAVIGATIONAL_PREFETCH)),
          "A canceled prefetch is not marked served."
        );
      }
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

// The experiment control branch: rules are processed and the candidate is
// recorded, but nothing is fetched, so the navigation is eligible and not
// served.
add_task(async function test_dry_run_is_eligible_but_not_served() {
  if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
    Assert.ok(true, "Test skipped in artifact builds. See bug 1836686.");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.prefetch.dry_run", true]],
  });

  let sawPrefetchRequest = false;
  try {
    await withPageloadEvent(
      "dryrun",
      async token => {
        const target = targetURL(token);
        const observer = subject => {
          const channel = subject.QueryInterface(Ci.nsIHttpChannel);
          if (channel.URI.spec !== target) {
            return;
          }
          try {
            sawPrefetchRequest ||= channel
              .getRequestHeader("Sec-Purpose")
              .includes("prefetch");
          } catch (e) {
            // Navigation requests do not carry Sec-Purpose.
          }
        };
        Services.obs.addObserver(observer, "http-on-modify-request");
        try {
          return await pageloadEventFor(
            sourceURL("file_pageload_prefetch_source.html", target),
            target,
            false
          );
        } finally {
          Services.obs.removeObserver(observer, "http-on-modify-request");
        }
      },
      records => {
        const features = documentFeatures(records);
        Assert.ok(
          features.some(f => f & NAVIGATIONAL_PREFETCH_ELIGIBLE),
          "A dry-run candidate still marks the navigation eligible."
        );
        Assert.ok(
          features.every(f => !(f & NAVIGATIONAL_PREFETCH)),
          "A dry-run candidate is never served."
        );
        Assert.ok(!sawPrefetchRequest, "Dry run does not issue a request.");
      }
    );
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_navigation_without_prefetch() {
  if (Services.prefs.getBoolPref("telemetry.fog.artifact_build", false)) {
    Assert.ok(true, "Test skipped in artifact builds. See bug 1836686.");
    return;
  }

  await withPageloadEvent(
    "miss",
    token => {
      const target = targetURL(token);
      // Same flow, but the source page carries no speculation rules.
      return pageloadEventFor(
        sourceURL("file_pageload_prefetch_plain.html", target),
        target,
        false
      );
    },
    records =>
      Assert.ok(
        documentFeatures(records).every(
          f => !(f & (NAVIGATIONAL_PREFETCH | NAVIGATIONAL_PREFETCH_ELIGIBLE))
        ),
        "A navigation with no rules is neither eligible nor served."
      )
  );
});
