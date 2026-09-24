(toolkit-search-telemetry)=

# Search Service Telemetry

This document describes search telemetry recorded by Toolkit such as search
service telemetry and telemetry related to fetching search suggestions.

This document only covers Legacy telemetry, not Glean telemetry.
Glean metrics are self-documenting and can be looked up in the Glean dictionary.

Other important search-related telemetry is recorded by Firefox and is
documented in {doc}`/browser/search/telemetry` in the Firefox documentation.

## Legacy Telemetry

## Scalars

### browser.searchinit.secure_opensearch_engine_count

NOTE: This telemetry is no longer reported to legacy Telemetry. See changelog
below.

Records the number of secure (i.e., using https) OpenSearch search
engines a given user has installed.

Changelog
: Firefox 144

  : Legacy `browser.searchinit.secure_opensearch_engine_count` telemetry
    removed completely. (See bug 1984462)

### browser.searchinit.insecure_opensearch_engine_count

NOTE: This telemetry is no longer reported to legacy Telemetry. See changelog
below.

Records the number of insecure (i.e., using http) OpenSearch search
engines a given user has installed.

Changelog
: Firefox 144

  : Legacy `browser.searchinit.insecure_opensearch_engine_count` telemetry
    removed completely. (See bug 1984462)

### browser.searchinit.secure_opensearch_update_count

NOTE: This telemetry is no longer reported to legacy Telemetry. See changelog
below.

Records the number of OpenSearch search engines with secure updates
enabled (i.e., using https) a given user has installed.

Changelog
: Firefox 144

  : Legacy `browser.searchinit.secure_opensearch_update_count` telemetry
    removed completely. (See bug 1984462)

### browser.searchinit.insecure_opensearch_update_count

NOTE: This telemetry is no longer reported to legacy Telemetry. See changelog
below.

Records the number of OpenSearch search engines with insecure updates
enabled (i.e., using http) a given user has installed.

Changelog
: Firefox 144

  : Legacy `browser.searchinit.insecure_opensearch_update_count` telemetry
    removed completely. (See bug 1984462)

## Keyed Scalars

### browser.searchinit.engine_invalid_webextension

NOTE: This telemetry is no longer reported to legacy Telemetry. See changelog
below.

Records the WebExtension ID of a search engine where the saved search engine
settings do not match the WebExtension.

The keys are the WebExtension IDs. The values are integers:

1. Associated WebExtension is not installed.
2. Associated WebExtension is disabled.
3. The submission URL of the associated WebExtension is different to that of the saved settings.

Changelog
: Firefox 134

  : Legacy `browser.searchinit.engine_invalid_webextension` telemetry
    mirrored to Glean. (See bug 1927093)

  Firefox 139

  : Legacy `browser.searchinit.engine_invalid_webextension` telemetry
    removed completely. (See bug 1958170)

## Histograms

### Default Search Engine

Telemetry for the user's default search engine is currently reported via two
systems:

1. Legacy telemetry:
   [Fields are reported within the legacy telemetry environment](https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/data/environment.html#defaultsearchengine)
2. Glean:
   [Fields are documented in the Glean dictionary](https://dictionary.telemetry.mozilla.org/apps/firefox_desktop?search=search.engine).

## Glean Telemetry

[These search service fields are documented via Glean dictionary](https://dictionary.telemetry.mozilla.org/apps/firefox_desktop?search=tags%3A%22Firefox%20%3A%3A%20Search%22).

### search.service.startup_time

The time duration it takes for the search service to start up.

### search.service.initializationStatus

A labeled counter for the type of initialization statuses that can occur on
start up. Labels include: `failedSettings`, `failedFetchEngines`,
`failedLoadEngines`, `failedLoadSettingsAddonManager`, `settingsCorrupt`,
`success`.

A counter for initialization successes on start up.
