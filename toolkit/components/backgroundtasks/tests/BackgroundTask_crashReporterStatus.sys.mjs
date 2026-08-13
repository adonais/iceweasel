/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Dump the status of crash reporting utilities.
 */
export async function runBackgroundTask() {
  let testUtils = Cc[
    "@mozilla.org/toolkit/crashreporter-test-utils;1"
  ].getService(Ci.nsICrashReporterTestUtils);

  let cr = Services.appinfo;

  function probe(getter) {
    try {
      return { value: String(getter()) };
    } catch (ex) {
      return { error: ex.result };
    }
  }

  let info = {
    crashReporterEnabled: cr.crashReporterEnabled,
    crashHelperPid: testUtils.getCrashHelperPid(),
    serverURL: probe(() => cr.serverURL?.spec),
    minidumpPath: probe(() => cr.minidumpPath?.path),
  };

  dump("CRASH_INFO=" + JSON.stringify(info) + "\n");
  return 0;
}
