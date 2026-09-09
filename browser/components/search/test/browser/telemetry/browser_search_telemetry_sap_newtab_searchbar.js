/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The New Tab search bar is its own search access point, so its searches have to
// be recorded under it rather than dropped as an unknown source.

"use strict";

const SOURCE = "newtab_searchbar";

add_setup(async function () {
  resetTelemetry();
  registerCleanupFunction(resetTelemetry);
});

add_task(async function recordsUnderItsOwnSap() {
  let engine = await SearchService.getDefault();
  BrowserSearchTelemetry.recordSearch(
    gBrowser.selectedBrowser,
    engine,
    SOURCE,
    { isSuggestion: true }
  );

  let events = Glean.sap.counts.testGetValue();
  Assert.equal(events?.length, 1, "One SAP event was recorded");
  Assert.equal(events[0].extra.source, SOURCE, "It carries the new source");

  Assert.equal(
    Glean.browserEngagementNavigation.newtabSearchbar.search_suggestion.testGetValue(),
    1,
    "The search was counted under the source's own navigation metric"
  );

  Assert.equal(
    Glean.sap.deprecatedCounts[
      `${engine.telemetryId}.newtab-searchbar`
    ].testGetValue(),
    1,
    "The legacy per-engine count uses the source's legacy name"
  );
});
