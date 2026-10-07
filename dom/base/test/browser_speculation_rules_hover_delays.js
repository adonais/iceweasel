"use strict";

const BASE = "https://example.com/browser/dom/base/test/";

const EAGER_DELAY_MS = 60000;
const MODERATE_DELAY_MS = 10;

function targetURL(token) {
  return `${BASE}file_pageload_prefetch_target.sjs?v=${token}`;
}

function sourceURL(target, eagerness) {
  const params = new URLSearchParams({ target, eagerness });
  return `${BASE}file_speculation_rules_hover_source.html?${params}`;
}

// Hovers the link on a source page carrying a rule of the given eagerness and
// returns how long the prefetch of the target took to be issued.
async function prefetchDelayAfterHover(eagerness) {
  const target = targetURL(eagerness);
  const prefetched = TestUtils.topicObserved(
    "http-on-modify-request",
    subject => {
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      return (
        channel.URI.spec === target &&
        channel.getRequestHeader("Sec-Purpose") === "prefetch"
      );
    }
  );

  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: sourceURL(target, eagerness),
    waitForLoad: true,
  });

  const start = performance.now();
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#link",
    { type: "mousemove" },
    tab.linkedBrowser
  );
  await prefetched;
  const elapsed = performance.now() - start;

  BrowserTestUtils.removeTab(tab);
  return elapsed;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.speculation_rules.enabled", true],
      ["dom.speculation_rules.eager_hover_delay_ms", EAGER_DELAY_MS],
      ["dom.speculation_rules.moderate_hover_delay_ms", MODERATE_DELAY_MS],
    ],
  });
});

add_task(async function test_eager_rule_fires_at_shorter_moderate_delay() {
  const elapsed = await prefetchDelayAfterHover("eager");
  Assert.less(
    elapsed,
    EAGER_DELAY_MS,
    "An eager rule is prefetched once the shorter moderate delay has passed."
  );
});

add_task(async function test_moderate_rule_still_fires() {
  const elapsed = await prefetchDelayAfterHover("moderate");
  Assert.less(
    elapsed,
    EAGER_DELAY_MS,
    "A moderate rule is prefetched after the moderate delay."
  );
});
