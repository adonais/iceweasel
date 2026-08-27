"use strict";

// eslint-disable-next-line
const ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const PAGE_URL = ROOT + "file_access_sanitized_pref.html";

const SANITIZED_PREF = "extensions.webextensions.uuids";

add_task(async function sanitized_pref_test() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["fission.omitBlocklistedPrefsInSubprocesses", true],
      ["fission.enforceBlocklistedPrefsInSubprocesses", false],
    ],
  });

  Services.fog.testResetFOG();

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function () {}
  );

  // The event is recorded in the content process, so flush child-process data
  // to the parent before reading it, and wait until our specific pref shows up.
  let events = await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    let recorded = Glean.security.prefUsageContentProcess.testGetValue();
    return recorded && recorded.some(e => e.extra?.value == SANITIZED_PREF)
      ? recorded
      : null;
  }, `waiting for a pref usage event for '${SANITIZED_PREF}'`);

  // We may have more than one event entry because we take two paths in the
  // preference code in this access pattern, but in other patterns we may only
  // take one of those paths, so we happen to count it twice this way. No big
  // deal. Sometimes we even have 4 or 6 based on timing.
  let count = events.filter(e => e.extra?.value == SANITIZED_PREF).length;
  dump(
    `We found ${events.length} events, ${count} of which were '${SANITIZED_PREF}'.\n`
  );

  Assert.greater(count, 0, `We did not find an event for '${SANITIZED_PREF}'`);

  await SpecialPowers.popPrefEnv();
});
