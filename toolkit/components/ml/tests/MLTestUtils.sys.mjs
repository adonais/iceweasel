/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utilities for ML component and evaluation testing.
 */
export const MLTestUtils = {
  /**
   * Report eval data out to stdout, which will be picked up by the mozperftest test
   * harness for analysis and evaluation metrics. This function should only be used from
   * browser_eval tests via `./mach eval`
   *
   * The data is logged in two formats:
   * 1. As a dump with "evalDataPayload |" prefix for parsing
   * 2. As a formatted dump for human readability
   *
   * @param {any} data - JSON serializable data containing evaluation results.
   * @param {boolean} prettyPrint - Optionally print the results in a human readable
   *   format as well.
   */
  reportEvalData(data, prettyPrint = false) {
    const payload = JSON.stringify(data);
    dump("evalDataPayload | " + payload + "\n");
    if (prettyPrint) {
      dump("-------------------------------------\n");
      dump("Eval data:\n");
      dump(JSON.stringify(data, null, 2));
      dump("\n");
    }
  },
};
