/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const { WebsiteFilter } = ChromeUtils.importESModule(
  "resource:///modules/policies/WebsiteFilter.sys.mjs"
);

add_task(async function setup() {
  await setupPolicyEngineWithJson({
    policies: {
      WebsiteFilter: {
        Block: ["*://accounts.firefox.com/*"],
      },
    },
  });
});

add_task(async function test_host_normalization() {
  ok(
    !WebsiteFilter.isAllowed("https://accounts.firefox.com/"),
    "Bare host should be blocked"
  );
  ok(
    !WebsiteFilter.isAllowed("https://accounts.firefox.com./"),
    "Trailing-dot host should be blocked"
  );
  ok(
    !WebsiteFilter.isAllowed("https://accounts.firefox.com.../"),
    "Multiple trailing dots should be blocked"
  );
  ok(
    !WebsiteFilter.isAllowed("https://accounts.firefox.com%2e/"),
    "Percent-encoded trailing dot should be blocked"
  );
  ok(
    !WebsiteFilter.isAllowed("https://accounts.firefox.com。/"),
    "Ideographic full-stop (folds to a trailing dot) should be blocked"
  );
  ok(
    WebsiteFilter.isAllowed("https://example.org./"),
    "Unrelated trailing-dot host should not be blocked"
  );
  ok(
    !WebsiteFilter.isAllowed("not a parseable url"),
    "Unparseable URL should be blocked"
  );
});

add_task(async function test_reader_mode() {
  function shouldLoadDocument(url) {
    return WebsiteFilter.shouldLoad(Services.io.newURI(url), {
      externalContentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
    });
  }

  const BLOCKED = encodeURIComponent("https://accounts.firefox.com/signin");
  const ALLOWED = encodeURIComponent("https://example.org/article");

  equal(
    shouldLoadDocument(`about:reader?e=1&url=${BLOCKED}`),
    Ci.nsIContentPolicy.REJECT_POLICY,
    "Blocked article should be found after another query parameter"
  );
  equal(
    shouldLoadDocument(`about:reader?e=1&url=${ALLOWED}`),
    Ci.nsIContentPolicy.ACCEPT,
    "Reader Mode URL for an allowed article should not be blocked"
  );
  equal(
    shouldLoadDocument("about:reader?e=1"),
    Ci.nsIContentPolicy.REJECT_POLICY,
    "Reader Mode URL without an article should be blocked"
  );
});
