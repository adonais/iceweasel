/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { buildViewerURL } = AITab;

add_task(function test_buildViewerURL_names_the_stored_page() {
  Assert.equal(
    buildViewerURL("hotels_in_lisbon"),
    "about:smartpage?page=hotels_in_lisbon",
    "the viewer link names the stored page rather than carrying its surface"
  );
});
