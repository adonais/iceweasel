/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const platformName = AppConstants.platform == "android" ? "android" : "desktop";

add_task(async function dummy_test() {
  info("perfMetrics", { metrics1: 1 });
  Assert.ok(platformName);
});

var perfMetadata = {
  owner: "Performance Testing Team",
  name: "Example",
  description: "The description of the example test.",
  supportedBrowsers: ["Firefox"],
  supportedPlatforms: ["Desktop"],
  options: {
    default: { perfherder: true },
  },
};
