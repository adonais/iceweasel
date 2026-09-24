/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Test whether entries with adapterMatch ANY are matched against either the
// primary or the secondary adapter.
// Uses test_gfxBlocklist_AdapterMatch.json

// Performs the initial setup
async function run_test() {
  var gfxInfo = Cc["@mozilla.org/gfx/info;1"].getService(Ci.nsIGfxInfo);

  // We can't do anything if we can't spoof the stuff we need.
  if (!(gfxInfo instanceof Ci.nsIGfxInfoDebug)) {
    do_test_finished();
    return;
  }

  gfxInfo.QueryInterface(Ci.nsIGfxInfoDebug);

  // Set the vendor/device ID, etc, to match the test file.
  gfxInfo.spoofVendorID("0xabcd");
  gfxInfo.spoofDeviceID("0x1234");
  gfxInfo.spoofDriverVersion("8.52.322.2201");
  gfxInfo.spoofVendorID2("0xdcba");
  gfxInfo.spoofDeviceID2("0x5678");
  gfxInfo.spoofDriverVersion2("8.52.322.2201");

  do_test_pending();

  createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "3", "8");
  await promiseStartupManager();

  function checkBlocklist() {
    // Matches via the secondary adapter.
    var status = gfxInfo.getFeatureStatusStr("CANVAS2D_ACCELERATION");
    Assert.equal(status, "BLOCKED_DEVICE");

    // Matches via the primary adapter.
    status = gfxInfo.getFeatureStatusStr("WEBRENDER");
    Assert.equal(status, "BLOCKED_DEVICE");

    do_test_finished();
  }

  Services.obs.addObserver(function () {
    // If we wait until after we go through the event loop, gfxInfo is sure to
    // have processed the gfxItems event.
    executeSoon(checkBlocklist);
  }, "blocklist-data-gfxItems");

  mockGfxBlocklistItemsFromDisk("../data/test_gfxBlocklist_AdapterMatch.json");
}
