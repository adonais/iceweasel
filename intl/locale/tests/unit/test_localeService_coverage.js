/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Locale tags with a private variant subtag: no build packages these, so the
// coverage lookup can only ever see the mock sources registered below (a
// multi-locale build ships a real coverage.json for plain "ja"/"de").
const LOC_NO_COVERAGE = "ja-nocov";
const LOC_COVERAGE = "de-cover";

// foo.ftl in LOC_COVERAGE: 10 messages, one ("msg-a") untranslated (ratio 0.9).
const COVERAGE_JSON = JSON.stringify({
  "browser/foo.ftl": { total: 10, missing: ["msg-a"] },
});

const resProto = Services.io
  .getProtocolHandler("resource")
  .QueryInterface(Ci.nsIResProtocolHandler);

const l10nReg = L10nRegistry.getInstance();

/**
 * The coverage lookup walks the negotiated app-locale chain: a locale that
 * ships no coverage.json (LOC_NO_COVERAGE) is skipped, and coverage comes from
 * the next chain entry that does provide it (LOC_COVERAGE).
 */
add_task(async function test_coverage_walks_past_locale_without_coverage() {
  const root = do_get_tempdir();
  root.append("l10n-coverage-chain");
  const covDir = root.clone();
  covDir.append(LOC_COVERAGE);
  await IOUtils.makeDirectory(covDir.path, { createAncestors: true });
  await IOUtils.writeUTF8(
    PathUtils.join(covDir.path, "coverage.json"),
    COVERAGE_JSON
  );

  resProto.setSubstitution("covtest", Services.io.newFileURI(root));

  l10nReg.registerSources([
    L10nFileSource.createMock(
      "covtest-nocov",
      "app",
      [LOC_NO_COVERAGE],
      "resource://covtest/{locale}/",
      []
    ),
    L10nFileSource.createMock(
      "covtest-cov",
      "app",
      [LOC_COVERAGE],
      "resource://covtest/{locale}/",
      []
    ),
  ]);

  const origAvailable = Services.locale.availableLocales;
  const origRequested = Services.locale.requestedLocales;

  registerCleanupFunction(() => {
    Services.locale.availableLocales = origAvailable;
    Services.locale.requestedLocales = origRequested;
    l10nReg.removeSources(["covtest-nocov", "covtest-cov"]);
    resProto.setSubstitution("covtest", null);
  });

  Services.locale.availableLocales = [LOC_NO_COVERAGE, LOC_COVERAGE, "en-US"];
  Services.locale.requestedLocales = [LOC_NO_COVERAGE, LOC_COVERAGE];

  Assert.deepEqual(
    Services.locale.appLocalesAsBCP47,
    [LOC_NO_COVERAGE, LOC_COVERAGE, "en-US"],
    "App locale chain is the coverage-less locale, the covered locale, then " +
      "the en-US last fallback"
  );

  Assert.strictEqual(
    Services.locale.areMessagesLocalized("browser/foo.ftl", ["msg-a"], ""),
    false,
    "A message missing from the covered locale is not localized " +
      "(chain walked past the coverage-less locale)"
  );

  Assert.strictEqual(
    Services.locale.areMessagesLocalized("browser/foo.ftl", ["msg-b"], ""),
    true,
    "A message present in the covered locale is localized"
  );

  // 9/10 translated in the covered locale.
  Assert.strictEqual(
    Services.locale.isLocalizedEnough("browser/foo.ftl", "", 0.85),
    true,
    "Coverage (0.9) clears a 0.85 threshold"
  );
  Assert.strictEqual(
    Services.locale.isLocalizedEnough("browser/foo.ftl", "", 0.95),
    false,
    "Coverage (0.9) fails a 0.95 threshold"
  );
});
