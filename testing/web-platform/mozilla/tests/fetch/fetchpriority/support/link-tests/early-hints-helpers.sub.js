"use strict";

const RESOURCES_PATH = "/loading/early-hints/resources";

// Mozilla-specific fetchpriority tests report their results back to the
// fetchpriority test runner (which opened this page) via postMessage. That
// requires navigating this window in place so the eventual test page keeps the
// runner as its `opener`. The shared WPT helper
// (loading/early-hints/resources/early-hints-helpers.sub.js) now opens a popup
// instead, which breaks the opener chain, so these tests use their own navigation helper.
function navigateToTestWithEarlyHints(test_url, preloads, exclude_preloads_from_ok_response) {
    const params = new URLSearchParams();
    params.set("test_url", test_url);
    params.set("exclude_preloads_from_ok_response",
               (!!exclude_preloads_from_ok_response).toString());
    for (const preload of preloads) {
        params.append("preloads", JSON.stringify(preload));
    }
    const url = RESOURCES_PATH + "/early-hints-test-loader.h2.py?" + params.toString();

    // Overrides WPT helper behavior.
    window.location.replace(new URL(url, window.location));
}
