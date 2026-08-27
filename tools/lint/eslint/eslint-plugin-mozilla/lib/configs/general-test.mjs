/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Parent config file for all test files.
// This should be applied by the configuration before any other test
// configurations.

import noUnsanitizedPlugin from "eslint-plugin-no-unsanitized";

export default {
  name: "mozilla/general-test",
  plugins: {
    "no-unsanitized": noUnsanitizedPlugin,
  },

  rules: {
    "mozilla/import-content-task-globals": "error",
    "mozilla/import-headjs-globals": "error",
    "mozilla/mark-test-function-used": "error",
    "mozilla/no-arbitrary-setTimeout": "error",

    // Bug 1883707 - Turn off no-console in tests at the moment.
    "no-console": "off",
    // Turn off no-unsanitized for tests, as we do want to be able to use
    // these for testing.
    "no-unsanitized/method": "off",
    "no-unsanitized/property": "off",
  },
};
