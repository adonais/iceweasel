"use strict";

var gTestTab;
var gContentAPI;

add_task(setup_UITourTest);

add_UITour_task(async function () {
  ok(
    !gBrowser.selectedBrowser.currentURI.spec.startsWith("about:reader"),
    "Should not be in reader mode at start of test."
  );
  await gContentAPI.toggleReaderMode();
  await TestUtils.waitForCondition(
    () => gBrowser.selectedBrowser.currentURI.spec.startsWith("about:reader"),
    "Should be in reader mode"
  );
  ok(
    gBrowser.selectedBrowser.currentURI.spec.startsWith("about:reader"),
    "Should be in reader mode now."
  );
});
