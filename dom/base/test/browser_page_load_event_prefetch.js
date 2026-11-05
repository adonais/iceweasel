"use strict";

const BASE = "https://example.com/browser/dom/base/test/";
const NAVIGATIONAL_PREFETCH = 1 << 1;
const NAVIGATIONAL_PREFETCH_ELIGIBLE = 1 << 2;

// Sampling keeps every load on nightly and early beta but only one in three
// later, minus the roughly one in ten routed to the domain ping instead.
const MAX_ATTEMPTS = 40;

function documentFeatures(records) {
  return records.map(r => parseInt(r.extra.document_features || "0", 10));
}

function targetURL(token, { noStore = false, large = false } = {}) {
  // A fresh URL per attempt, so attempts cannot share a cache entry.
  return (
    `${BASE}file_pageload_prefetch_target.sjs?v=${token}-${Date.now()}` +
    (noStore ? "&nostore=1" : "") +
    (large ? "&large=1" : "")
  );
}

function sourceURL(file, target) {
  return `${BASE}${file}?target=${encodeURIComponent(target)}`;
}

// Navigates source -> target; returns the target's pageload event or null.
async function pageloadEventFor(source, target, expectPrefetch) {
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
  if (!expectPrefetch) {
    await TestUtils.waitForTick();
  }

  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, target);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, target);

  // Drop the source document's event, leaving only the target's.
  Services.fog.testResetFOG();
  BrowserTestUtils.removeTab(tab);

  // Submitted from Document::Destroy(), so it lands after the tab is gone.
  let records = null;
  await TestUtils.waitForCondition(() => {
    records = Glean.perf.pageLoad.testGetValue();
    return records && records.length;
  }, "a pageload event was recorded").catch(() => {});
  return records && records.length ? records : null;
}

// Runs `trial` until sampling produces an event, then checks it.
async function withPageloadEvent(name, trial, check) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const records = await trial(`${name}${attempt}`);
    if (!records) {
      info(
        `${name} attempt ${attempt}: no pageload event (sampling); retrying.`
      );
      continue;
    }
    check(records);
    return;
  }
  Assert.ok(
    false,
    `${name}: no pageload event after ${MAX_ATTEMPTS} attempts.`
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.speculation_rules.enabled", true]],
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
