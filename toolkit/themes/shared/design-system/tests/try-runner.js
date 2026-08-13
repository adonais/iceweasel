/* eslint-disable no-console */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A small test runner/reporter for node-based tests,
 * which are run via taskcluster node(debugger).
 *
 * Adapted from:
 * https://searchfox.org/mozilla-central/rev/9cd4ea81e27db6b767f1d9bbbcf47da238dd64fa/browser/components/newtab/bin/try-runner.js
 */

const { readFileSync, readdirSync, rmSync } = require("fs");
const chalk = require("chalk");
const path = require("path");
const prettier = require("prettier");
const StyleDictionary = require("style-dictionary");
const config = require("../config/tokens-config.js");

// Mirror the design-system's real depth in the source tree (toolkit/themes/
// shared/design-system) so the relative destinations in the config (e.g.
// "../../../../browser/themes/shared/...") resolve to paths under tests/build/
// instead of escaping it.
const TEST_BUILD_PATH = "tests/build/toolkit/themes/shared/design-system/";
const PROJECT_ROOT = path.resolve(__dirname, "../../../../../");

function buildFilesWithTestConfig() {
  // Use our real config, just modify some values for the test. This prevents us
  // from re-building the CSS files that get checked in when we run the tests.
  let testConfig = Object.assign({}, config);
  testConfig.platforms.css.buildPath = TEST_BUILD_PATH;
  testConfig.platforms.tables.buildPath = TEST_BUILD_PATH;
  testConfig.platforms.figma.buildPath = TEST_BUILD_PATH;

  // This is effectively the same as running `npm run build` and allows us to
  // use the modified config.
  StyleDictionary.extend(testConfig).buildAllPlatforms();
}

/**
 * Every CSS file the build emits, derived from the config so we verify all of
 * them rather than a hand-maintained list.
 *
 * @returns {{ name: string, path: string, testPath: string }[]}
 *  `path` is the checked-in file (relative to the design-system dir, which is
 *  the cwd), `testPath` is where the test build writes the same file.
 */
function getBuiltCSSFiles() {
  return config.platforms.css.files.map(({ destination }) => ({
    name: destination,
    path: destination,
    testPath: path.join(TEST_BUILD_PATH, destination),
  }));
}

function logErrors(tool, errors) {
  for (const error of errors) {
    console.log(`TEST-UNEXPECTED-FAIL | ${tool} | ${error}`);
  }
  return errors;
}

function logStart(name) {
  console.log(`TEST-START | ${name}`);
}

const tests = {
  // Verify the CSS files build successfully and are up to date.
  async buildCSS() {
    logStart("build CSS");

    let errors = [];
    let currentCSS = {};
    let cssFiles = getBuiltCSSFiles();

    // Read the contents of our built CSS files.
    for (let { name, path: currentPath } of cssFiles) {
      currentCSS[name] = readFileSync(currentPath, "utf8");
    }

    try {
      buildFilesWithTestConfig();
    } catch {
      errors.push("CSS build did not run successfully");
    }

    let prettierConfig = require(path.resolve(PROJECT_ROOT, ".prettierrc.js"));

    // Build CSS files to the test directory and compare them to the current CSS
    // files that get checked in. If the contents don't match we either forgot
    // to build the files after making a change, or edited the CSS files directly.
    for (let { name, testPath } of cssFiles) {
      let builtCSS = readFileSync(testPath, "utf8");

      // Checked-in .css files are run through prettier by the build script, but
      // other generated files (e.g. the nova .scss) are not, so only normalize
      // the ones prettier touches.
      let comparison = name.endsWith(".css")
        ? await prettier.format(builtCSS, {
            ...prettierConfig,
            parser: "css",
            printWidth: 160,
          })
        : builtCSS;

      if (comparison !== currentCSS[name]) {
        errors.push(`${name} is out of date`);
      }

      if (builtCSS.includes("/** Unspecified **/")) {
        errors.push(
          "Tokens present in the 'Unspecified' section. Please update TOKEN_SECTIONS in tokens-config.js"
        );
      }
    }

    // Each component *.tokens.json (ignoring *.nova.tokens.json overrides)
    // should build to exactly one *.tokens.css. Independently scan the source
    // directories so we'd notice if a component's tokens stopped being built.
    let builtComponentCSS = cssFiles.filter(({ name }) =>
      name.endsWith(".tokens.css")
    );
    let componentSourceDirs = new Set(
      builtComponentCSS.map(({ name }) => path.dirname(name))
    );
    let componentTokenCount = [...componentSourceDirs].reduce(
      (count, dir) =>
        count +
        readdirSync(dir).filter(
          f => f.endsWith(".tokens.json") && !f.endsWith(".nova.tokens.json")
        ).length,
      0
    );

    if (!builtComponentCSS.length) {
      errors.push("No component CSS files were built");
    } else if (builtComponentCSS.length !== componentTokenCount) {
      errors.push(
        `Built ${builtComponentCSS.length} component CSS files but found ${componentTokenCount} *.tokens.json source files`
      );
    }

    logErrors("build CSS", errors);
    rmSync("tests/build", { recursive: true, force: true });
    return errors.length === 0;
  },
};

(function runTests() {
  let results = [];

  for (let testName of Object.keys(tests)) {
    results.push([testName, tests[testName]()]);
  }

  for (const [name, result] of results) {
    // Colorize output based on result.
    console.log(result ? chalk.green(`✓ ${name}`) : chalk.red(`✗ ${name}`));
  }

  const success = results.every(([, result]) => result);
  process.exitCode = success ? 0 : 1;
  console.log("CODE", process.exitCode);
})();
