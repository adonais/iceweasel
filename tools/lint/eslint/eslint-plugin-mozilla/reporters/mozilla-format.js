/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file outputs the format that treeherder requires. If we integrate
 * these tests with ./mach, then we may replace this with a json handler within
 * mach itself.
 */

/**
 * @import { Reporter } from "@jest/reporters"
 * @import { AggregatedResult, Test, TestCaseResult, TestContext } from "@jest/test-result"
 */

// This is a non-production file that needs to log.
/* eslint-disable no-console */

"use strict";

var path = require("path");

/**
 * A reporter for Jest that outputs results in the format Treeherder expects.
 *
 * @implements {Reporter}
 */
class MozillaFormatter {
  onRunStart() {
    console.log("SUITE-START | eslint-plugin-mozilla");
  }

  /**
   * @param {Test} test
   * @param {TestCaseResult} testCaseResult
   */
  onTestCaseResult(test, testCaseResult) {
    let title = testCaseResult.fullName.replace(/\n/g, "|");
    let fileName = path.basename(test.path);

    if (testCaseResult.status == "passed") {
      console.log(`TEST-PASS | ${fileName} | ${title}`);
    } else if (testCaseResult.status == "failed") {
      let message = testCaseResult.failureMessages[0]?.split("\n")[0];
      console.log(`TEST-UNEXPECTED-FAIL | ${fileName} | ${title} | ${message}`);
    }
  }

  /**
   * @param {Set<TestContext>} testContexts
   * @param {AggregatedResult} results
   */
  onRunComplete(testContexts, results) {
    // Space the results out visually with an additional blank line.
    console.log("");
    console.log("INFO | Result summary:");
    console.log(`INFO | Passed: ${results.numPassedTests}`);
    console.log(`INFO | Failed: ${results.numFailedTests}`);
    console.log("SUITE-END");
    // Space the failures out visually with an additional blank line.
    console.log("");
    console.log("Failure summary:");

    for (let result of results.testResults) {
      if (result.numFailingTests) {
        let fileName = path.basename(result.testFilePath);
        for (let fileResult of result.testResults) {
          if (fileResult.status == "failed") {
            console.log("");
            let title = fileResult.fullName.replace(/\n/g, "|");

            console.log(
              `TEST-UNEXPECTED-FAIL | ${fileName} | ${title} | ${fileResult.failureDetails[0]?.message}`
            );
          }
        }
      }
    }
  }
}

module.exports = MozillaFormatter;
