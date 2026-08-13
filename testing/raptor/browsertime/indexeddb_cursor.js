/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { logTest } = require("./utils/profiling");

module.exports = logTest(
  "indexedDB cursor test",
  async function (context, commands) {
    context.log.info("Starting an IndexedDB cursor");
    const post_startup_delay = context.options.browsertime.post_startup_delay;

    const test_url = context.options.browsertime.url;
    const iterations = context.options.browsertime.iterations;
    const cursor_mode = context.options.browsertime.cursor_mode;
    const direction = context.options.browsertime.direction || "next";

    const accepted_modes = ["continue", "continuePrimaryKey"];
    if (!accepted_modes.includes(cursor_mode)) {
      throw Error("Cursor mode " + cursor_mode + " is unknown.");
    }
    const accepted_directions = ["next", "prev"];
    if (!accepted_directions.includes(direction)) {
      throw Error("Direction " + direction + " is unknown.");
    }

    context.log.info("IndexedDB cursor URL = " + test_url);
    context.log.info("IndexedDB cursor iterations = " + iterations);
    context.log.info("IndexedDB cursor mode = " + cursor_mode);
    context.log.info("IndexedDB cursor direction = " + direction);

    context.log.info(
      "Waiting for %d ms (post_startup_delay)",
      post_startup_delay
    );

    await commands.navigate(test_url);

    const seleniumDriver = context.selenium.driver;

    await commands.wait.byTime(post_startup_delay);

    // Create and populate the database outside of the measured window: this
    // test is only interested in the cost of iterating the cursor, not in
    // writing the rows.
    await seleniumDriver.executeAsyncScript(`
        const notifyDone = arguments[arguments.length - 1];

        const iterations = ${iterations};

        // Every row shares the same index value, matching the worst case
        // reported in bug 1899194 where a cursor has to repeatedly break
        // ties on the object store key.
        function populate(db) {
          const store = db
            .transaction("store", "readwrite")
            .objectStore("store");
          return Promise.all(
            Array.from({ length: iterations }, (_, i) => {
              const record = { key: i, indexValue: 0 };
              const rq = store.add(record);
              return new Promise((res_ad, rej_ad) => {
                rq.onsuccess = () => { res_ad(); };
                rq.onerror = e => { rej_ad(e); };
              });
            })
          );
        }

        function upgradePromise() {
          const open_db = indexedDB.open("cursordb");
          return new Promise((res_upgrade, rej_upgrade) => {
            open_db.onupgradeneeded = e => {
              const store = e.target.result.createObjectStore("store", {
                keyPath: "key",
              });
              store.createIndex("index", "indexValue", { unique: false });
            };
            open_db.onsuccess = e => { res_upgrade(e.target.result); };
            open_db.onerror = e => { rej_upgrade(e); };
          });
        }

        upgradePromise()
          .then(db => populate(db).then(() => db.close()))
          .then(() => { notifyDone(); })
          .catch(e => { notifyDone("populate failed: " + e); });
      `);

    await commands.measure.start();
    const time_duration = await seleniumDriver.executeAsyncScript(`
        const notifyDone = arguments[arguments.length - 1];

        const iterations = ${iterations};
        const cursorMode = "${cursor_mode}";
        const direction = "${direction}";
        const primaryKeyStep = direction === "prev" ? -1 : 1;

        function iterateCursor(db) {
          return new Promise((res_iter, rej_iter) => {
            const index = db
              .transaction("store", "readonly")
              .objectStore("store")
              .index("index");

            const rq = index.openCursor(null, direction);
            let count = 0;

            rq.onsuccess = e => {
              const cursor = e.target.result;
              if (!cursor) {
                res_iter(count);
                return;
              }
              count++;
              if (cursorMode === "continuePrimaryKey") {
                cursor.continuePrimaryKey(
                  cursor.key,
                  cursor.primaryKey + primaryKeyStep
                );
              } else {
                cursor.continue();
              }
            };
            rq.onerror = e => { rej_iter(e.target.error); };
          });
        }

        function openPromise() {
          const open_db = indexedDB.open("cursordb");
          return new Promise((res_open, rej_open) => {
            open_db.onsuccess = e => { res_open(e.target.result); };
            open_db.onerror = e => { rej_open(e.target.error); };
          });
        }

        const startTime = performance.now();
        openPromise()
          .then(iterateCursor)
          .then(visitedCount => {
            if (visitedCount !== iterations) {
              throw new Error(
                "Cursor visited " +
                  visitedCount +
                  " rows, expected " +
                  iterations
              );
            }
            notifyDone(performance.now() - startTime);
          })
          .catch(e => { notifyDone("iterateCursor failed: " + e); });
      `);
    await commands.measure.stop();

    context.log.info("Time duration was " + time_duration);

    await commands.measure.addObject({
      custom_data: { time_duration },
    });

    context.log.info("IndexedDB cursor ended.");
    return true;
  }
);
