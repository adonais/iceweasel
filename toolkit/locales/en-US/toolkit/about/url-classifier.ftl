# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

url-classifier-title = URL Classifier Information
url-classifier-search-title = Search
url-classifier-search-result-title = Results
# Variables:
#   $uri (string) - URI of blocked page
url-classifier-search-result-uri = URI: { $uri }
# Variables:
#   $list (string) - List of tables where the page is blocked
url-classifier-search-result-list = List of tables: { $list }
url-classifier-search-input = URL
url-classifier-search-error-invalid-url = Invalid URL
url-classifier-search-error-no-features = No features selected
url-classifier-search-error-no-results = No entries found for URL
url-classifier-search-btn = Start searching
url-classifier-search-features = Features
url-classifier-search-listType = List type
url-classifier-provider-title = Provider
url-classifier-provider = Provider
url-classifier-provider-last-update-time = Last update time
url-classifier-provider-next-update-time = Next update time
url-classifier-provider-back-off-time = Back-off time
url-classifier-provider-last-update-status = Last update status
url-classifier-provider-update-btn = Update
url-classifier-cache-title = Cache
url-classifier-cache-refresh-btn = Refresh
url-classifier-cache-clear-btn = Clear
url-classifier-cache-table-name = Table name
url-classifier-cache-ncache-entries = Number of negative cache entries
url-classifier-cache-pcache-entries = Number of positive cache entries
url-classifier-cache-show-entries = Show entries
url-classifier-cache-entries = Cache Entries
url-classifier-cache-prefix = Prefix
url-classifier-cache-ncache-expiry = Negative cache expiry
url-classifier-cache-fullhash = Full hash
url-classifier-cache-pcache-expiry = Positive cache expiry

## The "Content Classifier" strings label a developer diagnostic tool in
## about:url-classifier. It lets a developer describe a hypothetical network
## request and ask the content classifier what it would decide about it (would
## the request be blocked, annotated as tracking, or matched by a given
## feature).

url-classifier-content-classifier-title = Content Classifier
# URL of the resource being tested, i.e. the thing that would be loaded
# (e.g. an image, script, or tracking pixel).
url-classifier-content-classifier-url = URL
# URL that loads the URL being tested (hence Loading URL)
# This is the URL of a frame within the document that initiates the request to load another URL
# (e.g. an iframe that is loading a tracking pixel)
url-classifier-content-classifier-loading-url = Loading URL
# Checkbox label to enable a Loading URL.
# When on, the developer can type a "Loading URL"; when off, no loading URL is sent.
url-classifier-content-classifier-loading-url-enabled = Enable loading URL
# URL of the topmost window (https://developer.mozilla.org/en-US/docs/Web/API/Window/top)
# Most often the site URL show in the address bar.
url-classifier-content-classifier-top-window-url = Top-window URL
# Checkbox label to enable a Top-window URL.
# When on, the developer can type a "Top-window URL"; when off, no top-window URL is sent.
url-classifier-content-classifier-top-window-url-enabled = Enable top-window URL
# Label for a dropdown choosing what type of resource is at the destination (the destination type),
# such as script, image, stylesheet, etc.
url-classifier-content-classifier-destination-type = Destination type
# Header for a group of on/off options (the checkboxes below) that modify how
# the hypothetical request is classified.
url-classifier-content-classifier-flags = Flags
# Header for the group of buttons that run a classification test. A "probe" here
# means running the classifier once and reporting what it would do.
url-classifier-content-classifier-probes = Probes
# Header for the area that shows the outcome of a probe.
url-classifier-content-classifier-results = Results
url-classifier-content-classifier-pbm = Private browsing
# Checkbox: force the request to be treated as third-party relative to the
# top-level page, regardless of the URLs entered above.
url-classifier-content-classifier-force-third-party = Force third-party to top frame
# Checkbox: classify the request as if it originated from an add-on that is not
# on Mozilla's recommended list.
url-classifier-content-classifier-non-recommended-addon = Non-recommended add-on
# Button: run the probe that reports whether the request would be blocked.
url-classifier-content-classifier-probe-blocking-btn = Probe blocking
# Button: run the probe that reports whether the request would be annotated
# (labeled) as tracking without being blocked.
url-classifier-content-classifier-probe-annotate-btn = Probe annotate
# Button: run the probe against a single classifier feature chosen in the
# adjacent dropdown.
url-classifier-content-classifier-probe-feature-btn = Probe feature
# Label for an expandable area showing the detailed per-feature output from the
# classification engine.
url-classifier-content-classifier-engine-details = Engine details
# Column header: the name of the classifier feature that produced the row.
url-classifier-content-classifier-col-feature = Feature
# Column header: whether the request matched this feature (true/false).
url-classifier-content-classifier-col-matched = Matched
# Column header: whether this feature matched an exception/allow-list entry that
# spares the request (true/false).
url-classifier-content-classifier-col-exception = Exception
# Column header: refers to the "important" syntax filter option giving it priority over other features.
# "Important" should not be translated as it refers to technical syntax.
url-classifier-content-classifier-col-important = Important
# Column header: the raw result code returned by the engine for this feature.
url-classifier-content-classifier-col-engine-result = Engine result
# Overall verdict shown when the request would be acted on (blocked or
# annotated): the classifier matched.
url-classifier-content-classifier-verdict-hit = Hit
# Overall verdict shown when the request is spared because it matched an
# exception rule.
url-classifier-content-classifier-verdict-exception = Exception
# Overall verdict shown when the classifier did not match the request at all.
url-classifier-content-classifier-verdict-miss = Miss
# Overall verdict shown when the probe could not run because of an error.
# Variables:
#   $code (string) - XPCOM error name (e.g. "NS_ERROR_MALFORMED_URI") for the failure that produced this verdict.
url-classifier-content-classifier-verdict-error-with-code = Error ({ $code })

##

url-classifier-debug-title = Debug
url-classifier-debug-module-btn = Set Log Modules
url-classifier-debug-file-btn = Set Log File
url-classifier-debug-js-log-chk = Set JS Log
url-classifier-debug-sb-modules = Safe Browsing log modules
url-classifier-debug-modules = Current log modules
url-classifier-debug-sbjs-modules = Safe Browsing JS log
url-classifier-debug-file = Current log file

url-classifier-trigger-update = Trigger Update
url-classifier-not-available = N/A
url-classifier-disable-sbjs-log = Disable Safe Browsing JS Log
url-classifier-enable-sbjs-log = Enable Safe Browsing JS Log
url-classifier-enabled = Enabled
url-classifier-disabled = Disabled
url-classifier-updating = updating
url-classifier-cannot-update = cannot update
url-classifier-success = success

## Variables
##   $error (string) - Error message

url-classifier-update-error = update error ({ $error })
url-classifier-download-error = download error ({ $error })
