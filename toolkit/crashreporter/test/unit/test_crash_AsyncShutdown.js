/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test that AsyncShutdown report errors correctly

// Note: these functions are evaluated in their own process, hence the need
// to import modules into each function.

function setup_crash() {
  const { AsyncShutdown } = ChromeUtils.importESModule(
    "resource://gre/modules/AsyncShutdown.sys.mjs"
  );

  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  Services.prefs.setIntPref("toolkit.asyncshutdown.crash_timeout", 10);

  let TOPIC = "testing-async-shutdown-crash";
  let phase = AsyncShutdown._getPhase(TOPIC);
  phase.addBlocker("A blocker that is never satisfied", function () {
    dump("Installing blocker\n");
    let deferred = Promise.withResolvers();
    return deferred.promise;
  });

  Services.obs.notifyObservers(null, TOPIC);
  dump(new Error().stack + "\n");
  dump("Waiting for crash\n");
}

function after_crash(mdump, extra) {
  info("after crash: " + extra.AsyncShutdownTimeout);
  let data = JSON.parse(extra.AsyncShutdownTimeout);
  Assert.equal(data.phase, "testing-async-shutdown-crash");
  Assert.equal(data.conditions[0].name, "A blocker that is never satisfied");
  // This test spawns subprocesses by using argument "-e" of xpcshell, so
  // this is the filename known to xpcshell.
  Assert.equal(data.conditions[0].filename, "-e");
}

// Test that AsyncShutdown + IOUtils reports errors correctly.,

function setup_ioutils_crash() {
  Services.prefs.setIntPref("toolkit.asyncshutdown.crash_timeout", 1);

  IOUtils.profileBeforeChange.addBlocker(
    "Adding a blocker that will never be resolved",
    () => Promise.withResolvers().promise
  );

  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWN
  );
  dump("Waiting for crash\n");
}

function after_ioutils_crash(mdump, extra) {
  info("after IOUtils crash: " + extra.AsyncShutdownTimeout);
  let data = JSON.parse(extra.AsyncShutdownTimeout);
  Assert.equal(
    data.phase,
    "IOUtils: waiting for profileBeforeChange IO to complete"
  );
}

// Test that main thread jank does not stretch the countdown to the crash.
// nsTerminator enforces the same deadline from a thread that never janks, so a
// countdown that drifts loses the race and we never get this annotation at all.

const JANK_CRASH_TIMEOUT_MS = 5000;
const JANK_CHUNK_MS = 1500;

function setup_jank_crash(crashTimeoutMs, jankChunkMs) {
  const { AsyncShutdown } = ChromeUtils.importESModule(
    "resource://gre/modules/AsyncShutdown.sys.mjs"
  );

  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  Services.prefs.setIntPref(
    "toolkit.asyncshutdown.crash_timeout",
    crashTimeoutMs
  );

  // Keep the main thread busy in chunks longer than the countdown's beat, so
  // that beats get dropped for as long as the phase spins the event loop. Each
  // chunk lets a single beat through, which is the drift that used to make us
  // lose the race.
  let jank = () => {
    let until = ChromeUtils.now() + jankChunkMs;
    while (ChromeUtils.now() < until) {
      // Busy wait.
    }
    Services.tm.dispatchToMainThread(jank);
  };
  Services.tm.dispatchToMainThread(jank);

  let TOPIC = "testing-async-shutdown-jank";
  let phase = AsyncShutdown._getPhase(TOPIC);
  let start;
  phase.addBlocker(
    "A blocker that is never satisfied",
    () => Promise.withResolvers().promise,
    { fetchState: () => ({ elapsed: ChromeUtils.now() - start }) }
  );

  start = ChromeUtils.now();
  Services.obs.notifyObservers(null, TOPIC);
  dump("Waiting for crash\n");
}

function after_jank_crash(mdump, extra) {
  info("after jank crash: " + extra.AsyncShutdownTimeout);
  let data = JSON.parse(extra.AsyncShutdownTimeout);
  Assert.equal(data.phase, "testing-async-shutdown-jank");

  let { elapsed } = data.conditions[0].state;
  info("Crashed after " + elapsed + "ms");

  // Measured against a monotonic clock we crash at the timeout, plus at most
  // the jank chunk that is running when the deadline passes.
  let wallClock = JANK_CRASH_TIMEOUT_MS + JANK_CHUNK_MS;
  // A countdown that instead waits for a fixed number of delivered beats
  // cannot get there before the jank has let that many beats through.
  let beatCounted = (JANK_CRASH_TIMEOUT_MS / 1000 + 1) * JANK_CHUNK_MS;

  Assert.greaterOrEqual(
    elapsed,
    JANK_CRASH_TIMEOUT_MS,
    "We did not crash early"
  );
  Assert.less(
    elapsed,
    (wallClock + beatCounted) / 2,
    "The countdown was not stretched by main thread jank"
  );
}

add_task(async function run_test() {
  await do_crash(setup_crash, after_crash);
  await do_crash(setup_ioutils_crash, after_ioutils_crash);
  await do_crash(
    `(${setup_jank_crash.toSource()})(${JANK_CRASH_TIMEOUT_MS}, ${JANK_CHUNK_MS});`,
    after_jank_crash
  );
});
