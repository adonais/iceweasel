/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { buildViewerURL, getViewerBaseURL } = AITab;

const VIEWER_PREF = "browser.smartwindow.aitab.viewerURL";

registerCleanupFunction(() => Services.prefs.clearUserPref(VIEWER_PREF));

add_task(function test_buildViewerURL_puts_config_in_hash() {
  const surface = {
    components: [{ id: "root", component: "Page", children: [] }],
    dataModel: {},
  };
  const url = buildViewerURL("https://viewer.example/app", surface);
  const parsed = new URL(url);

  Assert.equal(parsed.origin, "https://viewer.example", "host is unchanged");
  Assert.equal(parsed.pathname, "/app", "path is unchanged");
  Assert.equal(parsed.search, "", "config is NOT in the query string");
  Assert.deepEqual(
    JSON.parse(decodeURIComponent(parsed.hash.slice(1))),
    surface,
    "the surface round-trips through the URL hash fragment"
  );
});

add_task(function test_buildViewerURL_strips_existing_hash() {
  const url = buildViewerURL("https://viewer.example/app#stale", {
    components: [],
  });
  Assert.ok(!url.includes("#stale"), "an existing hash on the base is dropped");
});

add_task(function test_getViewerBaseURL_requires_https() {
  Services.prefs.clearUserPref(VIEWER_PREF);
  Assert.equal(getViewerBaseURL(), null, "empty pref yields null");

  Services.prefs.setStringPref(VIEWER_PREF, "http://insecure.example/app");
  Assert.equal(getViewerBaseURL(), null, "non-https pref yields null");

  Services.prefs.setStringPref(VIEWER_PREF, "not a url");
  Assert.equal(getViewerBaseURL(), null, "unparseable pref yields null");

  Services.prefs.setStringPref(VIEWER_PREF, "https://viewer.example/app#x");
  Assert.equal(
    getViewerBaseURL(),
    "https://viewer.example/app",
    "an https pref is returned with any hash stripped"
  );
});
