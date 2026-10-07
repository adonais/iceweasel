/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MONITOR_ERROR_CODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const { MONITOR_ERROR_L10N_IDS, monitorErrorL10nId } =
  ChromeUtils.importESModule(
    "chrome://browser/content/aiwindow/components/monitor-error-copy.mjs"
  );

const localization = new Localization(
  [
    "preview/aiWindow.ftl",
    "branding/brand.ftl",
    "toolkit/branding/brandings.ftl",
  ],
  true
);

/**
 * monitor-error-copy.mjs repeats the error codes as plain strings because the
 * card can't import the model layer, so the two have to be checked against
 * each other here.
 */
add_task(async function test_every_error_code_has_copy() {
  for (const code of Object.values(MONITOR_ERROR_CODES)) {
    Assert.ok(
      MONITOR_ERROR_L10N_IDS[code],
      `The ${code} error code has user-facing copy.`
    );
  }

  const knownCodes = new Set(Object.values(MONITOR_ERROR_CODES));
  for (const code of Object.keys(MONITOR_ERROR_L10N_IDS)) {
    Assert.ok(
      knownCodes.has(code),
      `The copy for ${code} still matches a real error code.`
    );
  }
});

add_task(async function test_copy_resolves_to_a_string() {
  for (const [code, l10nId] of Object.entries(MONITOR_ERROR_L10N_IDS)) {
    const value = await localization.formatValue(l10nId);
    Assert.ok(
      value && !value.includes("{"),
      `${l10nId} (${code}) resolves to a fully substituted string.`
    );
  }
});

add_task(function test_unknown_codes_fall_back() {
  // History entries written before error codes existed have no errorCode, and
  // a newer profile can carry a code this build doesn't know about.
  Assert.equal(
    monitorErrorL10nId(undefined),
    MONITOR_ERROR_L10N_IDS.unknown_error,
    "A missing error code falls back to the generic message."
  );
  Assert.equal(
    monitorErrorL10nId("code_from_the_future"),
    MONITOR_ERROR_L10N_IDS.unknown_error,
    "An unrecognized error code falls back to the generic message."
  );
});
