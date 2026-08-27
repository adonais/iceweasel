/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import privileged from "../environments/privileged.mjs";
import xpcshell from "../environments/xpcshell.mjs";

// Parent config file for all xpcshell files.

export default {
  languageOptions: {
    globals: {
      ...privileged.globals,
      ...xpcshell.globals,
      afterEach: false,
      beforeEach: false,
      describe: false,
      it: false,
    },
  },

  name: "mozilla/xpcshell-test",

  rules: {
    "mozilla/no-comparison-or-assignment-inside-ok": "error",
    "mozilla/no-useless-run-test": "error",
  },
};
