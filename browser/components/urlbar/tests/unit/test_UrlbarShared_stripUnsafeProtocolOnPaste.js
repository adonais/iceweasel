/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests for UrlbarShared.stripUnsafeProtocolOnPaste(), which classifies the
// scheme with the URL parser so it can run in a content realm.

"use strict";

// The corners where the URL parser and Gecko's URI machinery could disagree:
// leading C0 controls and spaces, CR/LF/tab inside the scheme, casing,
// characters that aren't valid in a scheme, colons past the scheme, and
// strings the URL parser rejects while extractScheme() reads a scheme off them.
const INPUTS = [
  "",
  "   ",
  "javascript",
  "javascript:",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "javascript:javascript:alert(1)",
  "javascript:alert(':')",
  "javascript: alert(1)",
  "javascript:alert(1) ",
  "  javascript:alert(1)",
  "\njavascript:alert(1)",
  "\t \r\njavascript:alert(1)",
  "\x01\x1fjavascript:alert(1)",
  "java\nscript:alert(1)",
  "java\tscript:alert(1)",
  "j\ra\nv\ta\rs\nc\tr\ri\np\tt:alert(1)",
  "javascript\n:alert(1)",
  "java\x0bscript:alert(1)",
  "java script:alert(1)",
  "1javascript:alert(1)",
  "-javascript:alert(1)",
  "view-source:javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "http://example.com/",
  "https://example.com/#javascript:alert(1)",
  "not a url",
  "example.com",
  "éjavascript:alert(1)",
  "javascript://[/alert(1)",
  "javascript://a:99999/x",
];

// The same stripping driven by nsIIOService.extractScheme(), as the oracle.
function stripViaIOService(pasteData) {
  for (;;) {
    let scheme = "";
    try {
      scheme = Services.io.extractScheme(pasteData);
    } catch (ex) {
      // If it throws, this is not a javascript scheme.
    }
    if (scheme != "javascript") {
      break;
    }
    pasteData = pasteData.substring(pasteData.indexOf(":") + 1);
  }
  return pasteData;
}

// Whatever Gecko can turn into a URI is what could actually be loaded, so those
// are the strings that have to be classified like the URI machinery does. The
// URL parser is stricter about the rest -- `javascript://[` is a scheme to
// extractScheme() but not a URL to anyone -- and leaving those alone is safe
// precisely because no URI can be built from them either.
add_task(function test_matches_ioservice_for_loadable_uris() {
  for (let input of INPUTS) {
    let quoted = JSON.stringify(input);
    if (URL.canParse(input)) {
      Assert.equal(
        UrlbarShared.stripUnsafeProtocolOnPaste(input),
        stripViaIOService(input),
        `Same result as nsIIOService.extractScheme() for ${quoted}`
      );
    } else {
      Assert.throws(
        () => Services.io.newURI(input),
        /NS_ERROR_MALFORMED_URI/,
        `${quoted} is no URI either, so it can't be loaded`
      );
      Assert.equal(
        UrlbarShared.stripUnsafeProtocolOnPaste(input),
        input,
        `${quoted} is left alone`
      );
    }
  }
});

add_task(function test_expected_results() {
  const EXPECTED = {
    "javascript:alert(1)": "alert(1)",
    "JavaScript:alert(1)": "alert(1)",
    "javascript:javascript:alert(1)": "alert(1)",
    "javascript:alert(':')": "alert(':')",
    "java\nscript:alert(1)": "alert(1)",
    "  javascript:alert(1)": "alert(1)",
    "javascript:": "",
    "http://example.com/": "http://example.com/",
    "view-source:javascript:alert(1)": "view-source:javascript:alert(1)",
    "java script:alert(1)": "java script:alert(1)",
  };

  for (let [input, expected] of Object.entries(EXPECTED)) {
    Assert.equal(
      UrlbarShared.stripUnsafeProtocolOnPaste(input),
      expected,
      `Expected result for ${JSON.stringify(input)}`
    );
  }
});
