/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that finalizing statements on the main thread while the async thread
 * is stepping a statement on the same connection does not deadlock.
 */

const ROWS = 100000;

add_task(async function test_finalize_during_async_execution() {
  const db = getOpenedUnsharedDatabase();

  for (let i = 0; i < 5; i++) {
    const stmt = db.createStatement(
      `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c LIMIT ${ROWS})
       SELECT x FROM c`
    );
    let rows = 0;
    let done = false;
    const promise = executeAsync(stmt, resultSet => {
      while (resultSet.getNextRow()) {
        rows++;
      }
    }).finally(() => {
      done = true;
    });
    stmt.finalize();

    while (!done) {
      for (let j = 0; j < 100; j++) {
        db.createStatement("SELECT 1").finalize();
      }
      await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
    }

    const reason = await promise;
    Assert.equal(
      reason,
      Ci.mozIStorageStatementCallback.REASON_FINISHED,
      "Async execution should finish"
    );
    Assert.equal(rows, ROWS, "All rows should be returned");
  }

  await asyncClose(db);
});
