/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that logins with timestamps outside the range of a JS Date can still be
 * added to the Rust storage with their metadata, as the migration does.
 */

"use strict";

const { LoginManagerRustStorage } = ChromeUtils.importESModule(
  "resource://gre/modules/storage-rust.sys.mjs"
);

const negativeTimestamp = -1_000_000;
const tooLargeTimestamp = 18446744071857664;

add_task(async function test_add_with_invalid_timestamps() {
  const rustStore = new LoginManagerRustStorage();
  await rustStore.initialize();

  for (const invalidTimestamp of [negativeTimestamp, tooLargeTimestamp]) {
    info(`Adding a login with timestamps set to ${invalidTimestamp}`);
    const login = TestData.formLogin({ origin: "https://example.com" });
    login.QueryInterface(Ci.nsILoginMetaInfo);
    login.timeCreated = invalidTimestamp;
    login.timeLastUsed = invalidTimestamp;
    login.timePasswordChanged = invalidTimestamp;
    login.timeLastBreachAlertDismissed = invalidTimestamp;
    Assert.greater(
      login.timePasswordChanged,
      Number.MAX_SAFE_INTEGER,
      "the test login has a timestamp that is not a safe integer"
    );

    const before = Date.now();
    const [{ login: added, error }] = await rustStore.addLoginsWithResultsAsync(
      [login]
    );
    Assert.ok(!error, "the login is added");
    for (const pname of [
      "timeCreated",
      "timeLastUsed",
      "timePasswordChanged",
    ]) {
      Assert.greaterOrEqual(added[pname], before, `${pname} is replaced`);
      Assert.lessOrEqual(
        added[pname],
        Date.now(),
        `${pname} is not in the future`
      );
    }
    Assert.ok(
      !added.timeLastBreachAlertDismissed,
      "timeLastBreachAlertDismissed is dropped"
    );

    await rustStore.removeAllLoginsAsync();
  }
});
