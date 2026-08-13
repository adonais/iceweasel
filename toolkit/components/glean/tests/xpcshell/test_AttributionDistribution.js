/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

add_setup(
  /* on Android FOG is set up through head.js */
  { skip_if: () => AppConstants.platform == "android" },
  function test_setup() {
    // FOG needs a profile directory to put its data in.
    do_get_profile();

    // We need to initialize it once, otherwise operations will be stuck in the pre-init queue.
    Services.fog.initializeFOG();
  }
);

add_task(function test_attribution_works() {
  let attr = Services.fog.testGetAttribution();
  const empty = {
    source: null,
    medium: null,
    campaign: null,
    term: null,
    content: null,
  };
  Assert.deepEqual(empty, attr, "Initial attribution should be empty.");

  Services.fog.updateAttribution("source", null, "campaign", null, "content");

  let expected = {
    source: "source",
    medium: null,
    campaign: "campaign",
    term: null,
    content: "content",
  };
  attr = Services.fog.testGetAttribution();
  Assert.deepEqual(attr, expected, "Must give what it got.");

  Services.fog.clearAttribution();
  attr = Services.fog.testGetAttribution();
  Assert.deepEqual(empty, attr, "Attribution should again be empty.");
});

add_task(function test_distribution_works() {
  let dist = Services.fog.testGetDistribution();
  const empty = { name: null };
  Assert.deepEqual(dist, empty, "Initial distribution should be empty.");

  Services.fog.updateDistribution("name");

  dist = Services.fog.testGetDistribution();
  Assert.deepEqual(dist, { name: "name" }, "Must give what it got.");

  Services.fog.clearDistribution();
  dist = Services.fog.testGetDistribution();
  Assert.deepEqual(dist, empty, "Distribution should be empty.");
});
