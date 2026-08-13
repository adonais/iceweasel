/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Exercises the GTK user idle service. The service uses the
// org.gnome.Mutter.IdleMonitor DBus backend -- the cache-and-async-poll logic
// from bug 1962438 -- whenever that service is reachable on the session bus,
// i.e. on any GNOME session, X11 or Wayland, including the Wayland CI workers.
// Otherwise the backend is XScreenSaver and only the generic smoke assertions
// apply. The active backend cannot be queried directly, so we detect it from
// the service's own MOZ_LOG output rather than guessing from the desktop
// environment (XDG_CURRENT_DESKTOP does not survive into the test process under
// CI) or the window protocol (Mutter is used under XWayland too).

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function () {
  const idle = Cc["@mozilla.org/widget/useridleservice;1"].getService(
    Ci.nsIUserIdleService
  );

  // Backend-agnostic smoke checks.
  const first = idle.idleTime;
  Assert.equal(typeof first, "number", "idleTime is a number");
  Assert.greaterOrEqual(first, 0, "idleTime is non-negative");

  // Route the idle service's MOZ_LOG module to a file (its output is not
  // visible to the console service); logging.config.sync flushes each line so
  // the readbacks below see it. Enabled up front so it captures the poll used
  // to detect the active backend.
  const logBase = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "idle_mutter_test.log"
  );
  const logFile = `${logBase}-main.${Services.appinfo.processID}.moz_log`;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["logging.config.sync", true],
      ["logging.config.LOG_FILE", logBase],
      ["logging.nsIUserIdleService", 5],
    ],
  });
  registerCleanupFunction(() =>
    IOUtils.remove(logFile, { ignoreAbsent: true })
  );

  async function logIncludes(needle) {
    if (!(await IOUtils.exists(logFile))) {
      return false;
    }
    return (await IOUtils.readUTF8(logFile)).includes(needle);
  }

  // Detect the active backend from its log: a Mutter poll logs
  // "PollIdleTime() request", whereas the XScreenSaver backend logs
  // "UserIdleServiceX11::PollIdleTime". One idleTime read triggers a poll.
  void idle.idleTime;
  await TestUtils.waitForCondition(
    async () =>
      (await logIncludes("PollIdleTime() request")) ||
      (await logIncludes("UserIdleServiceX11")),
    "idle service served a poll we can attribute to a backend",
    100,
    100
  );
  if (!(await logIncludes("PollIdleTime() request"))) {
    info("Idle backend is not Mutter (XScreenSaver); skipping Mutter checks.");
    return;
  }
  info("Mutter idle backend active; exercising the cache path.");

  // Within the fresh-cache window (kCacheFreshMs == 1000ms) reads are served
  // from the cache without a new DBus poll. The cached value is advanced by
  // the time elapsed since it was sampled (bug 2053041), so repeated reads must
  // report a forward-moving value: returning a frozen value would make
  // nsUserIdleService misread the stall as a return from idle and re-arm its
  // timer in a tight loop.
  //
  // A background refresh re-samples mCachedIdleTime (logged as "Async handler
  // got N, cached"), which drops the reported value back to a fresh real
  // reading. Local user interaction can trigger that at any time, so fresh
  // readings that straddle a cache update are not comparable. Only readings
  // from a single cache sample -- an unbroken run of "returns cached (fresh)"
  // lines with no cache update in between -- advance monotonically, so we
  // collect the fresh readings split on each cache-update boundary and assert
  // within each run rather than across the whole capture.
  async function freshRuns() {
    if (!(await IOUtils.exists(logFile))) {
      return [];
    }
    const text = await IOUtils.readUTF8(logFile);
    const runs = [];
    let run = null;
    for (const m of text.matchAll(
      /returns cached \(fresh\) (\d+)|(Async handler got)/g
    )) {
      if (m[2]) {
        run = null; // A cache update ends the current run.
      } else {
        if (!run) {
          runs.push((run = []));
        }
        run.push(parseInt(m[1], 10));
      }
    }
    return runs;
  }

  // Drive fresh reads until at least one within-sample run shows advancement.
  await TestUtils.waitForCondition(
    async () => {
      void idle.idleTime;
      return (await freshRuns()).some(r => r.length >= 2 && r.at(-1) > r[0]);
    },
    "fresh-cache idle time advances with the wall clock (bug 2053041)",
    100,
    100
  );

  for (const run of await freshRuns()) {
    for (let i = 1; i < run.length; i++) {
      Assert.greaterOrEqual(
        run[i],
        run[i - 1],
        "fresh-cache idle time is non-decreasing within a cache sample"
      );
    }
  }

  // The fresh window must time out: once more than kCacheFreshMs has elapsed,
  // the next read takes the stale branch, returns the cached value, and kicks
  // off a background DBus refresh. Polling idleTime crosses that boundary
  // without an arbitrary fixed delay.
  await TestUtils.waitForCondition(
    () => {
      void idle.idleTime;
      return logIncludes("returns cached (stale)");
    },
    "cache freshness timed out and took the stale branch",
    100,
    100
  );

  // The background refresh's async DBus reply lands and updates the cache.
  await TestUtils.waitForCondition(
    () => logIncludes("Async handler got"),
    "background DBus refresh completed and re-cached the value",
    100,
    100
  );

  // Two paths are deliberately left untested here:
  //  - The cold "very stale" resync (cache older than kCacheStaleMs == 5000ms,
  //    which falls through to a synchronous wait). Every stale read above kicks
  //    a background refresh that re-stamps the cache, so reaching the very-stale
  //    state requires sitting >5s without touching idleTime -- i.e. an arbitrary
  //    fixed delay, which is both slow and flaky (see no-arbitrary-setTimeout).
  //  - The DBus poll timeout (kPollTimeoutMs, the "timed out" path). It only
  //    fires when the session bus stops replying, and there is no way to make a
  //    healthy Mutter IdleMonitor hang from a test.
  // Both are covered by manual MOZ_LOG inspection rather than automation.
});
